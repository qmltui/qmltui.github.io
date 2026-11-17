<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useData, withBase } from 'vitepress'

interface PrimitiveChip {
  name: string
  link: string
}

interface InspirationLink {
  label: string
  url: string
}

interface ShowcaseApp {
  id: string
  slug: string
  label: string
  mode: string
  modeIcon: string
  modeKind: 'alt' | 'inline' | 'pty'
  gif: string
  width: number
  height: number
  inspiration?: InspirationLink
  summary: string
  primitives: PrimitiveChip[]
}

interface AppsMeta {
  repoUrl?: string
  commit?: string
  staged?: boolean
}

const ITEMS: ShowcaseApp[] = [
  {
    id: 'qtop',
    slug: 'qtop',
    label: 'System Monitor',
    mode: 'AltScreen',
    modeIcon: '◆',
    modeKind: 'alt',
    gif: '/assets/showcase/qtop.gif',
    width: 1286,
    height: 963,
    inspiration: {
      label: 'aristocratos/btop',
      url: 'https://github.com/aristocratos/btop'
    },
    summary:
      'UI layout study recreating Braille CPU history graphs, per-core meters, animated collapsible panels, and a sortable QAbstractTableModel process TableView in ~770 lines of QML.',
    primitives: [
      { name: 'Canvas.Braille', link: '/qml-types/canvas.html' },
      { name: 'TableView', link: '/qml-types/tableview.html' },
      { name: 'Sparkline', link: '/qml-types/sparkline.html' },
      { name: 'Behavior', link: '/qml-types/behavior.html' }
    ]
  },
  {
    id: 'audio_player',
    slug: 'audio-player',
    label: 'Audio Deck',
    mode: 'AltScreen',
    modeIcon: '◆',
    modeKind: 'alt',
    gif: '/assets/showcase/audio_player.gif',
    width: 1171,
    height: 829,
    summary:
      'Studio audio deck with real-time 60 Hz 24-band FFT spectrum and stereo radial Braille oscilloscope, playlist editor, and switchable ANSI skins.',
    primitives: [
      { name: 'Canvas.Braille', link: '/qml-types/canvas.html' },
      { name: 'Slider', link: '/qml-types/slider.html' },
      { name: 'State', link: '/qml-types/state.html' },
      { name: 'ColorAnimation', link: '/qml-types/coloranimation.html' }
    ]
  },
  {
    id: 'industrial_plc_hmi',
    slug: 'industrial-plc-hmi',
    label: 'SCADA HMI',
    mode: 'AltScreen',
    modeIcon: '◆',
    modeKind: 'alt',
    gif: '/assets/showcase/industrial_plc_hmi.gif',
    width: 1075,
    height: 784,
    summary:
      'ISA-101 operator SCADA console with telemetry gauges, multi-trace Braille scope, animated P&ID reactor mimic, modal safety interlocks, TableView audit log, I/O rack diagnostics, and 3 SCADA skins.',
    primitives: [
      { name: 'Canvas.Braille', link: '/qml-types/canvas.html' },
      { name: 'Panel', link: '/qml-types/panel.html' },
      { name: 'TableView', link: '/qml-types/tableview.html' },
      { name: 'Popup', link: '/qml-types/popup.html' }
    ]
  },
  {
    id: 'file_manager',
    slug: 'file-manager',
    label: 'Files + PTY',
    mode: 'AltScreen + PtyView',
    modeIcon: '⌘',
    modeKind: 'pty',
    gif: '/assets/showcase/file_manager.gif',
    width: 1171,
    height: 694,
    summary:
      'Three-column Miller file browser with syntax-highlighted source and Markdown previews, asynchronous Image / SVG / PDF rendering, and an embedded Unix shell.',
    primitives: [
      { name: 'PtyView', link: '/guides/pty-view.html' },
      { name: 'Image', link: '/qml-types/image.html' },
      { name: 'ListView', link: '/qml-types/listview.html' },
      { name: 'FocusScope', link: '/qml-types/focusscope.html' }
    ]
  },
  {
    id: 'agent_stream',
    slug: 'agent-stream',
    label: 'Inline AI CLI',
    mode: 'Terminal.Inline',
    modeIcon: '▸',
    modeKind: 'inline',
    gif: '/assets/showcase/agent_stream.gif',
    width: 1171,
    height: 806,
    summary:
      'Interactive coding-agent CLI running directly in normal shell scrollback with Scrollback.print() history cards, slash-command autocomplete, and side-by-side diffs.',
    primitives: [
      { name: 'Terminal.Inline', link: '/guides/inline-mode.html' },
      { name: 'Scrollback', link: '/qml-types/scrollback.html' },
      { name: 'ListView', link: '/qml-types/listview.html' },
      { name: 'Popup', link: '/qml-types/popup.html' }
    ]
  },
  {
    id: 'package_manager',
    slug: 'package-manager',
    label: 'CLI Installer',
    mode: 'Terminal.Inline',
    modeIcon: '▸',
    modeKind: 'inline',
    gif: '/assets/showcase/package_manager.gif',
    width: 1056,
    height: 694,
    summary:
      'Multi-stage inline package installer (qpm) with interactive transaction TableView, dependency TreeView, 4-worker build ProgressBars, and Scrollback receipt cards.',
    primitives: [
      { name: 'Terminal.Inline', link: '/guides/inline-mode.html' },
      { name: 'TableView', link: '/qml-types/tableview.html' },
      { name: 'TreeView', link: '/qml-types/treeview.html' },
      { name: 'ProgressBar', link: '/qml-types/progressbar.html' }
    ]
  }
]

const { frontmatter, theme } = useData()

const activeIndex = ref(0)
const sectionRef = ref<HTMLElement | null>(null)
const tabRefs = ref<HTMLButtonElement[]>([])
const stageImgRef = ref<HTMLImageElement | null>(null)
const loadedGifs = ref<Record<string, boolean>>({})
const failedGifs = ref<Record<string, boolean>>({})

// Auto-rotation state: runs automatically until the user interacts with controls
const clientMounted = ref(false)
const autoRotateEnabled = ref(true)
const isHovered = ref(false)
const isDocHidden = ref(false)
const isInView = ref(true)
const cycleKey = ref(0)
let intersectionObserver: IntersectionObserver | null = null

const appsMeta = computed<AppsMeta>(() => {
  const raw = (theme.value as Record<string, unknown>)?.qmltuiApps as AppsMeta | undefined
  return {
    repoUrl: raw?.repoUrl || 'https://github.com/qmltui/apps',
    commit: raw?.commit || 'main',
    staged: raw?.staged !== false
  }
})

const currentApp = computed(() => ITEMS[activeIndex.value] ?? ITEMS[0])
const currentGifUrl = computed(() => withBase(currentApp.value.gif))
const isCurrentLoaded = computed(() => Boolean(loadedGifs.value[currentApp.value.id]))
const isCurrentFailed = computed(
  () => !appsMeta.value.staged || Boolean(failedGifs.value[currentApp.value.id])
)

const isRotationPaused = computed(
  () =>
    !clientMounted.value ||
    !autoRotateEnabled.value ||
    isHovered.value ||
    isDocHidden.value ||
    !isInView.value ||
    (!isCurrentLoaded.value && !isCurrentFailed.value)
)

const currentSourceUrl = computed(
  () => `${appsMeta.value.repoUrl}/tree/${appsMeta.value.commit}/apps/${currentApp.value.id}`
)
const currentDetailsUrl = computed(() => withBase(`/showcase.html#${currentApp.value.slug}`))
const allShowcaseUrl = computed(() => withBase('/showcase.html'))

function syncImageCompletion(): void {
  const el = stageImgRef.value
  const id = currentApp.value.id
  if (el && el.complete) {
    if (el.naturalWidth > 0) {
      loadedGifs.value[id] = true
    } else {
      failedGifs.value[id] = true
    }
  }
}

function setTab(index: number, focusElement = false): void {
  const count = ITEMS.length
  const normalized = ((index % count) + count) % count
  activeIndex.value = normalized
  cycleKey.value++
  nextTick(() => {
    syncImageCompletion()
    if (focusElement) {
      tabRefs.value[normalized]?.focus()
    }
  })
}

function handleUserSelectTab(index: number, focusElement = false): void {
  autoRotateEnabled.value = false
  setTab(index, focusElement)
}

function handleAutoAdvance(): void {
  if (!autoRotateEnabled.value) return
  setTab(activeIndex.value + 1, false)
}

function toggleAutoRotate(): void {
  autoRotateEnabled.value = !autoRotateEnabled.value
  if (autoRotateEnabled.value) {
    cycleKey.value++
  }
}

function handleTabKeydown(event: KeyboardEvent, index: number): void {
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    handleUserSelectTab(index + 1, true)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    handleUserSelectTab(index - 1, true)
  } else if (event.key === 'Home') {
    event.preventDefault()
    handleUserSelectTab(0, true)
  } else if (event.key === 'End') {
    event.preventDefault()
    handleUserSelectTab(ITEMS.length - 1, true)
  }
}

function markLoaded(id: string): void {
  loadedGifs.value[id] = true
}

function markFailed(id: string): void {
  failedGifs.value[id] = true
}

function handleVisibilityChange(): void {
  if (typeof document !== 'undefined') {
    isDocHidden.value = document.hidden
  }
}

onMounted(() => {
  clientMounted.value = true
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    autoRotateEnabled.value = false
  }
  handleVisibilityChange()
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
  if (typeof IntersectionObserver !== 'undefined' && sectionRef.value) {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry) {
          isInView.value = entry.isIntersecting
        }
      },
      { threshold: 0.1 }
    )
    intersectionObserver.observe(sectionRef.value)
  }
  syncImageCompletion()
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
  if (intersectionObserver) {
    intersectionObserver.disconnect()
    intersectionObserver = null
  }
})
</script>

<template>
  <section
    v-if="frontmatter.layout === 'home' || frontmatter.isHomeOverview"
    ref="sectionRef"
    class="qmltui-home-showcase"
    :class="{ 'in-doc-overview': Boolean(frontmatter.isHomeOverview) }"
    aria-labelledby="qmltui-showcase-heading"
  >
    <div class="showcase-container">
      <div class="showcase-header">
        <div class="showcase-heading-group">
          <h2 id="qmltui-showcase-heading" class="showcase-title">Demo Apps</h2>
          <p class="showcase-subtitle">
            Full-screen dashboards, inline CLI sessions, sub-cell Braille plots, and embedded PTY
            tools running natively in the terminal.
          </p>
        </div>

        <div class="showcase-header-actions">
          <button
            type="button"
            class="autorotate-btn"
            :aria-pressed="autoRotateEnabled"
            :title="
              autoRotateEnabled
                ? 'Pause automatic showcase rotation'
                : 'Resume automatic showcase rotation'
            "
            @click="toggleAutoRotate"
          >
            <span aria-hidden="true">{{ autoRotateEnabled ? '⏸' : '▶' }}</span>
            <span>{{ autoRotateEnabled ? 'Auto' : 'Paused' }}</span>
          </button>

          <a :href="allShowcaseUrl" class="showcase-all-link">
            Browse all 12 apps <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>

      <div class="showcase-tablist" role="tablist" aria-label="Demo QmlTui applications">
        <button
          v-for="(item, idx) in ITEMS"
          :id="`showcase-tab-${item.id}`"
          :key="item.id"
          ref="tabRefs"
          type="button"
          role="tab"
          class="showcase-tab"
          :class="{ active: idx === activeIndex }"
          :aria-selected="idx === activeIndex"
          :aria-controls="`showcase-panel-${item.id}`"
          :tabindex="idx === activeIndex ? 0 : -1"
          @click="handleUserSelectTab(idx)"
          @keydown="handleTabKeydown($event, idx)"
        >
          <span class="tab-label">{{ item.label }}</span>
          <code class="tab-cmd">{{ item.id }}</code>
          <span
            v-if="idx === activeIndex && clientMounted && autoRotateEnabled"
            :key="`${item.id}-${cycleKey}`"
            class="tab-progress"
            :class="{ paused: isRotationPaused }"
            aria-hidden="true"
            @animationend.self="handleAutoAdvance"
          />
        </button>
      </div>

      <div
        :id="`showcase-panel-${currentApp.id}`"
        role="tabpanel"
        class="terminal-window"
        :aria-labelledby="`showcase-tab-${currentApp.id}`"
        @mouseenter="isHovered = true"
        @mouseleave="isHovered = false"
      >
        <div class="terminal-chrome">
          <div class="chrome-left">
            <span class="window-dots" aria-hidden="true">
              <span class="dot dot-close" />
              <span class="dot dot-min" />
              <span class="dot dot-max" />
            </span>
            <code class="chrome-command">
              $ ./build/apps/{{ currentApp.id }}/qmltui_{{ currentApp.id }}
            </code>
            <span class="mode-badge" :class="`mode-${currentApp.modeKind}`">
              <span aria-hidden="true">{{ currentApp.modeIcon }}</span>
              {{ currentApp.mode }}
            </span>
          </div>

          <div class="chrome-actions">
            <a :href="currentDetailsUrl" class="chrome-link">
              App details <span aria-hidden="true">→</span>
            </a>
            <a
              :href="currentSourceUrl"
              target="_blank"
              rel="noopener"
              class="chrome-link chrome-link-source"
            >
              Source <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        <div class="terminal-stage">
          <img
            v-if="!isCurrentFailed"
            :key="currentApp.id"
            ref="stageImgRef"
            :src="currentGifUrl"
            :width="currentApp.width"
            :height="currentApp.height"
            :alt="`${currentApp.id} (${currentApp.label}) terminal recording`"
            class="stage-gif"
            :class="{ loaded: isCurrentLoaded }"
            decoding="async"
            @load="markLoaded(currentApp.id)"
            @error="markFailed(currentApp.id)"
          />

          <div v-if="!isCurrentLoaded && !isCurrentFailed" class="stage-status" role="status">
            Loading <code>{{ currentApp.id }}.gif</code>…
          </div>

          <div v-if="isCurrentFailed" class="stage-fallback">
            <p>
              Preview recording for <code>{{ currentApp.id }}</code> is available on the
              <a :href="currentDetailsUrl">Application Showcase</a> page and in
              <a :href="currentSourceUrl" target="_blank" rel="noopener">qmltui/apps</a>.
            </p>
          </div>
        </div>

        <div class="terminal-footer">
          <p class="footer-summary">
            <template v-if="currentApp.inspiration">
              Inspired by
              <a
                :href="currentApp.inspiration.url"
                target="_blank"
                rel="noopener"
                class="inspiration-link"
              >
                {{ currentApp.inspiration.label }} <span aria-hidden="true">↗</span>
              </a>
              —
            </template>
            {{ currentApp.summary }}
          </p>
          <div class="footer-chips" aria-label="QmlTui types used">
            <a
              v-for="chip in currentApp.primitives"
              :key="chip.name"
              :href="withBase(chip.link)"
              class="primitive-chip"
            >
              {{ chip.name }}
            </a>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.qmltui-home-showcase {
  padding: 0 24px;
  margin: 48px 0;
}

.qmltui-home-showcase.in-doc-overview {
  padding: 0;
  margin: 40px 0 0;
}

@media (min-width: 640px) {
  .qmltui-home-showcase {
    padding: 0 48px;
    margin: 56px 0;
  }

  .qmltui-home-showcase.in-doc-overview {
    padding: 0;
    margin: 48px 0 0;
  }
}

@media (min-width: 960px) {
  .qmltui-home-showcase {
    padding: 0 64px;
    margin: 64px 0;
  }

  .qmltui-home-showcase.in-doc-overview {
    padding: 0;
    margin: 48px 0 0;
  }
}

.showcase-container {
  margin: 0 auto;
  max-width: 1152px;
}

.showcase-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 24px;
  margin-bottom: 16px;
}

.showcase-heading-group {
  max-width: 68ch;
}

.showcase-title {
  margin: 0;
  font-size: 1.3125rem;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
}

.showcase-subtitle {
  margin: 6px 0 0;
  font-size: 1rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

.showcase-header-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.autorotate-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.autorotate-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.autorotate-btn:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.showcase-all-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 36px;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: none;
  white-space: nowrap;
}

.showcase-all-link:hover {
  color: var(--vp-c-brand-2);
  text-decoration: underline;
}

.showcase-all-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
  border-radius: 4px;
}

/* Tab Bar: wrap cleanly so button labels and command badges are never cropped */
.showcase-tablist {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 2px 0 12px;
}

.showcase-tab {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 6px 13px;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

.showcase-tab:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.showcase-tab.active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-text-1);
}

.showcase-tab:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.tab-cmd {
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(127, 138, 150, 0.14);
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
}

.showcase-tab.active .tab-cmd {
  background: rgba(44, 222, 133, 0.18);
  color: var(--vp-c-brand-1);
}

.tab-progress {
  position: absolute;
  left: 6px;
  right: 6px;
  bottom: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--vp-c-brand-1);
  transform-origin: left center;
  animation: showcase-tab-progress 4s linear forwards;
}

.tab-progress.paused {
  animation-play-state: paused;
}

@keyframes showcase-tab-progress {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

/* Terminal Window Card */
.terminal-window {
  border-radius: 12px;
  border: 1px solid rgba(139, 148, 158, 0.28);
  background: #0d1117;
  color: #e6edf3;
  overflow: hidden;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.26);
}

.terminal-chrome {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 10px 16px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
}

.chrome-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.window-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot-close {
  background: #ff5f56;
}

.dot-min {
  background: #ffbd2e;
}

.dot-max {
  background: #27c93f;
}

.chrome-command {
  font-family: var(--vp-font-family-mono);
  font-size: 0.8125rem;
  color: #c9d1d9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid #30363d;
  background: #21262d;
  color: #c9d1d9;
}

.mode-badge.mode-alt {
  border-color: rgba(88, 166, 255, 0.4);
  background: rgba(56, 139, 253, 0.14);
  color: #79c0ff;
}

.mode-badge.mode-inline {
  border-color: rgba(44, 222, 133, 0.42);
  background: rgba(44, 222, 133, 0.14);
  color: #2cde85;
}

.mode-badge.mode-pty {
  border-color: rgba(210, 168, 255, 0.42);
  background: rgba(188, 140, 255, 0.14);
  color: #d2a8ff;
}

.chrome-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.chrome-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #8b949e;
  text-decoration: none;
  transition: color 0.15s ease;
}

.chrome-link:hover {
  color: #e6edf3;
}

.chrome-link-source {
  color: #2cde85;
}

.chrome-link-source:hover {
  color: #00ff66;
}

.chrome-link:focus-visible {
  outline: 2px solid #2cde85;
  outline-offset: 2px;
  border-radius: 4px;
}

/* Terminal body wraps each recording naturally like .qmltui-term-gif-body on /showcase */
.terminal-stage {
  position: relative;
  display: block;
  width: 100%;
  padding: 6px;
  background: #121314;
  line-height: 0;
}

.stage-gif {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.18s ease-out;
}

.stage-gif.loaded {
  opacity: 1;
}

.stage-status,
.stage-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  font-size: 0.875rem;
  line-height: 1.5;
  color: #8b949e;
}

.stage-status {
  position: absolute;
  inset: 0;
}

.stage-fallback {
  min-height: 220px;
}

.stage-status code,
.stage-fallback code {
  margin: 0 4px;
  font-family: var(--vp-font-family-mono);
  color: #c9d1d9;
}

.stage-fallback a {
  color: #2cde85;
  text-decoration: underline;
}

/* Footer summary + primitive links */
.terminal-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  padding: 12px 16px;
  background: #161b22;
  border-top: 1px solid #30363d;
}

.footer-summary {
  margin: 0;
  flex: 1 1 360px;
  max-width: 74ch;
  font-size: 0.875rem;
  line-height: 1.5;
  color: #c9d1d9;
}

.inspiration-link {
  font-family: var(--vp-font-family-mono);
  font-size: 0.8125rem;
  color: #2cde85;
  text-decoration: none;
}

.inspiration-link:hover {
  color: #00ff66;
  text-decoration: underline;
}

.inspiration-link:focus-visible {
  outline: 2px solid #2cde85;
  outline-offset: 2px;
  border-radius: 3px;
}

.footer-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.primitive-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 2px 9px;
  border-radius: 6px;
  border: 1px solid #30363d;
  background: #0d1117;
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: #2cde85;
  text-decoration: none;
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}

.primitive-chip:hover {
  border-color: #2cde85;
  background: #122d24;
  color: #00ff66;
}

.primitive-chip:focus-visible {
  outline: 2px solid #2cde85;
  outline-offset: 2px;
}

@media (max-width: 639px) {
  .chrome-command {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .showcase-tab,
  .autorotate-btn,
  .chrome-link,
  .stage-gif,
  .primitive-chip {
    transition: none;
  }

  .tab-progress {
    animation: none;
  }
}
</style>
