import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [
        VitePWA({
          registerType: 'autoUpdate',
          strategies: 'injectManifest',
          srcDir: '.',
          filename: 'sw.ts',
          injectManifest: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          },
          includeAssets: ['metadata.json'],
          manifest: {
            name: 'PhotonFlux Nährstoffrechner',
            short_name: 'PhotonFlux',
            description: 'A React-based 3-part nutrient calculator for plant cultivation with customizable plans and offline support.',
            theme_color: '#22d3ee',
            background_color: '#0b1220',
            start_url: '/',
            scope: '/',
            display: 'standalone',
            lang: 'de',
          },
          devOptions: {
            enabled: true,
          },
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
