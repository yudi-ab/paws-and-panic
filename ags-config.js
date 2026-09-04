// ═══════════════════════════════════════════════════════════════════════
// AGS CONFIG
// ───────────────────────────────────────────────────────────────────────
// Centralizes all AGS environment values. Reads from Vite's import.meta.env
// (populated from your .env file). Everything is optional — if credentials
// are missing, ags.js will detect it and keep the simulated placeholders.
// ═══════════════════════════════════════════════════════════════════════

const env = import.meta.env ?? {};

export const AGS_CONFIG = Object.freeze({
  baseURL:     env.VITE_AGS_BASE_URL     || '',
  namespace:   env.VITE_AGS_NAMESPACE    || '',
  clientId:    env.VITE_AGS_CLIENT_ID    || '',
  redirectURI: env.VITE_AGS_REDIRECT_URI || window.location.origin,

  matchPools: {
    30: env.VITE_AGS_MATCH_POOL_30 || 'paws-panic-30s',
    60: env.VITE_AGS_MATCH_POOL_60 || 'paws-panic-60s',
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
