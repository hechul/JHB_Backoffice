export default defineNuxtPlugin(() => {
  if (import.meta.server || import.meta.dev) return
  if (!('serviceWorker' in navigator)) return

  const runtimeConfig = useRuntimeConfig()
  const version = encodeURIComponent(String(runtimeConfig.public.pwaVersion || 'phase1'))

  const registerServiceWorker = async () => {
    if (!window.isSecureContext) return

    try {
      await navigator.serviceWorker.register(`/sw.js?v=${version}`, {
        scope: '/',
        updateViaCache: 'none',
      })
    } catch (error) {
      console.error('[pwa] service worker registration failed:', error)
    }
  }

  if (document.readyState === 'complete') {
    void registerServiceWorker()
    return
  }

  window.addEventListener('load', () => {
    void registerServiceWorker()
  }, { once: true })
})
