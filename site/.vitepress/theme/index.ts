import DefaultTheme, { VPHomeFeatures, VPHomeHero } from 'vitepress/theme'
import { useData, useRoute, withBase } from 'vitepress'
import type { Theme } from 'vitepress'
import { defineComponent, h, nextTick, onMounted, watch } from 'vue'
import HomeShowcase from './HomeShowcase.vue'
import MermaidDiagram from './MermaidDiagram.vue'
import PlaygroundPage from './PlaygroundPage.vue'
import SidebarToggle from './SidebarToggle.vue'
import { installStaleChunkRecovery } from './staleChunkRecovery'
import './custom.css'

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function preparePlaygroundQml(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').trim().split('\n')
  const headerLines: string[] = []
  const bodyLines: string[] = []
  let inHeader = true

  for (const line of lines) {
    const trimmed = line.trim()
    if (inHeader && (trimmed === '' || trimmed.startsWith('pragma ') || trimmed.startsWith('import '))) {
      if (trimmed.startsWith('pragma ') || trimmed.startsWith('import ')) {
        headerLines.push(trimmed)
      }
      continue
    }
    inHeader = false
    bodyLines.push(line)
  }

  const body = bodyLines.join('\n').trim()
  const hasPragma = headerLines.some((l) => l.startsWith('pragma ComponentBehavior'))
  const hasQmlTui = headerLines.some((l) => /^import\s+QmlTui\s*$/.test(l))
  const hasControls = headerLines.some((l) => /^import\s+QmlTui\.Controls\b/.test(l))

  const finalHeaders: string[] = []
  if (!hasPragma) finalHeaders.push('pragma ComponentBehavior: Bound')
  for (const h of headerLines) {
    if (h.startsWith('pragma ')) finalHeaders.push(h)
  }
  if (!hasQmlTui) finalHeaders.push('import QmlTui')
  if (!hasControls) finalHeaders.push('import QmlTui.Controls')
  for (const h of headerLines) {
    if (h.startsWith('import ') && !finalHeaders.includes(h)) {
      finalHeaders.push(h)
    }
  }

  if (/^Terminal\s*\{/.test(body)) {
    return `${finalHeaders.join('\n')}\n\n${body}\n`
  }

  const indentedBody = body
    .split('\n')
    .map((l) => (l.trim() ? `    ${l}` : ''))
    .join('\n')

  return (
    `${finalHeaders.join('\n')}\n\n` +
    `Terminal {\n` +
    `    id: root\n` +
    `    title: "QmlTui Playground"\n\n` +
    `${indentedBody}\n` +
    `}\n`
  )
}

function attachTryInPlaygroundButtons(): void {
  if (typeof document === 'undefined') return
  const blocks = document.querySelectorAll<HTMLElement>('.vp-doc div.language-qml')
  blocks.forEach((block) => {
    if (block.querySelector('.qmltui-try-btn') || block.hasAttribute('data-no-playground')) return
    const codeEl = block.querySelector('pre code')
    if (!codeEl) return
    const rawCode = codeEl.textContent || ''
    const trimmed = rawCode.trim()
    if (!trimmed) return

    // Skip snippets requiring Unix PTY or custom C++ QML modules absent from the browser bundle.
    if (/\bimport\s+QmlTui\.PtyView\b/.test(rawCode)) return
    if (/^\s*import\s+(?!QtQml(?:\.Models)?\b|QmlTui(?:\.(?:Controls|Image))?\b)[A-Z]\w*/m.test(rawCode)) {
      return
    }

    // Extract the root QML type after pragma/import headers and comments.
    const bodyWithoutHeaders = trimmed
      .replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/|pragma\s+[^\n]+|import\s+[^\n]+)\n?)+/, '')
      .trim()
    const rootMatch = bodyWithoutHeaders.match(/^([A-Z]\w*)\s*\{/)
    if (!rootMatch) return
    const rootType = rootMatch[1]
    const nonVisualRoots = new Set([
      'QtObject',
      'ListModel',
      'ListElement',
      'Component',
      'Timer',
      'Connections',
      'Binding',
      'Shortcut',
      'ButtonGroup',
      'State',
      'StateGroup',
      'PropertyChanges',
      'Transition',
      'Animation',
      'PropertyAnimation',
      'NumberAnimation',
      'ColorAnimation',
      'Behavior'
    ])
    if (nonVisualRoots.has(rootType)) return

    const hasTerminal = rootType === 'Terminal'
    const isGalleryExample =
      /^pragma\s+ComponentBehavior:\s*Bound\b/.test(trimmed) &&
      !/\bmodel:\s*processModel\b/.test(rawCode)
    if (!hasTerminal && !isGalleryExample) {
      return
    }

    const prepared = preparePlaygroundQml(rawCode)
    const encoded = toBase64Url(prepared)
    const link = document.createElement('a')
    link.className = 'qmltui-try-btn'
    link.href = `${withBase('/playground.html')}?code=${encoded}`
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = '▶ Try in Playground'
    link.title = 'Open and edit this QML snippet in the WebAssembly Playground'
    block.appendChild(link)
  })

  const playgroundLinks = document.querySelectorAll<HTMLAnchorElement>('a[href]')
  playgroundLinks.forEach((anchor) => {
    const href = anchor.getAttribute('href') || ''
    if (
      /(?:^|\/)playground(?:\.html|\/index\.html)?(?:[?#]|$)/.test(href) &&
      !anchor.hasAttribute('target')
    ) {
      anchor.target = '_blank'
      anchor.rel = 'noopener'
    }
  })
}

const CustomLayout = defineComponent({
  name: 'QmlTuiLayout',
  setup() {
    const { frontmatter } = useData()
    return () =>
      h(DefaultTheme.Layout, null, {
        'nav-bar-title-before': () => h(SidebarToggle),
        'home-features-after': () => h(HomeShowcase),
        'doc-before': () =>
          frontmatter.value.isHomeOverview
            ? h('div', { class: 'qmltui-home-overview-header' }, [
                h(VPHomeHero),
                h(VPHomeFeatures),
                h(HomeShowcase)
              ])
            : null
      })
  }
})

export default {
  extends: DefaultTheme,
  Layout: CustomLayout,
  enhanceApp({ app }) {
    installStaleChunkRecovery()
    app.component('MermaidDiagram', MermaidDiagram)
    app.component('PlaygroundPage', PlaygroundPage)
  },
  setup() {
    const route = useRoute()
    onMounted(() => {
      nextTick(() => attachTryInPlaygroundButtons())
    })
    watch(
      () => route.path,
      () => {
        nextTick(() => attachTryInPlaygroundButtons())
      }
    )
  }
} satisfies Theme
