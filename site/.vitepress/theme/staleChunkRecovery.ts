const RELOAD_STORAGE_KEY = 'qmltui:stale-chunk-reload'
const RELOAD_COOLDOWN_MS = 60_000

const DYNAMIC_IMPORT_ERROR_RE =
  /error loading dynamically imported module|failed to fetch dynamically imported module|importing a module script failed|unable to preload css|loading chunk [\w-]+ failed|dynamically imported module/i

let installed = false
let reloading = false

export function isDynamicImportError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return DYNAMIC_IMPORT_ERROR_RE.test(message)
}

export function isStaleChunkReloading(): boolean {
  return reloading
}

export function clearStaleChunkReloadMark(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(RELOAD_STORAGE_KEY)
  } catch {
    // Ignore storage restrictions.
  }
}

/**
 * Reloads the current page once (guarded by a short sessionStorage cooldown)
 * to recover from hashed lazy chunks deleted by a newer GitHub Pages deploy.
 * Returns true if a reload has been initiated.
 */
export function attemptStaleChunkReload(): boolean {
  if (typeof window === 'undefined') return false
  if (reloading) return true

  const currentPath = `${window.location.pathname}${window.location.search}`
  const now = Date.now()
  try {
    const raw = window.sessionStorage.getItem(RELOAD_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { path?: string; ts?: number }
      if (
        parsed.path === currentPath &&
        typeof parsed.ts === 'number' &&
        now - parsed.ts < RELOAD_COOLDOWN_MS
      ) {
        return false
      }
    }
    window.sessionStorage.setItem(
      RELOAD_STORAGE_KEY,
      JSON.stringify({ path: currentPath, ts: now })
    )
  } catch {
    // Without sessionStorage we cannot guard against infinite reload loops.
    return false
  }

  reloading = true
  window.location.reload()
  return true
}

export function installStaleChunkRecovery(): void {
  if (typeof window === 'undefined' || installed) return
  installed = true
  window.addEventListener('vite:preloadError', () => {
    attemptStaleChunkReload()
  })
}
