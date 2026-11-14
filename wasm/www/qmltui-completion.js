// QML completion for CodeMirror 6, driven by types.json.
//
// The index knows every exported type, what it inherits, and its members. This
// file adds the part the index cannot know: where the cursor is. A cheap scan
// of the text before the cursor tracks the stack of open object blocks and the
// ids declared in the file; the completion source then offers what fits:
//   object scope     members of the enclosing type, on<Signal> handlers, attached
//                    types (Keys., Layout.), child type names, QML keywords
//   after `name.`    members of that property's type, of that id's type, or the
//                    attached members / enum values of a type
//   after `prop:`    enum values, true/false, colors, ids
// No type inference through expressions; that is the language server's job.

const KEYWORDS = ['property', 'readonly property', 'required property', 'signal', 'function', 'id', 'import', 'Component'];
const BASIC_TYPES = ['int', 'real', 'bool', 'string', 'color', 'var', 'list<QtObject>', 'url', 'date'];
const COLOR_NAMES = ['default', 'transparent', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'gray', 'ansi:black', 'ansi:red', 'ansi:green', 'ansi:yellow', 'ansi:blue', 'ansi:magenta', 'ansi:cyan', 'ansi:white',
  'ansi:brightblack', 'ansi:brightred', 'ansi:brightgreen', 'ansi:brightyellow', 'ansi:brightblue', 'ansi:brightmagenta',
  'ansi:brightcyan', 'ansi:brightwhite', '"#0d1117"', '"#c9d1d9"', '"#2cde85"', '"#00ff66"'];

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
  // Types used as `Name.member` inside an item: those with attached members, and
  // non-creatable types that carry signals or properties of their own (Keys).
  const attachedTypes = Object.entries(types)
    .filter(([, t]) => t.attached.length || (!t.creatable && !t.singleton && (t.signals.length || t.properties.length) && t.module.startsWith('QmlTui')))
    .map(([n]) => n);
  const creatableTypes = Object.entries(types).filter(([, t]) => t.creatable).map(([n]) => n);
  const singletons = Object.entries(types).filter(([, t]) => t.singleton).map(([n]) => n);

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
        stack.push({ type: m ? m[1].split('.').pop() : null });
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
      if (ids[head]) offer(ids[head]);
      else if (head === 'parent' && enclosing) offer('Item');
      else if (types[head]) {
        const t = types[head];
        for (const [en, values] of Object.entries(enumsOf(head))) for (const v of values) add(v, 'enum', `${head}.${en}`);
        for (const a of t.attached) add(a.name, 'property', a.type);
        if (attachedTypes.includes(head)) {
          for (const s of t.signals) add(handlerName(s.name), 'event', 'attached signal handler', 1, handlerName(s.name) + ': ');
          for (const p of t.properties) add(p.name, 'property', p.type);
        }
        if (t.singleton) offer(head);
      } else if (enclosing) {
        const propType = propertyType(enclosing, head.split('.')[0]);
        if (propType && types[propType]) offer(propType);
      }
      return options.length ? { from, options: dedupe(options), validFor: /^\w*$/ } : null;
    }

    // 2. value position: `prop: <cursor>` ------------------------------------------
    const valueMatch = line.match(/^\s*([a-z]\w*(?:\.[a-z]\w*)?)\s*:\s*([\w.]*)$/);
    if (valueMatch && enclosing) {
      const prop = valueMatch[1];
      const ptype = propertyType(enclosing, prop.split('.')[0]) || '';
      const enums = enumsOf(enclosing);
      if (enums[ptype]) for (const v of enums[ptype]) add(`${enclosing}.${v}`, 'enum', ptype, 2);
      for (const [owner, t] of Object.entries(types)) if (t.enums[ptype] && !chain(enclosing).includes(t)) for (const v of t.enums[ptype]) add(`${owner}.${v}`, 'enum', ptype, 1);
      if (ptype === 'bool') { add('true', 'keyword', 'bool', 2); add('false', 'keyword', 'bool', 2); }
      if (ptype === 'color') for (const c of COLOR_NAMES) add(c.startsWith('"') ? c : `"${c}"`, 'constant', 'color', 1);
      for (const [id, t] of Object.entries(ids)) add(id, 'variable', t);
      add('parent', 'variable', 'Item');
      for (const s of singletons) add(s, 'namespace', 'singleton');
      if (types[ptype]?.creatable) add(`${ptype} {}`, 'class', 'inline object');
      if (ptype === 'Item') add('Text { text: "" }', 'class', 'inline Text item', 3);
      return options.length ? { from: word.from, options: dedupe(options), validFor: /^[\w.]*$/ } : null;
    }

    // 3. inside a JS block: ids, singletons, the enclosing item's members -------------
    if (inJs) {
      for (const [id, t] of Object.entries(ids)) add(id, 'variable', t, 1);
      for (const s of singletons) add(s, 'namespace', 'singleton');
      add('parent', 'variable', 'Item'); add('console.log', 'function', '');
      return { from: word.from, options, validFor: /^[\w.]*$/ };
    }

    // 4. object scope --------------------------------------------------------------
    if (enclosing) {
      const m = members(enclosing);
      for (const p of m.props) if (!p.readonly) add(p.name, 'property', p.type, 3, p.name + ': ');
      for (const s of m.signals) add(handlerName(s.name), 'event', `signal ${s.name}`, 2, handlerName(s.name) + ': ');
      for (const p of m.props) if (!p.readonly) add(`on${p.name[0].toUpperCase()}${p.name.slice(1)}Changed`, 'event', `${p.name} changed`, 0, `on${p.name[0].toUpperCase()}${p.name.slice(1)}Changed: `);
      for (const a of attachedTypes) add(a, 'namespace', 'attached', 1, a + '.');
      for (const kw of KEYWORDS) add(kw, 'keyword', '', 1);
      for (const bt of BASIC_TYPES) if (/^\s*(readonly |required )?property\s+\w*$/.test(line)) add(bt, 'type', 'property type', 4);
    } else {
      add('import', 'keyword', '', 5);
      for (const mod of Object.keys(index.modules)) if (/^\s*import\s+[\w.]*$/.test(line)) add(mod, 'namespace', 'module', 6);
    }
    // Type names only when the prefix looks like one; `col` should not surface Column.
    if (!/^\s*import\s/.test(line) && (!typed || /^[A-Z]/.test(typed))) {
      for (const t of creatableTypes) add(t, 'class', types[t].module, enclosing ? 0 : 3, t + ' {\n\t\n}');
    }
    return { from: word.from, options: dedupe(options), validFor: /^[\w.]*$/ };
  };
}
