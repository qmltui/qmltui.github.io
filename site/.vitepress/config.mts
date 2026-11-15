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
    version: '0.5.0',
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
        const html = defaultFence(tokens, idx, options, env, self)
        const info = tokens[idx]?.info || ''
        if (/\bno-playground\b/.test(info)) {
          return html.replace(
            /^<div class="language-/,
            '<div data-no-playground="true" class="language-'
          )
        }
        return html
      }
    }
  },

  head: [
    [
      'link',
      { rel: 'icon', type: 'image/svg+xml', href: `${siteBase}assets/branding/qmltui_mark.svg` }
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
        text: `v${meta.version} (${meta.commitShort})`,
        link: `${meta.repoUrl}/tree/${meta.commit}`
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
