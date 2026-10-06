import eslint from 'vite-plugin-eslint2';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': 'http://127.0.0.1:8888',
    },
  },
  plugins: [
    eslint({
      cache: false,
      lintOnStart: true,
      lintDirtyOnly: false,
      include: ['src/**/*.js'],
      exclude: ['node_modules', 'virtual:', 'src/data/tackle.json'],
    }),
    // Preserve classic data scripts in built HTML (Vite strips non-module <script> tags)
    {
      name: 'data-scripts',
      transformIndexHtml(html, ctx) {
        if (ctx.bundle) {
          const tag = '<script src="/src/data/regions/washington.js"></script>\n' +
            '<script src="/src/data/channel_measurements.js"></script>\n' +
            '<script src="/src/data/river_widths.js"></script>\n' +
            '<script src="/src/data/spot_widths.js"></script>';
          // Insert data scripts before the module script
          return html.replace('<script type="module"', tag + '\n<script type="module"');
        }
        return html;
      }
    },
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'The Fish Report',
        short_name: 'Fish Report',
        description: 'Live water report, fishing window scoring and a deterministic Gear Sim for the Puyallup, White, Carbon, Green and Nisqually rivers.',
        start_url: '/',
        display: 'standalone',
        theme_color: '#1a1a1a',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
      },
    }),
  ],
});