// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxtjs/supabase'],

  supabase: {
    url: process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
    key: process.env.NUXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY || '',
    redirect: false, // 커스텀 미들웨어로 처리
  },

  nitro: {
    preset: 'vercel',
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'ko',
      },
      title: 'JHBioFarm 백오피스',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'JHBioFarm SmartStore Analytics & Filter' },
        { name: 'theme-color', content: '#1D63E9' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'JHBioFarm' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        {
          rel: 'stylesheet',
          href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
        },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    kakaoRestApiKey: process.env.KAKAO_REST_API_KEY || '',
    public: {
      pwaVersion: process.env.NUXT_PUBLIC_PWA_VERSION || '2026-03-16-phase1',
    },
  },

  dir: {
    pages: 'pages',
    layouts: 'layouts',
  },
})
