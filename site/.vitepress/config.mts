import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type DefaultTheme } from 'vitepress'

const vitepressDir = path.dirname(fileURLToPath(import.meta.url))

interface BuildMeta {
  version: string
  commit: string
  commitShort: string
  repoUrl: string
  appsRepoUrl?: string
  appsCommit?: string
  showcaseStaged?: boolean
  wasmStaged: boolean
}

interface RawNavNode {
  text: string
  link?: string
  target?: string
  collapsed?: boolean
  websiteOnly?: boolean
  items?: RawNavNode[]
}

function loadBuildMeta(): BuildMeta {
  const metaPath = path.join(vitepressDir, 'build-meta.json')
  if (fs.existsSync(metaPath)) {
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as BuildMeta
    } catch {
      // Fall through to default
    }
  }
  return {
    version: '0.6.0',
    commit: 'main',
    commitShort: 'main',
    repoUrl: 'https://github.com/qmltui/qmltui',
    appsRepoUrl: 'https://github.com/qmltui/apps',
    wasmStaged: false
  }
}

function sanitizeSidebarNodes(nodes: RawNavNode[]): DefaultTheme.SidebarItem[] {
  return nodes.map((node) => {
    const item: DefaultTheme.SidebarItem = { text: node.text }
    if (node.link) item.link = node.link
    if (node.target) item.target = node.target
    if (typeof node.collapsed === 'boolean') item.collapsed = node.collapsed
    if (Array.isArray(node.items)) item.items = sanitizeSidebarNodes(node.items)
    return item
  })
}

function loadSidebar(): DefaultTheme.SidebarItem[] {
  const navPath = path.join(vitepressDir, 'nav.json')
  if (fs.existsSync(navPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(navPath, 'utf8')) as { sidebar?: RawNavNode[] }
      if (Array.isArray(parsed.sidebar)) {
        return sanitizeSidebarNodes(parsed.sidebar)
      }
    } catch {
      // Fall through to minimal fallback
    }
  }
  return [
    {
      text: 'Getting Started',
      collapsed: false,
      items: [
        { text: 'Overview', link: '/' },
        { text: 'Getting Started Tutorial', link: '/getting-started' },
        { text: 'Application Showcase', link: '/showcase' },
        { text: 'Examples & Recipes', link: '/examples' }
      ]
    }
  ]
}

function detectBase(): string {
  if (process.env.VITEPRESS_BASE) {
    const raw = process.env.VITEPRESS_BASE.trim()
    const withLeading = raw.startsWith('/') ? raw : `/${raw}`
    return withLeading.endsWith('/') ? withLeading : `${withLeading}/`
  }
  if (process.env.CI_PAGES_URL) {
    try {
      const pathname = new URL(process.env.CI_PAGES_URL).pathname
      return pathname.endsWith('/') ? pathname : `${pathname}/`
    } catch {
      return '/'
    }
  }
  return '/'
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const RECIPE_TARGETS: Record<string, string> = {
  big_text: 'qmltui_big_text_demo',
  calendar: 'qmltui_calendar_demo',
  inline_mode: 'qmltui_inline_repl_demo',
  standard_item_delegate: 'qmltui_standard_item_delegate_demo',
  status_badge: 'qmltui_status_badge_demo',
  text_area_highlighting: 'qmltui_text_area_highlighting_demo'
}

function deriveTerminalCommand(rawSrc: string): string {
  const clean = rawSrc.split(/[?#]/)[0] || ''
  const showcaseMatch = clean.match(/assets\/showcase\/([a-z0-9_]+)\.gif$/i)
  if (showcaseMatch) {
    return `$ ./qmltui_${showcaseMatch[1]}`
  }
  if (/gallery-tour\.gif$/i.test(clean)) {
    return '$ ./qmltui_gallery'
  }
  if (/hello-world\.gif$/i.test(clean)) {
    return '$ ./hello_qmltui'
  }
  const compMatch = clean.match(/assets\/casts\/components\/([a-z0-9_]+)\.gif$/i)
  if (compMatch) {
    const stem = compMatch[1]
    if (RECIPE_TARGETS[stem]) {
      return `$ ./${RECIPE_TARGETS[stem]}`
    }
    const pascal = stem
      .split('_')
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
      .join('')
    return `$ ./qmltui_gallery --example ${pascal}`
  }
  const fallback = clean.split('/').pop()?.replace(/\.gif$/i, '') || 'app'
  return `$ ./${fallback}`
}

const meta = loadBuildMeta()
const siteBase = detectBase()

export default defineConfig({
  title: 'QmlTui',
  description: 'Retained-mode terminal UI framework for C++17 and Qt 6',
  base: siteBase,
  srcDir: '.',
  outDir: '../public',
  srcExclude: ['contributing/**'],
  cleanUrls: false,
  appearance: 'dark',
  sitemap: {
    hostname: 'https://qmltui.github.io/'
  },

  vite: {
    optimizeDeps: {
      // Exclude static files in docs/public/ (such as playground/index.html, which
      // resolves CodeMirror bare specifiers in the browser via <script type="importmap">).
      entries: ['.vitepress/theme/**/*.{ts,js,vue}', '**/*.html', '!public/**']
    }
  },

  rewrites: {
    'README.md': 'index.md'
  },

  markdown: {
    image: {
      lazyLoading: true
    },
    config(md) {
      const defaultFence = md.renderer.rules.fence!
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const info = (tokens[idx]?.info || '').trim()
        const lang = info.split(/\s+/)[0]
        if (lang === 'mermaid') {
          const encoded = encodeURIComponent(tokens[idx]?.content || '')
          return `<MermaidDiagram code="${encoded}" />\n`
        }
        const html = defaultFence(tokens, idx, options, env, self)
        if (/\bno-playground\b/.test(info)) {
          return html.replace(
            /^<div class="language-/,
            '<div data-no-playground="true" class="language-'
          )
        }
        return html
      }

      const defaultImage = md.renderer.rules.image!
      md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const imgHtml = defaultImage(tokens, idx, options, env, self)
        const rawSrc = tokens[idx]?.attrGet('src') || ''
        if (!/(?:^|\/)assets\/(?:casts|showcase)\/[^?#]+\.gif(?:[?#].*)?$/i.test(rawSrc)) {
          return imgHtml
        }
        const cmd = escapeHtml(deriveTerminalCommand(rawSrc))
        return (
          `<span class="qmltui-term-gif">` +
          `<span class="qmltui-term-gif-bar" aria-hidden="true">` +
          `<span class="qmltui-term-gif-dots">` +
          `<span class="dot dot-close"></span>` +
          `<span class="dot dot-min"></span>` +
          `<span class="dot dot-max"></span>` +
          `</span>` +
          `<code class="qmltui-term-gif-cmd">${cmd}</code>` +
          `<span class="qmltui-term-gif-badge">terminal</span>` +
          `</span>` +
          `<span class="qmltui-term-gif-body">${imgHtml}</span>` +
          `</span>`
        )
      }
    }
  },

  head: [
    [
      'link',
      { rel: 'icon', type: 'image/svg+xml', href: `${siteBase}assets/branding/qmltui_mark.svg` }
    ],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'QmlTui' }],
    ['meta', { property: 'og:title', content: 'QmlTui — Retained-Mode QML for the Terminal' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Build reactive terminal UIs with QML bindings and C++ models on QCoreApplication, without QtQuick, QtGui, or a display server.'
      }
    ],
    [
      'meta',
      {
        property: 'og:image',
        content: 'https://qmltui.github.io/assets/branding/qmltui_logo_sheet.png'
      }
    ],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    [
      'meta',
      {
        name: 'twitter:image',
        content: 'https://qmltui.github.io/assets/branding/qmltui_logo_sheet.png'
      }
    ],
    [
      'script',
      {},
      `try{if(localStorage.getItem('qmltui-sidebar-collapsed')==='1'){document.documentElement.classList.add('qmltui-sidebar-collapsed');}}catch(e){}`
    ]
  ],

  themeConfig: {
    logo: {
      light: '/assets/branding/qmltui_mark_light.svg',
      dark: '/assets/branding/qmltui_mark.svg'
    },

    search: {
      provider: 'local'
    },

    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Guides', link: '/guides/' },
      { text: 'Showcase', link: '/showcase' },
      { text: 'QML Types', link: '/qml-types/' },
      { text: 'C++ Reference', link: '/cpp-classes/' },
      { text: 'Examples', link: '/examples' },
      { text: 'Gallery', link: '/playground?mode=gallery', target: '_blank' },
      { text: 'Playground', link: '/playground', target: '_blank' },
      {
        text: `v${meta.version}`,
        items: [
          { text: 'Changelog', link: '/changes/changelog' },
          { text: 'GitHub Releases', link: `${meta.repoUrl}/releases` },
          { text: `Source (${meta.commitShort})`, link: `${meta.repoUrl}/tree/${meta.commit}` }
        ]
      }
    ],

    socialLinks: [{ icon: 'github', link: meta.repoUrl }],

    sidebar: loadSidebar(),

    footer: {
      message:
        'Documentation licensed under CC-BY-4.0. Library code under LGPL-3.0-only (WebAssembly demo binary: GPLv3).',
      copyright: 'Copyright © 2026 Yosri Ayed'
    },

    qmltuiApps: {
      repoUrl: meta.appsRepoUrl || 'https://github.com/qmltui/apps',
      commit: meta.appsCommit || 'main',
      staged: meta.showcaseStaged !== false
    }
  } as DefaultTheme.Config & {
    qmltuiApps: { repoUrl: string; commit: string; staged: boolean }
  }
})
