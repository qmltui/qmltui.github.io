<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useSidebar } from 'vitepress/theme'

const STORAGE_KEY = 'qmltui-sidebar-collapsed'

const { hasSidebar, isOpen, toggle: toggleMobileSidebar } = useSidebar()
const isDesktopCollapsed = ref(false)
const isDesktopViewport = ref(true)

function syncViewport(): void {
  if (typeof window === 'undefined') return
  isDesktopViewport.value = window.matchMedia('(min-width: 960px)').matches
}

function applyDesktopState(collapsed: boolean): void {
  isDesktopCollapsed.value = collapsed
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('qmltui-sidebar-collapsed', collapsed)
  }
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // Ignore storage restrictions
  }
}

function handleToggle(): void {
  if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 960px)').matches) {
    toggleMobileSidebar()
    return
  }
  applyDesktopState(!isDesktopCollapsed.value)
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return
    }
    if (!hasSidebar.value) return
    event.preventDefault()
    handleToggle()
  }
}

onMounted(() => {
  syncViewport()
  try {
    const saved = localStorage.getItem(STORAGE_KEY) === '1'
    isDesktopCollapsed.value =
      saved || document.documentElement.classList.contains('qmltui-sidebar-collapsed')
    document.documentElement.classList.toggle('qmltui-sidebar-collapsed', isDesktopCollapsed.value)
  } catch {
    isDesktopCollapsed.value = document.documentElement.classList.contains(
      'qmltui-sidebar-collapsed'
    )
  }
  window.addEventListener('resize', syncViewport)
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncViewport)
    window.removeEventListener('keydown', handleGlobalKeydown)
  }
})
</script>

<template>
  <button
    v-if="hasSidebar"
    type="button"
    class="qmltui-sidebar-toggle"
    :aria-expanded="isDesktopViewport ? !isDesktopCollapsed : isOpen"
    aria-controls="VPSidebarNav"
    :title="
      isDesktopViewport
        ? isDesktopCollapsed
          ? 'Show navigation sidebar (Ctrl+\\)'
          : 'Hide navigation sidebar (Ctrl+\\)'
        : 'Toggle navigation menu'
    "
    :aria-label="
      isDesktopViewport
        ? isDesktopCollapsed
          ? 'Show navigation sidebar'
          : 'Hide navigation sidebar'
        : 'Toggle navigation menu'
    "
    @click.stop.prevent="handleToggle"
  >
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </svg>
  </button>
</template>

<style scoped>
.qmltui-sidebar-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  margin-right: 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
}

.qmltui-sidebar-toggle:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border-color: var(--vp-c-divider);
}

.qmltui-sidebar-toggle:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .qmltui-sidebar-toggle {
    transition: none;
  }
}
</style>
