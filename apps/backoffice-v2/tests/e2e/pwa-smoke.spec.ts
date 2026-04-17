import { test, expect } from '@playwright/test'

test.describe('PWA Smoke', () => {
  test('renders install metadata on the login page', async ({ page }) => {
    await page.goto('/login')

    const installMetadata = await page.evaluate(() => ({
      manifestHref: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
      appleTouchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      mobileCapable: document.querySelector('meta[name="mobile-web-app-capable"]')?.getAttribute('content'),
      appleCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content'),
    }))

    expect(installMetadata).toEqual({
      manifestHref: '/manifest.webmanifest',
      appleTouchIcon: '/apple-touch-icon.png',
      themeColor: '#1D63E9',
      mobileCapable: 'yes',
      appleCapable: 'yes',
    })
  })

  test('serves a standalone manifest and conservative service worker', async ({ request }) => {
    const manifestResponse = await request.get('/manifest.webmanifest')
    expect(manifestResponse.ok()).toBeTruthy()

    const manifest = await manifestResponse.json()
    expect(manifest).toMatchObject({
      name: 'JHBioFarm 백오피스',
      short_name: 'JHBioFarm',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#1D63E9',
      background_color: '#F4F7FB',
    })
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512' }),
      expect.objectContaining({ src: '/icons/icon-maskable-512.png', purpose: 'maskable' }),
    ]))

    const serviceWorkerResponse = await request.get('/sw.js')
    expect(serviceWorkerResponse.ok()).toBeTruthy()

    const serviceWorkerText = await serviceWorkerResponse.text()
    expect(serviceWorkerText).toContain("url.pathname.startsWith('/api/')")
    expect(serviceWorkerText).toContain("request.mode === 'navigate'")
    expect(serviceWorkerText).toContain('staleWhileRevalidate')
  })
})
