import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [
    react(),
    // pdf.js butuh file .wasm (JBIG2/OpenJPEG decoder) yang letaknya di
    // node_modules/pdfjs-dist/wasm/. Vite nggak otomatis nyalin folder ini
    // pas build, jadi kita copy manual ke /wasm di output biar ke-deploy
    // dan bisa diakses lewat wasmUrl: '/wasm/' di kode PdfHighlighter.
    viteStaticCopy({
      targets: [
        { src: 'node_modules/pdfjs-dist/wasm/*', dest: 'wasm' },
      ],
    }),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mainichi Daily Immersion',
        short_name: 'Mainichi',
        description: 'Jurnal immersion kosakata bahasa Jepang harian',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5f7f0',
        theme_color: '#4a7c59',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
        ]
      }
    })
  ],
})
