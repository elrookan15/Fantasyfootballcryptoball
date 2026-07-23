import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // SECURITY: Do NOT inject GEMINI_API_KEY / API_KEY into the client bundle.
      // The key must stay server-side. All GenAI calls go through the Express
      // proxy at /api/gemini (see server.ts).
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
