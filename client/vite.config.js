import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:5000';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // A separate script file rather than an inline one, so the server's CSP can forbid inline scripts.
      injectRegister: 'script',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'KrishiScan — Crop Disease Detection',
        short_name: 'KrishiScan',
        description: 'Photograph a leaf, get a diagnosis and treatment advice, and see disease outbreaks near your farm.',
        theme_color: '#166534',
        background_color: '#f7f7f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        runtimeCaching: [
          {
            // The disease library is read-mostly: usable offline in the field.
            urlPattern: ({ url }) => /^\/api\/(crops|diseases)/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'library', expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/uploads/') || url.hostname === 'res.cloudinary.com',
            handler: 'CacheFirst',
            options: { cacheName: 'scan-images', expiration: { maxEntries: 150, maxAgeSeconds: 30 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // Proxying keeps dev same-origin, exactly like production, so cookies and CSP behave identically.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/uploads': { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet')) return 'map';
        },
      },
    },
  },
});
