<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, withBase } from 'vitepress'

const route = useRoute()
const iframeSrc = ref('')

function updateIframeSrc(): void {
  if (typeof window === 'undefined') return
  const base = withBase('/playground/index.html')
  const search = window.location.search || ''
  const hash = window.location.hash || ''
  const next = `${base}${search}${hash}`
  if (iframeSrc.value !== next) {
    iframeSrc.value = next
  }
}

onMounted(() => {
  updateIframeSrc()
  window.addEventListener('popstate', updateIframeSrc)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('popstate', updateIframeSrc)
  }
})

watch(
  () => route.fullPath,
  () => {
    updateIframeSrc()
  }
)
</script>

<template>
  <div class="qmltui-playground-wrapper">
    <iframe
      v-if="iframeSrc"
      :src="iframeSrc"
      class="qmltui-playground-iframe"
      title="QmlTui WebAssembly Playground"
      allow="clipboard-read; clipboard-write"
    />
  </div>
</template>

<style scoped>
.qmltui-playground-wrapper {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1000;
  background: #0d1117;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.qmltui-playground-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #0d1117;
}
</style>
