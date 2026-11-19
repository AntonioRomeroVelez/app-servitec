import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP } from './src/app.js'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // Pone el nombre del producto (src/app.js) en el título y en el nombre de la app en iOS
    { name: 'nombre-de-la-app', transformIndexHtml: (html) => html.replaceAll('__APP_NOMBRE__', APP.nombre) },
    // App instalable que abre sin conexión: el service worker guarda la app (HTML, JS, CSS, iconos).
    // Los datos y los cambios pendientes los maneja src/offline (IndexedDB); las llamadas al backend no se cachean aquí.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: `${APP.nombre} · ${APP.lema}`,
        short_name: APP.nombre,
        description: APP.descripcion,
        lang: 'es',
        theme_color: '#0b3a85',
        background_color: '#0b3a85',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
      },
    }),
  ],
})
