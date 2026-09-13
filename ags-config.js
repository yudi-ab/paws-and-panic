// ═══════════════════════════════════════════════════════════════════════
// AGS CONFIG
// ───────────────────────────────────────────────────────────────────────
// Centralizes all AGS environment values. Reads from Vite's import.meta.env
// (populated from your .env file). Everything is optional — if credentials
// are missing, ags.js will detect it and keep the simulated placeholders.
//
// Supports separate dev and prod client IDs with dedicated redirect URIs.
// This allows different OAuth configurations per environment for safety.
// ═══════════════════════════════════════════════════════════════════════

const env = import.meta.env ?? {};

// ── Detect production environment ────────────────────────────────────────
// Vite build mode: 'development' vs 'production'
// Also checks if the app is hosted on GitHub Pages (contains 'github.io')
const isProduction = () => {
  return env.MODE === 'production' ||
         (typeof window !== 'undefined' && window.location.hostname.includes('github.io'));
};

// ── DEV MODE: route through Vite proxy (localhost:5173) ─────────────────
//    In production (GitHub Pages), use the real AGS URL directly
const getBaseURL = () => {
  if (env.MODE === 'development') {
    // In dev, use localhost:5173 as baseURL — Vite proxy intercepts paths
    // (e.g., /iam/v3/oauth/token → localhost:5173/iam/v3/oauth/token → proxy → AGS)
    return 'http://localhost:5173';
  }
  return env.VITE_AGS_BASE_URL || '';
};

// ── Select client ID based on environment ────────────────────────────────
// Production uses a separate, dedicated client ID for safety & isolation
const getClientId = () => {
  if (isProduction()) {
    return env.VITE_AGS_PROD_CLIENT_ID || env.VITE_AGS_CLIENT_ID || '';
  }
  return env.VITE_AGS_CLIENT_ID || '';
};

// ── Select redirect URI based on environment ─────────────────────────────
// Production has a separate redirect URI (e.g., GitHub Pages URL)
// Dev falls back to the dev redirect URI or the current origin
const getRedirectURI = () => {
  if (isProduction()) {
    // Production: use dedicated prod redirect URI if available
    if (env.VITE_AGS_PROD_REDIRECT_URI) {
      return env.VITE_AGS_PROD_REDIRECT_URI;
    }
    // Fallback: construct from current origin + base path
    return `${window.location.origin}${import.meta.env.BASE_URL}`;
  }
  // Dev: use dev redirect URI or construct from current origin
  if (env.VITE_AGS_REDIRECT_URI) {
    return env.VITE_AGS_REDIRECT_URI;
  }
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
};

export const AGS_CONFIG = Object.freeze({
  baseURL:     getBaseURL(),
  namespace:   env.VITE_AGS_NAMESPACE    || '',
  clientId:    getClientId(),                // Uses prod or dev client ID
  redirectURI: getRedirectURI(),             // Uses prod or dev redirect URI
  isProduction: isProduction(),              // Environment indicator

  matchPools: {
    30: env.VITE_AGS_MATCH_POOL_30 || 'paws-panic-30s',
    60: env.VITE_AGS_MATCH_POOL_60 || 'paws-panic-60s',
  },

  stats: {
    longestMeters:  env.VITE_AGS_STAT_LONGEST_METERS   || 'longest-run-meters',
    longestSeconds: env.VITE_AGS_STAT_LONGEST_SECONDS  || 'longest-run-seconds',
    totalWins:      env.VITE_AGS_STAT_TOTAL_WINS       || 'total-wins',
    totalLosses:    env.VITE_AGS_STAT_TOTAL_LOSSES     || 'total-losses',
  },

  leaderboards: {
    meters:  env.VITE_AGS_LEADERBOARD_METERS  || 'longest-run-meters',
    seconds: env.VITE_AGS_LEADERBOARD_SECONDS || 'longest-run-seconds',
  },
});

/**
 * True only when the minimum values needed to talk to AGS are present.
 * ags.js uses this to decide between real SDK wiring and placeholders.
 */
export function isAgsConfigured() {
  return Boolean(
    AGS_CONFIG.baseURL &&
    AGS_CONFIG.namespace &&
    AGS_CONFIG.clientId
  );
}
