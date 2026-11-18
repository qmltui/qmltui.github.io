#!/usr/bin/env node
// Regenerates wasm/www/types.json from QmlTui's generated .qmltypes files and
// src/QmlTui/Controls/*.qml sources so browser autocomplete stays in lockstep
// with the 0.6+ QML API.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(websiteRoot, 'wasm', 'www', 'types.json')

function resolveQmlTuiDir() {
  const candidates = [
    process.env.QMLTUI_REPO_DIR,
    path.resolve(websiteRoot, '..', 'qml-tui'),
    path.join(websiteRoot, '.cache', 'qmltui')
  ].filter(Boolean)
  for (const cand of candidates) {
    const abs = path.resolve(cand)
    if (fs.existsSync(path.join(abs, 'CMakeLists.txt'))) return abs
  }
  throw new Error('Could not locate qml-tui source directory. Set QMLTUI_REPO_DIR.')
}

function resolveQmlTypesRoot(qmltuiDir) {
  if (process.env.QMLTUI_BUILD_DIR) {
    const explicit = path.join(path.resolve(process.env.QMLTUI_BUILD_DIR), 'qml')
    if (fs.existsSync(path.join(explicit, 'QmlTui', 'QmlTuiCore.qmltypes'))) {
      return explicit
    }
    throw new Error(`QMLTUI_BUILD_DIR does not contain qml/QmlTui/QmlTuiCore.qmltypes: ${explicit}`)
  }

  const candidates = [
    path.join(qmltuiDir, 'build', 'qml'),
    path.join(websiteRoot, 'build-wasm', 'qml'),
    path.join(qmltuiDir, 'build-wasm', 'qml')
  ]
  const existing = candidates
    .filter((cand) => fs.existsSync(path.join(cand, 'QmlTui', 'QmlTuiCore.qmltypes')))
    .sort((a, b) => {
      const ma = fs.statSync(path.join(a, 'QmlTui', 'QmlTuiCore.qmltypes')).mtimeMs
      const mb = fs.statSync(path.join(b, 'QmlTui', 'QmlTuiCore.qmltypes')).mtimeMs
      return mb - ma
    })

  if (existing.length > 0) {
    return existing[0]
  }
  throw new Error(
    'Could not find QmlTuiCore.qmltypes in ../qml-tui/build/qml or build-wasm/qml. Build QmlTui or build-wasm first.'
  )
}

function parseBlocks(text, keyword) {
  const out = []
  const re = new RegExp(`\\b${keyword}\\s*\\{`, 'g')
  let m
  while ((m = re.exec(text)) !== null) {
    let depth = 1
    let i = m.index + m[0].length
    while (i < text.length && depth > 0) {
      if (text[i] === '"') {
        i++
        while (i < text.length && text[i] !== '"') {
          if (text[i] === '\\') i++
          i++
        }
      } else if (text[i] === '{') {
        depth++
      } else if (text[i] === '}') {
        depth--
      }
      i++
    }
    out.push(text.slice(m.index + m[0].length, i - 1))
    re.lastIndex = i
  }
  return out
}

function stripNestedBlocks(block) {
  let out = ''
  let depth = 0
  for (let i = 0; i < block.length; i++) {
    const ch = block[i]
    if (ch === '"') {
      if (depth === 0) out += ch
      i++
      while (i < block.length && block[i] !== '"') {
        if (block[i] === '\\') {
          if (depth === 0) out += block[i]
          i++
        }
        if (depth === 0 && i < block.length) out += block[i]
        i++
      }
      if (depth === 0 && i < block.length) out += block[i]
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      if (depth > 0) depth--
    } else if (depth === 0) {
      out += ch
    }
  }
  return out
}

function fieldString(block, key) {
  const shallow = stripNestedBlocks(block)
  const m = shallow.match(new RegExp(`(?:^|[;\\s])${key}:\\s*"([^"]+)"`))
  return m ? m[1] : ''
}

function fieldBool(block, key) {
  const shallow = stripNestedBlocks(block)
  return new RegExp(`(?:^|[;\\s])${key}:\\s*true\\b`).test(shallow)
}

function parseQmlTypesFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const comps = {}
  for (const b of parseBlocks(text, 'Component')) {
    const cppName = fieldString(b, 'name')
    if (!cppName) continue
    const proto = fieldString(b, 'prototype')
    const exp = (b.match(/(?:^|[;\s])exports:\s*\["([^"]+)"/) || [])[1] || ''
    const accessSemantics = fieldString(b, 'accessSemantics') || 'reference'
    const hasExplicitNotCreatable = /(?:^|[;\s])isCreatable:\s*false\b/.test(b)
    const isCreatable =
      !hasExplicitNotCreatable && accessSemantics !== 'value' && accessSemantics !== 'none'
    const isSingleton = fieldBool(b, 'isSingleton')
    const attachedType = fieldString(b, 'attachedType')

    const props = parseBlocks(b, 'Property').map((pb) => ({
      name: fieldString(pb, 'name'),
      type: fieldString(pb, 'type'),
      notify: fieldString(pb, 'notify'),
      isList: fieldBool(pb, 'isList'),
      readonly: fieldBool(pb, 'isReadonly')
    }))

    const sigs = parseBlocks(b, 'Signal').map((sb) => ({
      name: fieldString(sb, 'name'),
      params: parseBlocks(sb, 'Parameter').map((par) => [
        fieldString(par, 'name'),
        fieldString(par, 'type')
      ])
    }))

    const meths = parseBlocks(b, 'Method')
      .filter((mb) => !fieldBool(mb, 'isConstructor'))
      .map((mb) => ({
        name: fieldString(mb, 'name'),
        type: fieldString(mb, 'type') || 'void',
        params: parseBlocks(mb, 'Parameter').map((par) => [
          fieldString(par, 'name'),
          fieldString(par, 'type')
        ])
      }))

    const enums = {}
    for (const eb of parseBlocks(b, 'Enum')) {
      const en = fieldString(eb, 'name')
      const vm = eb.match(/values:\s*\[([\s\S]*?)\]/)
      if (en && vm) {
        enums[en] = [...vm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
      }
    }

    comps[cppName] = {
      cppName,
      proto,
      exp,
      isCreatable,
      isSingleton,
      attachedType,
      props,
      sigs,
      meths,
      enums
    }
  }
  return comps
}

const SCALAR_TYPE_MAP = {
  QString: 'string',
  double: 'real',
  float: 'real',
  qreal: 'real',
  qulonglong: 'int',
  qlonglong: 'int',
  uint: 'int',
  QVariant: 'var',
  QVariantMap: 'var',
  QVariantList: 'list<var>',
  QJSValue: 'var',
  QStringList: 'list<string>',
  QQmlComponent: 'Component',
  QObject: 'QtObject',
  QUrl: 'url',
  QSize: 'size',
  QPoint: 'point',
  QRect: 'rect',
  'qmltui::Color': 'color',
  Color: 'color',
  'qmltui::Span': 'span',
  Span: 'span',
  'qmltui::HighlightRange': 'highlightRange',
  HighlightRange: 'list<highlightRange>',
  'qmltui::TerminalCapabilities': 'terminalCapabilities'
}

function normalizeType(rawType, isList, cppToQml) {
  if (!rawType) return 'void'
  let mapped = SCALAR_TYPE_MAP[rawType]
  if (!mapped) {
    if (cppToQml[rawType]) {
      mapped = cppToQml[rawType]
    } else if (rawType.startsWith('qmltui::')) {
      const short = rawType.replace(/^qmltui::(?:controls::)?/, '')
      mapped = SCALAR_TYPE_MAP[short] || short
    } else {
      mapped = rawType
    }
  }
  if (isList && !mapped.startsWith('list<')) {
    return `list<${mapped}>`
  }
  return mapped
}

// Alias type resolutions and internal-member filters for QML-defined Controls
const QML_CONTROL_ALIAS_TYPES = {
  'AbstractButton.hovered': 'bool',
  'ComboBox.model': 'var',
  'ComboBox.count': 'int',
  'ComboBox.popup': 'Popup',
  'StackView.currentItem': 'Item',
  'StackView.depth': 'int'
}

const QML_CONTROL_INTERNAL_PROPS = new Set(['ButtonGroup.registeredButtons'])
const QML_CONTROL_INTERNAL_METHODS = new Set([
  'ButtonGroup.uncheckExcept',
  'ButtonGroup.syncDeclarativeButton',
  'ProgressBar.colorKey',
  'ProgressBar.isValidColor'
])

function parseQmlControlFile(filePath, typeName) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
  // Strip comments while preserving line structure
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')

  // Find root TypeName {
  const rootMatch = stripped.match(/^(?:pragma\s+[^\n]*\n|import\s+[^\n]*\n|\s*\n)*([A-Z]\w*)\s*\{/)
  if (!rootMatch) {
    throw new Error(`Could not parse root type in ${filePath}`)
  }
  const inherits = rootMatch[1]
  const bodyStart = rootMatch.index + rootMatch[0].length

  // Extract top-level lines (brace depth === 1)
  let depth = 1
  let lineStart = bodyStart
  const topLines = []
  for (let i = bodyStart; i < stripped.length && depth > 0; i++) {
    const ch = stripped[i]
    if (ch === '"' || ch === "'") {
      const q = ch
      i++
      while (i < stripped.length && stripped[i] !== q) {
        if (stripped[i] === '\\') i++
        i++
      }
      continue
    }
    if (ch === '{') {
      if (depth === 1) {
        topLines.push(stripped.slice(lineStart, i))
      }
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 1) {
        lineStart = i + 1
      }
    } else if (ch === '\n') {
      if (depth === 1) {
        topLines.push(stripped.slice(lineStart, i))
        lineStart = i + 1
      }
    }
  }

  const properties = []
  const signals = []
  const methods = []

  for (const rawLine of topLines) {
    const line = rawLine.trim().replace(/;$/, '')
    if (!line) continue

    const propMatch = line.match(
      /^(readonly\s+)?(?:default\s+|required\s+)?property\s+(list<[A-Za-z0-9_.]+>|[A-Za-z0-9_.]+)\s+([A-Za-z_]\w*)(?:\s*:\s*(.*))?$/
    )
    if (propMatch) {
      const isReadonly = Boolean(propMatch[1])
      let propType = propMatch[2]
      const propName = propMatch[3]
      const rhs = propMatch[4]?.trim()
      if (QML_CONTROL_INTERNAL_PROPS.has(`${typeName}.${propName}`)) continue
      if (propType === 'alias') {
        propType = QML_CONTROL_ALIAS_TYPES[`${typeName}.${propName}`] || 'var'
      }
      const entry = { name: propName, type: propType }
      if (isReadonly) entry.readonly = true
      if (
        !isReadonly &&
        rhs &&
        /^(?:"[^"]*"|-?\d+(?:\.\d+)?|true|false|null)$/.test(rhs)
      ) {
        entry.default = rhs
      }
      properties.push(entry)
      continue
    }

    const sigMatch = line.match(/^signal\s+([A-Za-z_]\w*)(?:\(([^)]*)\))?$/)
    if (sigMatch) {
      const sigName = sigMatch[1]
      const rawParams = sigMatch[2]?.trim() || ''
      const sigEntry = { name: sigName }
      if (rawParams) {
        sigEntry.params = rawParams.split(',').map((part) => {
          const tokens = part.trim().split(/\s+/)
          return tokens.length >= 2 ? [tokens[1], tokens[0]] : [tokens[0], 'var']
        })
      }
      signals.push(sigEntry)
      continue
    }

    const fnMatch = line.match(/^function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*$/)
    if (fnMatch) {
      const fnName = fnMatch[1]
      if (QML_CONTROL_INTERNAL_METHODS.has(`${typeName}.${fnName}`)) continue
      const rawParams = fnMatch[2].trim()
      const fnEntry = { name: fnName, type: 'var' }
      if (rawParams) {
        fnEntry.params = rawParams.split(',').map((part) => [part.trim(), 'var'])
      }
      methods.push(fnEntry)
    }
  }

  return {
    module: 'QmlTui.Controls',
    inherits,
    creatable: true,
    singleton: false,
    properties,
    signals,
    methods,
    enums: {},
    attached: []
  }
}

const BUILTIN_QT_TYPES = {
  QtObject: {
    module: 'QtQml',
    inherits: '',
    creatable: true,
    singleton: false,
    properties: [{ name: 'objectName', type: 'string' }],
    signals: [],
    methods: [],
    enums: {},
    attached: []
  },
  Component: {
    module: 'QtQml',
    inherits: 'QtObject',
    creatable: true,
    singleton: false,
    properties: [
      { name: 'progress', type: 'real', readonly: true },
      { name: 'status', type: 'Status', readonly: true },
      { name: 'url', type: 'url', readonly: true }
    ],
    signals: [{ name: 'completed' }, { name: 'destruction' }],
    methods: [
      {
        name: 'createObject',
        type: 'QtObject',
        params: [
          ['parent', 'QtObject'],
          ['properties', 'var']
        ]
      },
      { name: 'errorString', type: 'string' }
    ],
    enums: { Status: ['Null', 'Ready', 'Loading', 'Error'] },
    attached: []
  },
  Timer: {
    module: 'QtQml',
    inherits: 'QtObject',
    creatable: true,
    singleton: false,
    properties: [
      { name: 'interval', type: 'int' },
      { name: 'running', type: 'bool' },
      { name: 'repeat', type: 'bool' },
      { name: 'triggeredOnStart', type: 'bool' }
    ],
    signals: [{ name: 'triggered' }],
    methods: [
      { name: 'start', type: 'void' },
      { name: 'stop', type: 'void' },
      { name: 'restart', type: 'void' }
    ],
    enums: {},
    attached: []
  },
  Connections: {
    module: 'QtQml',
    inherits: 'QtObject',
    creatable: true,
    singleton: false,
    properties: [
      { name: 'target', type: 'QtObject' },
      { name: 'enabled', type: 'bool' },
      { name: 'ignoreUnknownSignals', type: 'bool' }
    ],
    signals: [],
    methods: [],
    enums: {},
    attached: []
  },
  Binding: {
    module: 'QtQml',
    inherits: 'QtObject',
    creatable: true,
    singleton: false,
    properties: [
      { name: 'target', type: 'QtObject' },
      { name: 'property', type: 'string' },
      { name: 'value', type: 'var' },
      { name: 'when', type: 'bool' },
      { name: 'delayed', type: 'bool' },
      { name: 'restoreMode', type: 'RestoreMode' }
    ],
    signals: [],
    methods: [],
    enums: {
      RestoreMode: ['RestoreNone', 'RestoreBinding', 'RestoreValue', 'RestoreBindingOrValue']
    },
    attached: []
  },
  ListModel: {
    module: 'QtQml.Models',
    inherits: 'QtObject',
    creatable: true,
    singleton: false,
    properties: [
      { name: 'count', type: 'int', readonly: true },
      { name: 'dynamicRoles', type: 'bool' }
    ],
    signals: [],
    methods: [
      { name: 'append', type: 'void', params: [['dict', 'var']] },
      { name: 'clear', type: 'void' },
      { name: 'get', type: 'var', params: [['index', 'int']] },
      {
        name: 'insert',
        type: 'void',
        params: [
          ['index', 'int'],
          ['dict', 'var']
        ]
      },
      {
        name: 'move',
        type: 'void',
        params: [
          ['from', 'int'],
          ['to', 'int'],
          ['n', 'int']
        ]
      },
      {
        name: 'remove',
        type: 'void',
        params: [
          ['index', 'int'],
          ['count', 'int']
        ]
      },
      {
        name: 'set',
        type: 'void',
        params: [
          ['index', 'int'],
          ['dict', 'var']
        ]
      },
      {
        name: 'setProperty',
        type: 'void',
        params: [
          ['index', 'int'],
          ['property', 'string'],
          ['value', 'var']
        ]
      }
    ],
    enums: {},
    attached: []
  },
  ListElement: {
    module: 'QtQml.Models',
    inherits: 'QtObject',
    creatable: true,
    singleton: false,
    properties: [],
    signals: [],
    methods: [],
    enums: {},
    attached: []
  }
}

function generate() {
  const qmltuiDir = resolveQmlTuiDir()
  const qmlTypesRoot = resolveQmlTypesRoot(qmltuiDir)

  const coreComps = parseQmlTypesFile(path.join(qmlTypesRoot, 'QmlTui', 'QmlTuiCore.qmltypes'))
  const ctrlCppComps = parseQmlTypesFile(
    path.join(qmlTypesRoot, 'QmlTui', 'Controls', 'QmlTuiControls.qmltypes')
  )
  const imageComps = parseQmlTypesFile(
    path.join(qmlTypesRoot, 'QmlTui', 'Image', 'QmlTuiImage.qmltypes')
  )

  const allCpp = { ...coreComps, ...ctrlCppComps, ...imageComps }
  const cppToQml = {}
  for (const c of Object.values(allCpp)) {
    if (c.exp) {
      const qname = c.exp.split('/')[1].split(' ')[0]
      cppToQml[c.cppName] = qname
    }
  }

  const modules = {
    QmlTui: [],
    'QmlTui.Controls': [],
    'QmlTui.Image': [],
    QtQml: ['QtObject', 'Component', 'Timer', 'Connections', 'Binding'],
    'QtQml.Models': ['ListModel', 'ListElement']
  }
  const types = {}

  for (const c of Object.values(allCpp)) {
    if (!c.exp) continue
    const [modName, rest] = c.exp.split('/')
    const qname = rest.split(' ')[0]
    if (!modules[modName]) continue
    modules[modName].push(qname)

    // Walk prototype chain across unexported C++ base classes (e.g. LinearLayout -> Item)
    let proto = c.proto
    const unexportedProps = []
    const unexportedSigs = []
    while (proto && !cppToQml[proto] && allCpp[proto]) {
      unexportedProps.push(...allCpp[proto].props)
      unexportedSigs.push(...allCpp[proto].sigs)
      proto = allCpp[proto].proto
    }
    const inherits = cppToQml[proto] || ''

    const combinedProps = [...c.props, ...unexportedProps]
    const notifySet = new Set(combinedProps.map((p) => `${p.name}Changed`))
    notifySet.add('capabilitiesChanged')

    const properties = combinedProps
      .filter((p) => p.name !== 'objectName')
      .map((p) => {
        const entry = {
          name: p.name,
          type: normalizeType(p.type, p.isList, cppToQml)
        }
        if (p.readonly) entry.readonly = true
        return entry
      })

    const signals = [...c.sigs, ...unexportedSigs]
      .filter((s) => !notifySet.has(s.name))
      .map((s) => {
        const entry = { name: s.name }
        if (s.params.length > 0) {
          entry.params = s.params.map(([n, t]) => [n, normalizeType(t, false, cppToQml)])
        }
        return entry
      })

    const methods = c.meths
      .filter((m) => m.name !== qname && m.name !== c.cppName.split('::').pop())
      .map((m) => {
        const entry = {
          name: m.name,
          type: normalizeType(m.type, false, cppToQml)
        }
        if (m.params.length > 0) {
          entry.params = m.params.map(([n, t]) => [n, normalizeType(t, false, cppToQml)])
        }
        return entry
      })

    const attached = []
    const attachedSignals = []
    if (c.attachedType && c.attachedType !== c.cppName && allCpp[c.attachedType]) {
      const attComp = allCpp[c.attachedType]
      const attNotify = new Set(attComp.props.map((p) => p.notify).filter(Boolean))
      for (const p of attComp.props) attNotify.add(`${p.name}Changed`)
      for (const ap of attComp.props) {
        const entry = {
          name: ap.name,
          type: normalizeType(ap.type, ap.isList, cppToQml)
        }
        if (ap.readonly) entry.readonly = true
        attached.push(entry)
      }
      for (const asig of attComp.sigs) {
        if (attNotify.has(asig.name)) continue
        const entry = { name: asig.name }
        if (asig.params.length > 0) {
          entry.params = asig.params.map(([n, t]) => [n, normalizeType(t, false, cppToQml)])
        }
        attachedSignals.push(entry)
      }
    }

    const typeEntry = {
      module: modName,
      inherits,
      creatable: c.isCreatable,
      singleton: c.isSingleton,
      properties,
      signals,
      methods,
      enums: c.enums,
      attached
    }
    if (attachedSignals.length > 0) {
      typeEntry.attachedSignals = attachedSignals
    }
    types[qname] = typeEntry
  }

  // Parse QML-defined Controls in src/QmlTui/Controls/*.qml
  const controlsSrcDir = path.join(qmltuiDir, 'src', 'QmlTui', 'Controls')
  const qmlControlFiles = fs
    .readdirSync(controlsSrcDir)
    .filter((f) => f.endsWith('.qml'))
    .sort()
  for (const file of qmlControlFiles) {
    const typeName = file.replace(/\.qml$/, '')
    modules['QmlTui.Controls'].push(typeName)
    types[typeName] = parseQmlControlFile(path.join(controlsSrcDir, file), typeName)
  }

  Object.assign(types, BUILTIN_QT_TYPES)

  fs.writeFileSync(outputPath, JSON.stringify({ modules, types }) + '\n', 'utf8')
  const totalTypes = Object.keys(types).length
  console.log(
    `[generate-types] Wrote ${totalTypes} QML types to ${path.relative(websiteRoot, outputPath)} (from ${qmlTypesRoot})`
  )
}

generate()
