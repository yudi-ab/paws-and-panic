import { defineConfig, loadEnv } from 'vite';

// Vite config for Paws & Panic.
// Env vars prefixed with VITE_ are exposed to the client via import.meta.env.
// Copy .env.example → .env and fill in your AGS credentials.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const agsTarget = env.VITE_AGS_BASE_URL || 'https://demo.accelbyte.io';

  // Use /paws-and-panic/ as base for GitHub Pages project repo
  // In production, assets will be served from github.io/paws-and-panic/
  const base = mode === 'production' ? '/paws-and-panic/' : '/';

  return {
    base,
    root: '.',
    server: {
      port: 5173,
      open: true,   // auto-open the browser on `npm run dev`
      proxy: {
        '/iam':     { target: agsTarget, changeOrigin: true },
        '/lobby':   { target: agsTarget, changeOrigin: true, ws: true },
        '/match2':  { target: agsTarget, changeOrigin: true },
        '/session': { target: agsTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
