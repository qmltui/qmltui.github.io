// QmlTui WebAssembly Playground & Component Gallery:
// CodeMirror 6 on the left, live xterm.js terminal on the right.
// Supports two workflows:
// 1. "Try It Yourself" (mode === 'playground'): Edit a complete QML application
//    with a root Terminal {} item (both Terminal.AltScreen and Terminal.Inline
//    with Scrollback.print() work natively in xterm.js).
// 2. "Gallery Grid" (mode === 'grid' | 'example'): Browse the 44 interactive
//    component examples in the terminal grid or select one to edit live.
import { EditorView, basicSetup } from 'codemirror';
import { Compartment } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';
import { createQmlCompletion } from './qmltui-completion.js';

const $ = (id) => document.getElementById(id);
const status = $('status');
const problems = $('problems');
const exampleSelect = $('exampleSelect');
const btnPlayground = $('btnPlayground');
const btnGallery = $('btnGallery');
const previewFallback = $('previewFallback');
const previewGif = $('previewGif');
const previewLabel = $('previewLabel');

const DEFAULT_PLAYGROUND_QML = `pragma ComponentBehavior: Bound
import QmlTui
import QmlTui.Controls

Terminal {
    id: root
    property int count: 0

    title: "QmlTui Playground"
    focus: true

    Keys.onPressed: event => {
        if (event.key === Qt.Key_Q || event.key === Qt.Key_Escape) {
            event.accepted = true;
            Qt.quit();
        }
    }

    Panel {
        anchors.centerIn: parent
        width: 56
        height: 15
        title: Text {
            text: "Try It Yourself · Root Terminal"
            color: "#00ff66"
            bold: true
        }
        border {
            style: Border.Rounded
            color: "#00ff66"
        }

        ColumnLayout {
            anchors {
                fill: parent
                margins: 1
            }
            spacing: 1

            Text {
                text: "Edit this complete Terminal {} app on the left!"
                color: "#00ff66"
                bold: true
            }

            Text {
                text: "Counter: " + root.count
            }

            RowLayout {
                spacing: 2

                Button {
                    text: "Increment (+1)"
                    focus: true
                    onClicked: root.count += 1
                }

                Button {
                    text: "Reset"
                    onClicked: root.count = 0
                }
            }

            Item {
                Layout.fillHeight: true
            }

            Text {
                text: "Tab: focus · Enter/Space: click · Q/Esc: quit"
                dim: true
            }
        }
    }
}
`;

const INLINE_PLAYGROUND_QML = `pragma ComponentBehavior: Bound
import QmlTui

Terminal {
    mode: Terminal.Inline

    Scrollback {
        id: history
    }

    Component.onCompleted: {
        history.print([
            { text: "✦ ", color: "#00ff66", bold: true },
            { text: "QmlTui Agent ready. Type a message and press Enter." }
        ]);
    }

    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape) {
            if (input.text.length > 0)
                input.text = "";
            else
                Qt.quit();
            event.accepted = true;
        }
    }

    Rectangle {
        width: parent.width
        height: 3
        border {
            style: Border.Rounded
            color: "#2cde85"
        }

        RowLayout {
            anchors {
                fill: parent
                leftMargin: 2
                rightMargin: 2
            }
            spacing: 1

            Text {
                text: "❯"
                color: "#00ff66"
                bold: true
            }

            TextInput {
                id: input
                Layout.fillWidth: true
                focus: true
                placeholderText: "Ask anything… (Enter to send, Esc to quit)"
                onAccepted: {
                    const prompt = input.text.trim();
                    if (!prompt)
                        return;
                    input.text = "";
                    history.print([
                        { text: "❯ ", color: "#00ff66", bold: true },
                        { text: prompt + "\\n", bold: true },
                        { text: "✦ ", color: "#79c0ff", bold: true },
                        { text: "Committed \\"" + prompt + "\\" to terminal scrollback." }
                    ]);
                }
            }
        }
    }
}
`;

const PLACEHOLDER = `// Gallery Grid Mode
//
// Pick a component tile in the terminal on the right (arrow keys + Enter, or
// click with the mouse), or choose one from the "Template / Example" dropdown
// above.
//
// When a component opens, its QML source appears here for live editing.
//
// Want to write a complete application with a root Terminal {} node instead?
// Click "▶ Try It Yourself" in the top bar.
`;

function camelToSnake(stem) {
  return stem
    .replace(/(.)([A-Z][a-z]+)/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

// --- URL encoding helpers ----------------------------------------------------
const b64url = {
  enc: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  },
};
async function encodeShare(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return b64url.enc(new Uint8Array(await new Response(stream).arrayBuffer()));
}
async function decodeShare(hash) {
  const stream = new Blob([b64url.dec(hash)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}
function decodeBase64UrlUtf8(str) {
  return new TextDecoder().decode(b64url.dec(str));
}

// --- Terminal + wasm + Settings ----------------------------------------------
const SETTINGS_STORAGE_KEY = 'qmltui.xtermSettings.v1';

const ANSI_KEYS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
];

const THEME_PRESETS = {
  'qmltui-dark': {
    background: '#0d1117', foreground: '#c9d1d9', cursor: '#00ff66', selectionBackground: '#264f78',
    black: '#0d1117', red: '#ff7b72', green: '#2cde85', yellow: '#f9c74f',
    blue: '#58a6ff', magenta: '#d2a8ff', cyan: '#39c5cf', white: '#c9d1d9',
    brightBlack: '#484f58', brightRed: '#ffa198', brightGreen: '#00ff66', brightYellow: '#fbbf24',
    brightBlue: '#79c0ff', brightMagenta: '#e2c5ff', brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
  },
  'catppuccin-mocha': {
    background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selectionBackground: '#45475a',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
    blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
    brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
  },
  'tokyo-night': {
    background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', selectionBackground: '#33467c',
    black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
    blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
    brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68',
    brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
  },
  'gruvbox-dark': {
    background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', selectionBackground: '#504945',
    black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
    brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f',
    brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2',
  },
  'dracula': {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selectionBackground: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
    brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  },
  'solarized-dark': {
    background: '#002b36', foreground: '#839496', cursor: '#93a1a1', selectionBackground: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  'nord': {
    background: '#2e3440', foreground: '#d8dee9', cursor: '#88c0d0', selectionBackground: '#434c5e',
    black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
  },
  'github-light': {
    background: '#ffffff', foreground: '#24292f', cursor: '#0969da', selectionBackground: '#b6e3ff',
    black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00',
    blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
    brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#633c01',
    brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#3192aa', brightWhite: '#8c959f',
  },
};

function defaultXtermSettings() {
  return {
    themePreset: 'qmltui-dark',
    theme: { ...THEME_PRESETS['qmltui-dark'] },
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: 15,
    lineHeight: 1.0,
    letterSpacing: 0,
    cursorStyle: 'block',
    cursorBlink: false,
    scrollback: 1000,
  };
}

function loadXtermSettings() {
  const defaults = defaultXtermSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      theme: { ...defaults.theme, ...(parsed.theme || {}) },
    };
  } catch {
    return defaults;
  }
}

let xtermSettings = loadXtermSettings();
let term = null;
let fit = null;
let instance = null;
let hasWasmRuntime = false;
const encoder = new TextEncoder();

function saveXtermSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(xtermSettings));
  } catch { /* ignore storage quota errors */ }
}

function pushTerminalPaletteToEngine() {
  if (!instance) return;
  const fg = xtermSettings.theme?.foreground || '#c9d1d9';
  const bg = xtermSettings.theme?.background || '#0d1117';
  let seq = `\x1b]10;${fg}\x1b\\\x1b]11;${bg}\x1b\\`;
  for (let i = 0; i < ANSI_KEYS.length; ++i) {
    const col = xtermSettings.theme?.[ANSI_KEYS[i]];
    if (col) {
      seq += `\x1b]4;${i};${col}\x1b\\`;
    }
  }
  seq += '\x1b[?997;1n';
  instance.qmltuiFeedInput(encoder.encode(seq));
}

function applyXtermSettings() {
  const termContainer = $('terminal');
  if (termContainer && xtermSettings.theme?.background) {
    termContainer.style.backgroundColor = xtermSettings.theme.background;
  }
  if (!term) return;
  const fontSize = Number(xtermSettings.fontSize) || 15;
  term.options.theme = { ...xtermSettings.theme };
  term.options.fontFamily = xtermSettings.fontFamily;
  term.options.fontSize = fontSize;
  term.options.lineHeight = Number(xtermSettings.lineHeight) || 1.0;
  term.options.letterSpacing = Number(xtermSettings.letterSpacing) || 0;
  term.options.cursorStyle = xtermSettings.cursorStyle || 'block';
  term.options.cursorBlink = Boolean(xtermSettings.cursorBlink);
  term.options.scrollback = Math.max(0, Number(xtermSettings.scrollback) || 0);
  term.clearTextureAtlas?.();
  if (term.rows > 0) term.refresh(0, term.rows - 1);
  if (fit) {
    requestAnimationFrame(() => fit.fit());
  }
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load(`400 ${fontSize}px ${xtermSettings.fontFamily}`),
      document.fonts.load(`700 ${fontSize}px ${xtermSettings.fontFamily}`),
    ]).then(() => {
      if (!term) return;
      term.options.fontFamily = xtermSettings.fontFamily;
      term.clearTextureAtlas?.();
      if (term.rows > 0) term.refresh(0, term.rows - 1);
      if (fit) fit.fit();
    }).catch(() => {});
  }
  pushTerminalPaletteToEngine();
}

function initSettingsPanel() {
  const panel = $('settingsPanel');
  const toggleBtn = $('toggleSettings');
  const closeBtn = $('closeSettings');
  const ansiGrid = $('ansiGrid');
  if (!panel || !toggleBtn) return;

  const ansiInputs = {};
  if (ansiGrid) {
    ansiGrid.replaceChildren();
    ANSI_KEYS.forEach((key, idx) => {
      const wrap = document.createElement('label');
      wrap.className = 'ansi-swatch';
      wrap.title = `${idx}: ${key}`;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = xtermSettings.theme[key] || '#000000';
      input.oninput = () => {
        xtermSettings.theme[key] = input.value;
        xtermSettings.themePreset = 'custom';
        if ($('cfgThemePreset')) $('cfgThemePreset').value = 'custom';
        applyXtermSettings();
        saveXtermSettings();
      };
      const lbl = document.createElement('span');
      lbl.textContent = String(idx);
      wrap.append(input, lbl);
      ansiGrid.append(wrap);
      ansiInputs[key] = input;
    });
  }

  function syncSettingsInputs() {
    if ($('cfgThemePreset')) $('cfgThemePreset').value = xtermSettings.themePreset || 'custom';
    if ($('cfgBg')) $('cfgBg').value = xtermSettings.theme.background || '#0d1117';
    if ($('cfgFg')) $('cfgFg').value = xtermSettings.theme.foreground || '#c9d1d9';
    if ($('cfgCursor')) $('cfgCursor').value = xtermSettings.theme.cursor || '#00ff66';
    if ($('cfgSelection')) $('cfgSelection').value = (xtermSettings.theme.selectionBackground || '#264f78').slice(0, 7);
    for (const k of ANSI_KEYS) {
      if (ansiInputs[k] && xtermSettings.theme[k]) ansiInputs[k].value = xtermSettings.theme[k];
    }
    const fontPreset = $('cfgFontPreset');
    const customRow = $('cfgCustomFontRow');
    const fontCustom = $('cfgFontCustom');
    if (fontPreset) {
      const hasOption = Array.from(fontPreset.options).some((o) => o.value === xtermSettings.fontFamily);
      fontPreset.value = hasOption ? xtermSettings.fontFamily : 'custom';
      if (customRow) customRow.style.display = hasOption ? 'none' : 'flex';
      if (fontCustom && !hasOption) fontCustom.value = xtermSettings.fontFamily;
    }
    if ($('cfgFontSize')) $('cfgFontSize').value = String(xtermSettings.fontSize);
    if ($('cfgLineHeight')) $('cfgLineHeight').value = String(xtermSettings.lineHeight);
    if ($('cfgLetterSpacing')) $('cfgLetterSpacing').value = String(xtermSettings.letterSpacing);
    if ($('cfgCursorStyle')) $('cfgCursorStyle').value = xtermSettings.cursorStyle;
    if ($('cfgCursorBlink')) $('cfgCursorBlink').checked = Boolean(xtermSettings.cursorBlink);
    if ($('cfgScrollback')) $('cfgScrollback').value = String(xtermSettings.scrollback);
  }

  toggleBtn.onclick = () => {
    const isOpen = panel.classList.toggle('open');
    toggleBtn.classList.toggle('primary', isOpen);
  };
  if (closeBtn) {
    closeBtn.onclick = () => {
      panel.classList.remove('open');
      toggleBtn.classList.remove('primary');
    };
  }

  if ($('cfgThemePreset')) {
    $('cfgThemePreset').onchange = (e) => {
      const preset = e.target.value;
      xtermSettings.themePreset = preset;
      if (THEME_PRESETS[preset]) {
        xtermSettings.theme = { ...THEME_PRESETS[preset] };
        syncSettingsInputs();
        applyXtermSettings();
        saveXtermSettings();
      }
    };
  }

  const bindCoreColor = (id, key) => {
    const el = $(id);
    if (!el) return;
    el.oninput = () => {
      xtermSettings.theme[key] = el.value;
      xtermSettings.themePreset = 'custom';
      if ($('cfgThemePreset')) $('cfgThemePreset').value = 'custom';
      applyXtermSettings();
      saveXtermSettings();
    };
  };
  bindCoreColor('cfgBg', 'background');
  bindCoreColor('cfgFg', 'foreground');
  bindCoreColor('cfgCursor', 'cursor');
  bindCoreColor('cfgSelection', 'selectionBackground');

  if ($('cfgFontPreset')) {
    $('cfgFontPreset').onchange = (e) => {
      const val = e.target.value;
      const customRow = $('cfgCustomFontRow');
      if (val === 'custom') {
        if (customRow) customRow.style.display = 'flex';
        if ($('cfgFontCustom')) $('cfgFontCustom').value = xtermSettings.fontFamily;
      } else {
        if (customRow) customRow.style.display = 'none';
        xtermSettings.fontFamily = val;
        applyXtermSettings();
        saveXtermSettings();
      }
    };
  }
  if ($('cfgFontCustom')) {
    $('cfgFontCustom').oninput = (e) => {
      if (e.target.value.trim()) {
        xtermSettings.fontFamily = e.target.value.trim();
        applyXtermSettings();
        saveXtermSettings();
      }
    };
  }
  if ($('cfgFontSize')) {
    $('cfgFontSize').oninput = (e) => {
      xtermSettings.fontSize = Math.min(28, Math.max(10, Number(e.target.value) || 15));
      applyXtermSettings();
      saveXtermSettings();
    };
  }
  if ($('cfgLineHeight')) {
    $('cfgLineHeight').oninput = (e) => {
      xtermSettings.lineHeight = Math.min(1.8, Math.max(1.0, Number(e.target.value) || 1.0));
      applyXtermSettings();
      saveXtermSettings();
    };
  }
  if ($('cfgLetterSpacing')) {
    $('cfgLetterSpacing').oninput = (e) => {
      xtermSettings.letterSpacing = Math.min(6, Math.max(-2, Number(e.target.value) || 0));
      applyXtermSettings();
      saveXtermSettings();
    };
  }
  if ($('cfgCursorStyle')) {
    $('cfgCursorStyle').onchange = (e) => {
      xtermSettings.cursorStyle = e.target.value;
      applyXtermSettings();
      saveXtermSettings();
    };
  }
  if ($('cfgCursorBlink')) {
    $('cfgCursorBlink').onchange = (e) => {
      xtermSettings.cursorBlink = Boolean(e.target.checked);
      applyXtermSettings();
      saveXtermSettings();
    };
  }
  if ($('cfgScrollback')) {
    $('cfgScrollback').oninput = (e) => {
      xtermSettings.scrollback = Math.max(0, Number(e.target.value) || 0);
      applyXtermSettings();
      saveXtermSettings();
    };
  }
  if ($('resetSettings')) {
    $('resetSettings').onclick = () => {
      xtermSettings = defaultXtermSettings();
      syncSettingsInputs();
      applyXtermSettings();
      saveXtermSettings();
    };
  }

  syncSettingsInputs();
  applyXtermSettings();
}

function initXterm() {
  if (term || typeof window.Terminal !== 'function') return;
  term = new Terminal({
    allowProposedApi: true,
    cursorStyle: xtermSettings.cursorStyle || 'block',
    cursorBlink: Boolean(xtermSettings.cursorBlink),
    scrollback: Math.max(0, Number(xtermSettings.scrollback) || 1000),
    fontSize: Number(xtermSettings.fontSize) || 15,
    lineHeight: Number(xtermSettings.lineHeight) || 1.0,
    letterSpacing: Number(xtermSettings.letterSpacing) || 0,
    fontFamily: xtermSettings.fontFamily,
    theme: { ...xtermSettings.theme },
  });
  if (window.UnicodeGraphemesAddon) {
    term.loadAddon(new UnicodeGraphemesAddon.UnicodeGraphemesAddon());
    term.unicode.activeVersion = '15-graphemes';
  }
  // Forward OSC 52 clipboard sequences emitted by QmlTui's Clipboard.copy()
  term.parser.registerOscHandler(52, (data) => {
    const idx = data.indexOf(';');
    if (idx < 0) return true;
    try {
      const bin = atob(data.slice(idx + 1));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      navigator.clipboard?.writeText(new TextDecoder().decode(bytes)).catch(() => {});
    } catch { /* ignore malformed base64 */ }
    return true;
  });
  // Respond to OSC 10 (default foreground), OSC 11 (default background),
  // and OSC 4 (16-color ANSI palette) queries from QmlTui's TerminalEngine.
  term.parser.registerOscHandler(10, (data) => {
    if (data.trim() === '?' && instance) {
      const fg = xtermSettings.theme?.foreground || '#c9d1d9';
      instance.qmltuiFeedInput(encoder.encode(`\x1b]10;${fg}\x1b\\`));
    }
    return true;
  });
  term.parser.registerOscHandler(11, (data) => {
    if (data.trim() === '?' && instance) {
      const bg = xtermSettings.theme?.background || '#0d1117';
      instance.qmltuiFeedInput(encoder.encode(`\x1b]11;${bg}\x1b\\`));
    }
    return true;
  });
  term.parser.registerOscHandler(4, (data) => {
    if (!instance) return true;
    const parts = data.split(';');
    let replies = '';
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const idx = Number(parts[i]);
      if (parts[i + 1].trim() === '?' && idx >= 0 && idx < ANSI_KEYS.length) {
        const col = xtermSettings.theme?.[ANSI_KEYS[idx]];
        if (col) {
          replies += `\x1b]4;${idx};${col}\x1b\\`;
        }
      }
    }
    if (replies) {
      instance.qmltuiFeedInput(encoder.encode(replies));
    }
    return true;
  });
  fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open($('terminal'));
  window.qmltuiTerm = term;
  applyXtermSettings();
  fit.fit();
}

const PREVIEW_GIF_FALLBACKS = {
  anchors: 'layouts',
  color: 'rectangle',
  gradient: 'rectangle',
  keys: 'shortcut',
  stack_layout: 'tab_bar',
};

function updatePreviewFallback() {
  if (hasWasmRuntime || !previewFallback) return;
  previewFallback.classList.add('active');
  if (mode === 'example' && focusFile) {
    const stem = focusFile.replace(/\.qml$/i, '');
    const snake = camelToSnake(stem);
    const gifStem = PREVIEW_GIF_FALLBACKS[snake] || snake;
    previewGif.src = `../assets/casts/components/${gifStem}.gif`;
    previewLabel.textContent = `${gifStem}.gif`;
  } else if (mode === 'playground' && playgroundKey === '__inline__') {
    previewGif.src = '../assets/casts/components/inline_mode.gif';
    previewLabel.textContent = 'inline_mode.gif';
  } else if (mode === 'playground') {
    previewGif.src = '../assets/casts/hello-world.gif';
    previewLabel.textContent = 'hello-world.gif';
  } else {
    previewGif.src = '../assets/casts/gallery-tour.gif';
    previewLabel.textContent = 'gallery-tour.gif';
  }
}

async function startRuntime() {
  if (typeof window.qmltui_playground_entry !== 'function') {
    hasWasmRuntime = false;
    status.textContent = 'preview mode (Wasm runtime not built locally)';
    updatePreviewFallback();
    return;
  }
  initXterm();
  status.textContent = 'loading runtime…';
  instance = await window.qmltui_playground_entry({
    noInitialRun: true,
    qmltuiOnOutput: (bytes) => term.write(bytes),
    qmltuiOnQuit: () => {
      status.textContent = 'Qt.quit() called. Edit or press ▶ Run to restart.';
      term.reset();
    },
    qmltuiOnWarning: (text) => addProblem('warning', text),
    print: (t) => console.log(t),
    printErr: (t) => console.warn(t),
  });
  hasWasmRuntime = true;
  if (previewFallback) previewFallback.classList.remove('active');
  instance.qmltuiResize(term.cols, term.rows);
  term.onData((s) => instance.qmltuiFeedInput(encoder.encode(s)));
  term.onBinary((s) => instance.qmltuiFeedInput(Uint8Array.from(s, (c) => c.charCodeAt(0))));
  term.onResize(({ cols, rows }) => instance.qmltuiResize(cols, rows));
  term.onTitleChange((title) => {
    if (mode === 'playground' || !title) return;
    const m = title.match(/ · (\S+)$/);
    if (m && sources[m[1]] !== undefined) {
      exampleTitleSeenSinceRun = true;
      focusExample(m[1]);
    } else if (title === 'QmlTui Gallery' && mode === 'example' && exampleTitleSeenSinceRun) {
      showGrid({ keepEditorVisibility: true });
    }
  });
  new ResizeObserver(() => fit.fit()).observe($('terminal'));
  try { instance.callMain([]); } catch (e) { if (e !== 'unwind') throw e; }
  status.textContent = 'ready';
}

// --- Editor state ------------------------------------------------------------
// mode: 'playground' the editor holds a full root-Terminal Main.qml app
//       'grid'       the gallery shows its grid; the editor holds the read-only hint
//       'example'    a gallery tile is open; the editor holds that example file
let mode = 'playground';
let playgroundKey = '__playground__';
const playgroundSources = {
  __playground__: DEFAULT_PLAYGROUND_QML,
  __inline__: INLINE_PLAYGROUND_QML,
};
const initialPlaygroundSources = {
  __playground__: DEFAULT_PLAYGROUND_QML,
  __inline__: INLINE_PLAYGROUND_QML,
};
let launcher = '';
let initialLauncher = '';
let sources = {};
let initialSources = {};
let focusFile = null;
let settingDoc = false;
let exampleTitleSeenSinceRun = false;
const editable = new Compartment();

function updateModeButtons() {
  if (btnPlayground) btnPlayground.classList.toggle('active', mode === 'playground');
  if (btnGallery) btnGallery.classList.toggle('active', mode !== 'playground');
}

function updateToggleEditorButton() {
  const drawerBtn = $('drawerToggleBtn');
  if (!drawerBtn) return;
  const hidden = document.body.classList.contains('editor-hidden');
  if (hidden) {
    drawerBtn.textContent = mode === 'example' && focusFile
      ? `⟨/⟩ ${focusFile} ▸`
      : '⟨/⟩ Show Code ▸';
  } else {
    drawerBtn.textContent = '◀ Hide Code';
  }
}

function setEditorVisible(visible) {
  document.body.classList.toggle('editor-hidden', !visible);
  updateToggleEditorButton();
  if (fit) {
    requestAnimationFrame(() => {
      fit.fit();
      if (term && !visible) term.focus();
    });
  }
}

function commitEditor() {
  if (mode === 'playground') {
    playgroundSources[playgroundKey] = editor.state.doc.toString();
  } else if (mode === 'example' && focusFile) {
    sources[focusFile] = editor.state.doc.toString();
  }
}

function setDoc(text, isEditable) {
  settingDoc = true;
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: text },
    effects: editable.reconfigure(EditorView.editable.of(isEditable)),
  });
  settingDoc = false;
}

function showPlayground(key = '__playground__') {
  mode = 'playground';
  playgroundKey = key in playgroundSources ? key : '__playground__';
  focusFile = null;
  setDoc(playgroundSources[playgroundKey], true);
  $('focusId').textContent = playgroundKey === '__inline__' ? 'Main.qml (Inline)' : 'Main.qml';
  if (exampleSelect && exampleSelect.value !== playgroundKey) {
    exampleSelect.value = playgroundKey;
  }
  setEditorVisible(true);
  updateModeButtons();
  updatePreviewFallback();
}

function focusExample(file) {
  if (!file || sources[file] === undefined) return;
  if (mode === 'example' && focusFile === file) return;
  mode = 'example';
  focusFile = file;
  setDoc(sources[file], true);
  $('focusId').textContent = `examples/${file}`;
  if (exampleSelect && exampleSelect.value !== file) exampleSelect.value = file;
  updateToggleEditorButton();
  updateModeButtons();
  updatePreviewFallback();
}

function showGrid({ keepEditorVisibility = false } = {}) {
  mode = 'grid';
  focusFile = null;
  setDoc(PLACEHOLDER, false);
  $('focusId').textContent = 'Gallery Grid';
  if (exampleSelect) exampleSelect.value = '';
  if (!keepEditorVisibility) {
    setEditorVisible(false);
  } else {
    updateToggleEditorButton();
  }
  updateModeButtons();
  updatePreviewFallback();
}

// --- Editor ------------------------------------------------------------------
const AUTORUN_DEBOUNCE_MS = 700;
let runTimer = null;
let qmlCompletion = null;
fetch('types.json').then((r) => r.json()).then((index) => { qmlCompletion = createQmlCompletion(index); })
  .catch((e) => addProblem('warning', `completion index unavailable: ${e.message}`));
const editor = new EditorView({
  doc: DEFAULT_PLAYGROUND_QML,
  extensions: [
    basicSetup, javascript(), oneDark,
    editable.of(EditorView.editable.of(true)),
    autocompletion({ override: [(ctx) => (qmlCompletion ? qmlCompletion(ctx) : null)], activateOnTyping: true, icons: true }),
    keymap.of([indentWithTab, { key: 'Mod-Enter', run: () => { run({ fromAutoRun: false }); return true; } }]),
    EditorView.updateListener.of((u) => {
      if (!u.docChanged || settingDoc || mode === 'grid') return;
      commitEditor();
      clearTimeout(runTimer);
      if (!$('autorun').checked) return;
      status.textContent = 'editing…';
      runTimer = setTimeout(() => {
        runTimer = null;
        run({ fromAutoRun: true });
      }, AUTORUN_DEBOUNCE_MS);
    }),
  ],
  parent: $('editor'),
});
window.qmltuiEditor = editor;

function addProblem(kind, text) {
  const li = document.createElement('li');
  li.className = kind;
  li.textContent = text;
  problems.append(li);
}

function resolveExampleFile(queryValue) {
  if (!queryValue) return null;
  const trimmed = queryValue.trim();
  const candidate = trimmed.endsWith('.qml') ? trimmed : `${trimmed}.qml`;
  if (sources[candidate] !== undefined) return candidate;
  const lower = candidate.toLowerCase();
  return Object.keys(sources).find((k) => k.toLowerCase() === lower) || null;
}

function run({ fromAutoRun = false } = {}) {
  clearTimeout(runTimer);
  runTimer = null;
  exampleTitleSeenSinceRun = false;
  problems.replaceChildren();
  commitEditor();
  if (!instance) {
    updatePreviewFallback();
    return;
  }

  const shouldFocusTerminal = !fromAutoRun && !editor.hasFocus;

  if (mode === 'playground') {
    const code = playgroundSources[playgroundKey];
    term.reset();
    const result = instance.qmltuiLoadQml(code, 'Main.qml');
    if (!result) {
      pushTerminalPaletteToEngine();
      status.textContent = 'running';
      if (shouldFocusTerminal) term.focus();
      return;
    }
    const errors = JSON.parse(result);
    status.textContent = `${errors.length} error${errors.length === 1 ? '' : 's'} in Main.qml`;
    for (const e of errors) addProblem('error', `Main.qml:${e.line}:${e.column}: ${e.message}`);
    return;
  }

  if (mode === 'example') {
    const result = instance.qmltuiCheckQml(sources[focusFile], `examples/${focusFile}`);
    if (result) {
      const errors = JSON.parse(result);
      status.textContent = `${errors.length} error${errors.length === 1 ? '' : 's'} in ${focusFile}`;
      for (const e of errors) addProblem('error', `${focusFile}:${e.line}:${e.column}: ${e.message}`);
      return;
    }
    instance.qmltuiWriteFile(`examples/${focusFile}`, sources[focusFile]);
  }
  term.reset();
  instance.qmltuiSetContextProperty('qmltuiAvailableExamples', JSON.stringify(Object.keys(sources).filter((f) => f !== 'PtyView.qml')));
  instance.qmltuiSetContextProperty('qmltuiGalleryPage', mode === 'example' && focusFile !== 'PtyView.qml' ? focusFile : '');
  const result = instance.qmltuiLoadQml(launcher, 'gallery.qml');
  if (!result) {
    pushTerminalPaletteToEngine();
    status.textContent = 'running';
    if (shouldFocusTerminal) term.focus();
    return;
  }
  const errors = JSON.parse(result);
  status.textContent = `${errors.length} error${errors.length === 1 ? '' : 's'}`;
  for (const e of errors) addProblem('error', `${e.file || 'gallery.qml'}:${e.line}:${e.column}: ${e.message}`);
}

$('run').onclick = () => {
  run({ fromAutoRun: false });
  if (term) term.focus();
};
if (btnPlayground) {
  btnPlayground.onclick = () => {
    showPlayground(playgroundKey || '__playground__');
    run();
  };
}
if (btnGallery) {
  btnGallery.onclick = () => {
    showGrid();
    run();
  };
}
if ($('drawerToggleBtn')) {
  $('drawerToggleBtn').onclick = () => {
    setEditorVisible(document.body.classList.contains('editor-hidden'));
  };
}
if ($('resetCode')) {
  $('resetCode').onclick = () => {
    if (mode === 'playground') {
      playgroundSources[playgroundKey] = initialPlaygroundSources[playgroundKey];
      setDoc(playgroundSources[playgroundKey], true);
    } else if (mode === 'example' && focusFile) {
      sources[focusFile] = initialSources[focusFile];
      setDoc(sources[focusFile], true);
    } else {
      launcher = initialLauncher;
    }
    run();
  };
}
if (exampleSelect) {
  exampleSelect.onchange = () => {
    const val = exampleSelect.value;
    if (val === '__playground__' || val === '__inline__') {
      showPlayground(val);
    } else if (!val) {
      showGrid();
    } else {
      focusExample(val);
    }
    run();
  };
}
$('share').onclick = async () => {
  commitEditor();
  location.hash = 'code=' + await encodeShare(JSON.stringify({
    mode,
    playgroundKey,
    playgroundSource: playgroundSources[playgroundKey],
    launcher,
    sources,
    focusFile,
  }));
  await navigator.clipboard?.writeText(location.href).catch(() => {});
  status.textContent = 'link copied to clipboard';
};

window.addEventListener('message', (ev) => {
  if (!ev.data) return;
  if (ev.data.type === 'qmltui:selectExample') {
    const file = resolveExampleFile(ev.data.example);
    if (file) {
      focusExample(file);
      run();
    } else if (!ev.data.example) {
      showGrid();
      run();
    }
  } else if (ev.data.type === 'qmltui:loadPlaygroundCode' && typeof ev.data.code === 'string') {
    playgroundSources.__playground__ = ev.data.code;
    showPlayground('__playground__');
    run();
  }
});

function getQueryParam(key) {
  const own = new URLSearchParams(location.search).get(key);
  if (own !== null) return own;
  try {
    return new URLSearchParams(window.parent?.location?.search || '').get(key);
  } catch {
    return null;
  }
}

// --- Boot --------------------------------------------------------------------
(async () => {
  launcher = await (await fetch('gallery.qml')).text();
  initialLauncher = launcher;
  const names = await (await fetch('examples/index.json')).json();
  await Promise.all(names.map(async (name) => {
    const text = await (await fetch(`examples/${name}`)).text();
    sources[name] = text;
    initialSources[name] = text;
  }));

  if (exampleSelect) {
    const galleryGroup = exampleSelect.querySelector('optgroup[label="Component Gallery"]') || exampleSelect;
    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name.replace(/\.qml$/, '');
      galleryGroup.append(opt);
    }
  }

  const codeParam = getQueryParam('code');
  const exampleParam = getQueryParam('example');
  const modeParam = getQueryParam('mode');

  let initialExample = exampleParam ? resolveExampleFile(exampleParam) : null;
  let startInGalleryGrid = modeParam === 'gallery';
  let startPlaygroundKey = modeParam === 'inline' ? '__inline__' : '__playground__';

  if (codeParam) {
    try {
      const decoded = decodeBase64UrlUtf8(codeParam);
      if (decoded.trim()) {
        playgroundSources.__playground__ = decoded;
        initialPlaygroundSources.__playground__ = decoded;
        initialExample = null;
        startInGalleryGrid = false;
        startPlaygroundKey = '__playground__';
      }
    } catch {
      addProblem('warning', 'could not decode ?code= parameter in URL');
    }
  }

  const m = location.hash.match(/#code=([A-Za-z0-9_-]+)/);
  if (m) {
    try {
      const shared = JSON.parse(await decodeShare(m[1]));
      launcher = shared.launcher ?? launcher;
      Object.assign(sources, shared.sources ?? {});
      if (shared.playgroundSource) {
        const k = shared.playgroundKey || '__playground__';
        playgroundSources[k] = shared.playgroundSource;
      }
      if (shared.mode === 'playground') {
        initialExample = null;
        startInGalleryGrid = false;
        startPlaygroundKey = shared.playgroundKey || '__playground__';
      } else if (shared.focusFile && sources[shared.focusFile]) {
        initialExample = shared.focusFile;
      } else if (shared.mode === 'grid') {
        startInGalleryGrid = true;
      }
    } catch { addProblem('warning', 'could not decode the shared code in the URL'); }
  }

  if (initialExample) {
    focusExample(initialExample);
  } else if (startInGalleryGrid) {
    showGrid();
  } else {
    showPlayground(startPlaygroundKey);
  }

  initSettingsPanel();
  await startRuntime();
  if (instance) {
    for (const [name, code] of Object.entries(sources)) {
      instance.qmltuiWriteFile(`examples/${name}`, code);
    }
  }
  run();
})().catch((e) => { status.textContent = `failed: ${e.message || e}`; console.error(e); });
