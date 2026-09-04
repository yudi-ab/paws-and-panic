import { defineConfig } from 'vite';

// Vite config for Paws & Panic.
// Env vars prefixed with VITE_ are exposed to the client via import.meta.env.
// Copy .env.example → .env and fill in your AGS credentials.
export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true,   // auto-open the browser on `npm run dev`
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
