// QML completion for CodeMirror 6, driven by types.json.
//
// The index knows every exported type, what it inherits, and its members. This
// file adds the part the index cannot know: where the cursor is. A cheap scan
// of the text before the cursor tracks the stack of open object blocks and the
// ids declared in the file; the completion source then offers what fits:
//   object scope     members of the enclosing type, on<Signal> handlers, attached
//                    types (Keys., Layout., ToolTip.), child type names, QML keywords
//   after `name.`    members of that property/chain type, of that id's type, or the
//                    attached members / enum values of a type (including Qt.*)
//   after `prop:`    enum values, Qt.* flags, true/false, colors, ids
// No type inference through arbitrary JS expressions; that is qmlls's job.

const KEYWORDS = ['property', 'readonly property', 'required property', 'signal', 'function', 'id', 'import', 'Component'];
const BASIC_TYPES = ['int', 'real', 'bool', 'string', 'color', 'var', 'list<QtObject>', 'url', 'date'];
const COLOR_NAMES = [
  'default', 'transparent', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'gray', 'ansi:black', 'ansi:red', 'ansi:green', 'ansi:yellow', 'ansi:blue', 'ansi:magenta', 'ansi:cyan', 'ansi:white',
  'ansi:brightblack', 'ansi:brightred', 'ansi:brightgreen', 'ansi:brightyellow', 'ansi:brightblue', 'ansi:brightmagenta',
  'ansi:brightcyan', 'ansi:brightwhite', '"#0d1117"', '"#c9d1d9"', '"#2cde85"', '"#00ff66"',
];

const QT_ENUMS = {
  'Qt::FocusPolicy': ['StrongFocus', 'TabFocus', 'ClickFocus', 'NoFocus', 'WheelFocus'],
  'Qt::Alignment': ['AlignLeft', 'AlignRight', 'AlignHCenter', 'AlignVCenter', 'AlignTop', 'AlignBottom', 'AlignCenter'],
  'Qt::Orientation': ['Horizontal', 'Vertical'],
  'Qt::MouseButton': ['NoButton', 'LeftButton', 'RightButton', 'MiddleButton', 'AllButtons'],
  'Qt::MouseButtons': ['NoButton', 'LeftButton', 'RightButton', 'MiddleButton', 'AllButtons'],
  'Qt::KeyboardModifier': ['NoModifier', 'ShiftModifier', 'ControlModifier', 'AltModifier', 'MetaModifier'],
  'Qt::Key': [
    'Key_Escape', 'Key_Return', 'Key_Enter', 'Key_Space', 'Key_Tab', 'Key_Backtab',
    'Key_Up', 'Key_Down', 'Key_Left', 'Key_Right', 'Key_Home', 'Key_End',
    'Key_PageUp', 'Key_PageDown', 'Key_Backspace', 'Key_Delete', 'Key_Q', 'Key_R', 'Key_Slash',
  ],
};

function makeBlockApply(typeName) {
  return (view, _completion, from, to) => {
    const lineText = view.state.doc.lineAt(from).text;
    const pad = (lineText.match(/^\s*/) || [''])[0];
    const inner = `${typeName} {\n${pad}    `;
    const full = `${inner}\n${pad}}`;
    view.dispatch({
      changes: { from, to, insert: full },
      selection: { anchor: from + inner.length },
    });
  };
}

export function createQmlCompletion(index) {
  const types = index.types;

  // ---- type model helpers ---------------------------------------------------
  const chain = (name) => {
    const out = [];
    for (let t = types[name]; t && !out.includes(t); t = types[t.inherits]) {
      out.push(t);
      if (!t.inherits) break;
    }
    return out;
  };
  const members = (name) => {
    const seen = new Set(), props = [], signals = [], methods = [];
    for (const t of chain(name)) {
      for (const p of t.properties) if (!seen.has(p.name)) { seen.add(p.name); props.push(p); }
      for (const s of t.signals) if (!seen.has('sig:' + s.name)) { seen.add('sig:' + s.name); signals.push(s); }
      for (const m of t.methods) if (!seen.has('fn:' + m.name)) { seen.add('fn:' + m.name); methods.push(m); }
    }
    return { props, signals, methods };
  };
  const enumsOf = (name) => Object.assign({}, ...chain(name).map((t) => t.enums));
  const handlerName = (signal) => 'on' + signal[0].toUpperCase() + signal.slice(1);
  const propertyType = (typeName, prop) => members(typeName).props.find((p) => p.name === prop)?.type;
  const attachedPropertyType = (typeName, prop) => {
    const t = types[typeName];
    if (!t) return undefined;
    const direct = (t.attached || []).find((p) => p.name === prop)?.type;
    if (direct) return direct;
    if (!t.creatable && !t.singleton) return propertyType(typeName, prop);
    return undefined;
  };

  // Types used as `Name.member` inside an item: those with attached members, and
  // non-creatable types that carry signals or properties of their own (Keys, ToolTip).
  const attachedTypes = Object.entries(types)
    .filter(([, t]) => (t.attached && t.attached.length) || (!t.creatable && !t.singleton && (t.signals.length || t.properties.length) && t.module.startsWith('QmlTui')))
    .map(([n]) => n);
  const creatableTypes = Object.entries(types).filter(([, t]) => t.creatable).map(([n]) => n);
  const singletons = Object.entries(types).filter(([, t]) => t.singleton).map(([n]) => n);

  function resolveChainType(parts, enclosing, ids) {
    if (!parts.length) return null;
    const first = parts[0];
    let curType = null;
    let startIdx = 1;
    if (ids[first]) {
      curType = ids[first];
    } else if (first === 'parent' && enclosing) {
      curType = 'Item';
    } else if (types[first] && parts.length > 1) {
      if (types[first].singleton) {
        curType = first;
      } else {
        curType = attachedPropertyType(first, parts[1]) || null;
        startIdx = 2;
      }
    } else if (enclosing) {
      curType = propertyType(enclosing, first) || null;
    }
    for (let k = startIdx; k < parts.length && curType; k++) {
      curType = types[curType] ? propertyType(curType, parts[k]) : null;
    }
    return curType && types[curType] ? curType : null;
  }

  function resolveAssignedProperty(propExpr, enclosing, ids) {
    const parts = propExpr.split('.');
    if (parts.length === 1) {
      return { owner: enclosing, ptype: enclosing ? propertyType(enclosing, parts[0]) || '' : '' };
    }
    if (parts.length === 2 && types[parts[0]]) {
      const ptype = attachedPropertyType(parts[0], parts[1]) || '';
      return { owner: parts[0], ptype };
    }
    const owner = resolveChainType(parts.slice(0, -1), enclosing, ids);
    return { owner: owner || enclosing, ptype: owner ? propertyType(owner, parts[parts.length - 1]) || '' : '' };
  }

  // ---- cursor context -----------------------------------------------------------
  // Scans the text before `pos`. Returns the enclosing object type (or null when
  // inside a JS block), the id table, and the text of the current line so far.
  function context(doc, pos) {
    const text = doc.sliceString(0, pos);
    const full = doc.toString();
    const ids = {};
    for (const m of full.matchAll(/([A-Z][\w.]*)\s*\{[^{}]*?\bid:\s*([a-z_]\w*)/g)) ids[m[2]] = m[1];
    const stack = [];   // entries: { type: 'Rectangle' | null }
    let i = 0, inString = null;
    while (i < text.length) {
      const c = text[i];
      if (inString) { if (c === '\\') i++; else if (c === inString) inString = null; i++; continue; }
      if (c === '"' || c === "'" || c === '`') { inString = c; i++; continue; }
      if (c === '/' && text[i + 1] === '/') { const nl = text.indexOf('\n', i); i = nl < 0 ? text.length : nl; continue; }
      if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 2; continue; }
      if (c === '{') {
        const before = text.slice(Math.max(0, i - 80), i);
        const m = before.match(/([A-Z][\w]*(?:\.[A-Z]\w*)?)\s*$/);
        let blockType = m ? m[1].split('.').pop() : null;
        if (!blockType) {
          const parentType = stack[stack.length - 1]?.type;
          const gm = parentType && before.match(/(?:^|[;\n{])\s*([A-Za-z_]\w*(?:\.[a-z_]\w*)*)\s*$/);
          if (gm && gm[1] !== 'else') {
            const resolved = resolveChainType(gm[1].split('.'), parentType, ids);
            if (resolved && types[resolved]) blockType = resolved;
          }
        }
        stack.push({ type: blockType });
        i++; continue;
      }
      if (c === '}') { stack.pop(); i++; continue; }
      i++;
    }
    const line = text.slice(text.lastIndexOf('\n') + 1);
    const top = stack[stack.length - 1];
    return { enclosing: top ? top.type : undefined, inJs: top && top.type === null, ids, line, depth: stack.length };
  }

  const dedupe = (opts) => { const seen = new Set(); return opts.filter((o) => !seen.has(o.label) && seen.add(o.label)); };

  // ---- completion source --------------------------------------------------------
  return function qmlCompletion(ctx) {
    const word = ctx.matchBefore(/[\w.]*/);
    if (!word) return null;
    const { enclosing, inJs, ids, line } = context(ctx.state.doc, ctx.pos);
    const typed = word.text;
    const options = [];
    const add = (label, type, detail, boost = 0, apply) => options.push({ label, type, detail, boost, apply });

    // 1. `foo.` member access ------------------------------------------------------
    const dot = typed.lastIndexOf('.');
    if (dot >= 0) {
      const head = typed.slice(0, dot);
      const from = word.from + dot + 1;
      const offer = (typeName) => {
        const m = members(typeName);
        for (const p of m.props) add(p.name, 'property', p.type);
        for (const s of m.signals) add(s.name, 'event', `signal(${(s.params || []).map(([n, t]) => `${t} ${n}`).join(', ')})`);
        for (const f of m.methods) add(f.name, 'function', `(${(f.params || []).map(([n]) => n).join(', ')})`, 0, f.name + '(');
      };
      if (head === 'Qt') {
        add('quit', 'function', '()', 2, 'quit()');
        for (const [group, vals] of Object.entries(QT_ENUMS)) {
          for (const v of vals) add(v, 'enum', group);
        }
      } else if (types[head]) {
        const t = types[head];
        for (const [en, values] of Object.entries(enumsOf(head))) for (const v of values) add(v, 'enum', `${head}.${en}`);
        for (const a of t.attached || []) add(a.name, 'property', a.type);
        for (const asig of t.attachedSignals || []) {
          add(handlerName(asig.name), 'event', 'attached signal handler', 1, handlerName(asig.name) + ': ');
        }
        if (!t.creatable && !t.singleton && attachedTypes.includes(head)) {
          for (const s of t.signals) add(handlerName(s.name), 'event', 'attached signal handler', 1, handlerName(s.name) + ': ');
          for (const p of t.properties) add(p.name, 'property', p.type);
        }
        if (t.singleton) offer(head);
      } else {
        const resolved = resolveChainType(head.split('.'), enclosing, ids);
        if (resolved) offer(resolved);
      }
      return options.length ? { from, options: dedupe(options), validFor: /^\w*$/ } : null;
    }

    // 2. value position: `prop: <cursor>` ------------------------------------------
    const valueMatch = line.match(/^\s*([A-Za-z_]\w*(?:\.[a-z_]\w*)*)\s*:\s*([\w.]*)$/);
    if (valueMatch && enclosing) {
      const prop = valueMatch[1];
      const { owner, ptype } = resolveAssignedProperty(prop, enclosing, ids);
      const ownerEnums = owner ? enumsOf(owner) : {};
      if (owner && ownerEnums[ptype]) {
        for (const v of ownerEnums[ptype]) add(`${owner}.${v}`, 'enum', ptype, 2);
      }
      for (const [typeOwner, t] of Object.entries(types)) {
        if (t.enums[ptype] && (!owner || !chain(owner).includes(t))) {
          for (const v of t.enums[ptype]) add(`${typeOwner}.${v}`, 'enum', ptype, 1);
        }
      }
      if (QT_ENUMS[ptype]) {
        for (const v of QT_ENUMS[ptype]) add(`Qt.${v}`, 'enum', ptype, 2);
      }
      if (ptype === 'bool') { add('true', 'keyword', 'bool', 2); add('false', 'keyword', 'bool', 2); }
      if (ptype === 'color') {
        for (const sc of ['QmlTui.defaultColor', 'QmlTui.transparent', 'QmlTui.invalidColor']) {
          add(sc, 'constant', 'color', 2);
        }
        for (const c of COLOR_NAMES) add(c.startsWith('"') ? c : `"${c}"`, 'constant', 'color', 1);
      }
      for (const [id, t] of Object.entries(ids)) add(id, 'variable', t);
      add('parent', 'variable', 'Item');
      add('Qt', 'namespace', 'Qt');
      for (const s of singletons) add(s, 'namespace', 'singleton');
      if (types[ptype]?.creatable) add(`${ptype} {}`, 'class', 'inline object');
      if (ptype === 'Item') add('Text { text: "" }', 'class', 'inline Text item', 3);
      return options.length ? { from: word.from, options: dedupe(options), validFor: /^[\w.]*$/ } : null;
    }

    // 3. inside a JS block: ids, singletons, the enclosing item's members -------------
    if (inJs) {
      for (const [id, t] of Object.entries(ids)) add(id, 'variable', t, 1);
      add('Qt', 'namespace', 'Qt', 1);
      for (const s of singletons) add(s, 'namespace', 'singleton');
      add('parent', 'variable', 'Item'); add('console.log', 'function', '');
      return { from: word.from, options, validFor: /^[\w.]*$/ };
    }

    // 4. object scope --------------------------------------------------------------
    if (enclosing) {
      const m = members(enclosing);
      for (const p of m.props) {
        if (!p.readonly) {
          add(p.name, 'property', p.type, 3, p.name + ': ');
        } else if (p.type === 'Anchors' || p.type === 'Border' || p.name === 'popup') {
          add(p.name, 'property', p.type, 3, makeBlockApply(p.name));
        } else if (p.type.startsWith('list<') && !['data', 'children', 'ansiPalette'].includes(p.name)) {
          add(p.name, 'property', p.type, 2, p.name + ': ');
        }
      }
      for (const s of m.signals) add(handlerName(s.name), 'event', `signal ${s.name}`, 2, handlerName(s.name) + ': ');
      for (const p of m.props) if (!p.readonly) add(`on${p.name[0].toUpperCase()}${p.name.slice(1)}Changed`, 'event', `${p.name} changed`, 0, `on${p.name[0].toUpperCase()}${p.name.slice(1)}Changed: `);
      for (const a of attachedTypes) add(a, 'namespace', 'attached', 1, a + '.');
      for (const kw of KEYWORDS) add(kw, 'keyword', '', 1);
      for (const bt of BASIC_TYPES) if (/^\s*(readonly |required )?property\s+\w*$/.test(line)) add(bt, 'type', 'property type', 4);
    } else {
      add('pragma ComponentBehavior: Bound', 'keyword', 'strict scoping', 5);
      add('import', 'keyword', '', 5);
      for (const mod of Object.keys(index.modules)) if (/^\s*import\s+[\w.]*$/.test(line)) add(mod, 'namespace', 'module', 6);
    }
    // Type names only when the prefix looks like one; `col` should not surface Column.
    if (!/^\s*(?:import|pragma)\s/.test(line) && (!typed || /^[A-Z]/.test(typed))) {
      for (const t of creatableTypes) add(t, 'class', types[t].module, enclosing ? 0 : 3, makeBlockApply(t));
    }
    return { from: word.from, options: dedupe(options), validFor: /^[\w.]*$/ };
  };
}
