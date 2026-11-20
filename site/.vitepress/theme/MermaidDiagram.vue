<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  code: string
}>()

const { isDark } = useData()
const svgMarkup = ref('')
const renderError = ref('')
const expanded = ref(false)
const containerEl = ref<HTMLElement | null>(null)
const modalEl = ref<HTMLElement | null>(null)

const decodedSource = computed(() => {
  try {
    return decodeURIComponent(props.code).trim()
  } catch {
    return props.code.trim()
  }
})

let lastBindFunctions: ((element: Element) => void) | undefined

const DARK_VARS = {
  darkMode: true,
  background: '#0d1117',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSize: '16px',
  primaryColor: '#161b22',
  primaryTextColor: '#f0f6fc',
  primaryBorderColor: '#2cde85',
  secondaryColor: '#0f241b',
  secondaryTextColor: '#e6edf3',
  secondaryBorderColor: '#2cde85',
  tertiaryColor: '#161b22',
  tertiaryTextColor: '#c9d1d9',
  tertiaryBorderColor: '#30363d',
  lineColor: '#58a6ff',
  textColor: '#e6edf3',
  mainBkg: '#161b22',
  nodeBorder: '#2cde85',
  clusterBkg: '#11161e',
  clusterBorder: '#30363d',
  titleColor: '#f0f6fc',
  edgeLabelBackground: '#0d1117',
  actorBkg: '#161b22',
  actorBorder: '#2cde85',
  actorTextColor: '#f0f6fc',
  actorLineColor: '#30363d',
  signalColor: '#c9d1d9',
  signalTextColor: '#f0f6fc',
  labelBoxBkgColor: '#0f241b',
  labelBoxBorderColor: '#2cde85',
  labelTextColor: '#2cde85',
  loopTextColor: '#c9d1d9',
  noteBkgColor: '#132238',
  noteBorderColor: '#58a6ff',
  noteTextColor: '#e6edf3',
  activationBorderColor: '#2cde85',
  activationBkgColor: '#0f241b'
}

const LIGHT_VARS = {
  darkMode: false,
  background: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSize: '16px',
  primaryColor: '#f6f8fa',
  primaryTextColor: '#1f2328',
  primaryBorderColor: '#00a651',
  secondaryColor: '#e6f7ee',
  secondaryTextColor: '#1f2328',
  secondaryBorderColor: '#00a651',
  tertiaryColor: '#f6f8fa',
  tertiaryTextColor: '#1f2328',
  tertiaryBorderColor: '#d0d7de',
  lineColor: '#0969da',
  textColor: '#1f2328',
  mainBkg: '#f6f8fa',
  nodeBorder: '#00a651',
  clusterBkg: '#f6f8fa',
  clusterBorder: '#d0d7de',
  titleColor: '#1f2328',
  edgeLabelBackground: '#ffffff',
  actorBkg: '#f6f8fa',
  actorBorder: '#00a651',
  actorTextColor: '#1f2328',
  actorLineColor: '#d0d7de',
  signalColor: '#1f2328',
  signalTextColor: '#1f2328',
  labelBoxBkgColor: '#e6f7ee',
  labelBoxBorderColor: '#00a651',
  labelTextColor: '#008f45',
  loopTextColor: '#1f2328',
  noteBkgColor: '#ddf4ff',
  noteBorderColor: '#0969da',
  noteTextColor: '#1f2328',
  activationBorderColor: '#00a651',
  activationBkgColor: '#e6f7ee'
}

function getRenderQueue(): Promise<void> {
  const g = globalThis as { __qmltuiMermaidQueue?: Promise<void> }
  return g.__qmltuiMermaidQueue ?? Promise.resolve()
}

function setRenderQueue(p: Promise<void>): void {
  const g = globalThis as { __qmltuiMermaidQueue?: Promise<void> }
  g.__qmltuiMermaidQueue = p
}

function nextRenderId(): string {
  const g = globalThis as { __qmltuiMermaidSeq?: number }
  g.__qmltuiMermaidSeq = (g.__qmltuiMermaidSeq ?? 0) + 1
  return `qmltui-mermaid-${g.__qmltuiMermaidSeq}`
}

async function renderDiagram(): Promise<void> {
  if (typeof window === 'undefined' || !decodedSource.value) return
  const dark = isDark.value
  const src = decodedSource.value

  const run = getRenderQueue().then(async () => {
    try {
      const mod = await import('mermaid')
      const mermaid = mod.default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: dark ? DARK_VARS : LIGHT_VARS,
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          padding: 16,
          nodeSpacing: 36,
          rankSpacing: 42,
          wrappingWidth: 280,
          useMaxWidth: true
        },
        sequence: {
          useMaxWidth: true,
          mirrorActors: false,
          width: 150,
          actorMargin: 36,
          messageMargin: 38,
          boxMargin: 12,
          actorFontSize: 15,
          messageFontSize: 15,
          noteFontSize: 14
        }
      })

      const id = nextRenderId()
      const { svg, bindFunctions } = await mermaid.render(id, src)
      renderError.value = ''
      svgMarkup.value = svg
      lastBindFunctions = bindFunctions
      await nextTick()
      if (containerEl.value && bindFunctions) {
        bindFunctions(containerEl.value)
      }
    } catch (err) {
      renderError.value = err instanceof Error ? err.message : String(err)
      svgMarkup.value = ''
    }
  })

  setRenderQueue(run.catch(() => {}))
  await run
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && expanded.value) {
    expanded.value = false
  }
}

watch(expanded, async (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) {
    await nextTick()
    if (modalEl.value && lastBindFunctions) {
      lastBindFunctions(modalEl.value)
    }
  }
})

onMounted(() => {
  void renderDiagram()
  window.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
  }
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
  }
})

watch([isDark, decodedSource], () => {
  void renderDiagram()
})
</script>

<template>
  <div class="qmltui-mermaid">
    <div v-if="renderError" class="qmltui-mermaid-error">
      <strong>Mermaid render error:</strong> {{ renderError }}
      <pre><code>{{ decodedSource }}</code></pre>
    </div>
    <template v-else>
      <button
        v-if="svgMarkup"
        type="button"
        class="qmltui-mermaid-zoom-btn"
        title="Expand diagram to full screen"
        aria-label="Expand diagram"
        @click="expanded = true"
      >
        Expand
      </button>
      <div
        ref="containerEl"
        class="qmltui-mermaid-canvas"
        @click="expanded = true"
        v-html="svgMarkup"
      />
      <pre v-if="!svgMarkup" class="qmltui-mermaid-fallback"><code>{{ decodedSource }}</code></pre>
    </template>

    <Teleport to="body">
      <div
        v-if="expanded"
        class="qmltui-mermaid-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Expanded diagram"
        @click.self="expanded = false"
      >
        <div class="qmltui-mermaid-modal-inner">
          <button
            type="button"
            class="qmltui-mermaid-modal-close"
            aria-label="Close expanded diagram"
            @click="expanded = false"
          >
            Close (Esc)
          </button>
          <div ref="modalEl" class="qmltui-mermaid-modal-canvas" v-html="svgMarkup" />
        </div>
      </div>
    </Teleport>
  </div>
</template>
