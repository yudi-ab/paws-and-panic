// ════════════════════════════════════════════════════════════════════════
// PAWS & PANIC — AUTH MODULE
// ────────────────────────────────────────────────────────────────────────
// Ported from the chess project's src/auth.js + src/ags-client.js.
// Provides multiple login methods against AccelByte Gaming Services:
//
//   loginWithOAuthRedirect()      — redirect to AGS hosted login page
//   handleCallback()              — exchange the OAuth code on return
//   loginWithPassword(email, pw)  — direct email+password grant
//   loginWithDeviceId()           — guest/headless account via device ID
//   refreshSession()              — refresh_token grant
//   logout()                      — revoke + clear state
//   getProfile()                  — fetch the logged-in user's profile
//
// Session tokens are stored in sessionStorage so they survive in-tab
// navigation but not a full browser restart (security-hardened pattern).
// ════════════════════════════════════════════════════════════════════════

import { AGS_CONFIG } from './ags-config.js';

import { AccelByte }                                                         from '@accelbyte/sdk';
import { IamUserAuthorizationClient, OAuth20ExtensionApi, OAuth20V4Api, UsersApi } from '@accelbyte/sdk-iam';

// ════════════════════════════════════════════════════════════════════════
// SDK SINGLETON
// ════════════════════════════════════════════════════════════════════════

export const sdk = AccelByte.SDK({
  coreConfig: {
    baseURL:     AGS_CONFIG.baseURL,
    clientId:    AGS_CONFIG.clientId,
    namespace:   AGS_CONFIG.namespace,
    redirectURI: AGS_CONFIG.redirectURI,
  },
});

// ════════════════════════════════════════════════════════════════════════
// STORAGE KEYS
// ════════════════════════════════════════════════════════════════════════

const SESSION_FLAG      = 'ags_session';
const REFRESH_TOKEN_KEY = 'ags_refresh_token';
const AUTH_MODE_KEY     = 'ags_auth_mode';
const DEVICE_ID_KEY     = 'ags_device_id';

// ════════════════════════════════════════════════════════════════════════
// DEVICE ID — stable anonymous fingerprint persisted in localStorage
// ════════════════════════════════════════════════════════════════════════

function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    b => b.toString(16).padStart(2, '0'),
  ).join('');
}

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `paws-${randomId()}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ════════════════════════════════════════════════════════════════════════
// SESSION HELPERS
// ════════════════════════════════════════════════════════════════════════

function setSession(tokenData, authMode = 'registered') {
  sdk.setToken({
    accessToken:  tokenData.access_token  || '',
    refreshToken: tokenData.refresh_token || '',
  });
  if (tokenData.access_token) {
    sessionStorage.setItem(SESSION_FLAG, '1');
    sessionStorage.setItem(AUTH_MODE_KEY, authMode === 'guest' ? 'guest' : 'registered');
    if (tokenData.refresh_token) {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, tokenData.refresh_token);
    }
  }
}

export function hasStoredSession() {
  return !!sessionStorage.getItem(SESSION_FLAG);
}

export function getStoredAuthMode() {
  return sessionStorage.getItem(AUTH_MODE_KEY) === 'guest' ? 'guest' : 'registered';
}

function getRefreshToken() {
  return sdk.getToken()?.refreshToken || sessionStorage.getItem(REFRESH_TOKEN_KEY) || '';
}

function clearTransientSessionState() {
  sessionStorage.removeItem(SESSION_FLAG);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_MODE_KEY);
  sdk.setToken({ accessToken: '', refreshToken: '' });
}

function clearAuthCallbackUrl() {
  window.history.replaceState({}, '', window.location.pathname);
}

function extractErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  return payload.errorMessage || payload.error_description || payload.message || payload.error || fallback;
}

// ════════════════════════════════════════════════════════════════════════
// 1. OAUTH REDIRECT LOGIN
// ════════════════════════════════════════════════════════════════════════

export function loginWithOAuthRedirect() {
  console.log('[AGS Auth] loginWithOAuthRedirect()');
  const authClient = new IamUserAuthorizationClient(sdk);
  const loginURL   = authClient.createLoginURL();
  window.location.href = loginURL;
}

// ════════════════════════════════════════════════════════════════════════
// 2. OAUTH CALLBACK — exchange code for token
// ════════════════════════════════════════════════════════════════════════

export async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  const error  = params.get('error');
  const state  = params.get('state');

  if (!code && !error) return null;   // normal (non-callback) page load

  // Strip the OAuth params from the URL
  clearAuthCallbackUrl();

  try {
    const auth   = new IamUserAuthorizationClient(sdk);
    const result = await auth.exchangeAuthorizationCode({ code, error, state });
    const tokenData = result?.response?.data;

    if (!tokenData?.access_token) {
      throw new Error('Authorization code exchange returned no access token.');
    }

    setSession(tokenData);
    return { ok: true, data: tokenData };
  } catch (e) {
    console.error('[AGS Auth] authorization code exchange failed:', e?.message || e);
    clearTransientSessionState();
    return { ok: false, error: e?.message || 'OAuth login failed.' };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 3. EMAIL + PASSWORD LOGIN
// ════════════════════════════════════════════════════════════════════════

export async function loginWithPassword(identifier, password) {
  const { baseURL, clientId } = AGS_CONFIG;
  try {
    const resp = await fetch(`${baseURL}/iam/v3/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:  `Basic ${btoa(clientId + ':')}`,
        'Device-Id':    getDeviceId(),
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username:   identifier,
        password,
      }).toString(),
      credentials: 'include',
    });

    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: extractErrorMessage(payload, 'Could not sign in with email and password.') };
    }

    setSession(payload);
    return { ok: true, data: payload };
  } catch (e) {
    return { ok: false, error: e?.message || 'Could not sign in with email and password.' };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 4. GUEST / DEVICE-ID LOGIN
// ════════════════════════════════════════════════════════════════════════

function createDeviceLoginSdk(deviceId) {
  return AccelByte.SDK({
    coreConfig: {
      baseURL:     AGS_CONFIG.baseURL,
      clientId:    AGS_CONFIG.clientId,
      namespace:   AGS_CONFIG.namespace,
      redirectURI: AGS_CONFIG.redirectURI,
    },
    axiosConfig: {
      request: {
        headers: {
          Authorization: `Basic ${btoa(AGS_CONFIG.clientId + ':')}`,
          'Device-Id':   deviceId,
        },
        timeout: 15_000,
        withCredentials: false,
      },
    },
  });
}

export async function loginWithDeviceId() {
  const deviceId = getDeviceId();
  const loginSdk = createDeviceLoginSdk(deviceId);
  let tokenData = null;

  try {
    const response = await OAuth20V4Api(loginSdk).postTokenOauth_ByPlatformId_v4('device', {
      client_id:       AGS_CONFIG.clientId,
      createHeadless:  true,
      device_id:       deviceId,
      skipSetCookie:   true,
    });
    tokenData = response?.data || null;
  } catch (error) {
    clearTransientSessionState();
    const status  = Number(error?.response?.status || 0);
    const payload = error?.response?.data || {};
    const detail  = String(
      payload.error_description || payload.errorMessage || payload.message || payload.error || '',
    ).toLowerCase();

    if (detail.includes('platform client not found') || detail.includes('platform config')) {
      return { ok: false, error: 'Guest login is not available right now. Please try again later.' };
    }
    if (status === 401 || status === 403) {
      return { ok: false, error: 'Guest login could not be authorized. Please try again later.' };
    }
    if (status === 429) {
      return { ok: false, error: 'Too many guest login attempts. Wait a moment and try again.' };
    }
    return { ok: false, error: 'Could not sign in as guest. Please try again.' };
  }

  if (!tokenData?.access_token) {
    clearTransientSessionState();
    return { ok: false, error: 'Guest login returned no session. Please try again.' };
  }

  setSession(tokenData, 'guest');
  return { ok: true, data: tokenData };
}

// ════════════════════════════════════════════════════════════════════════
// 5. REFRESH SESSION
// ════════════════════════════════════════════════════════════════════════

export async function refreshSession() {
  const { baseURL, clientId } = AGS_CONFIG;
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return { ok: false, error: 'No refresh token available.' };
  }

  try {
    const resp = await fetch(`${baseURL}/iam/v3/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:  `Basic ${btoa(clientId + ':')}`,
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
      credentials: 'include',
    });

    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: extractErrorMessage(payload, 'Could not refresh your session.') };
    }

    setSession(payload, getStoredAuthMode());
    return { ok: true, data: payload };
  } catch (e) {
    return { ok: false, error: e?.message || 'Could not refresh your session.' };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 8. GOOGLE LOGIN (Implicit + Exchange)
// ════════════════════════════════════════════════════════════════════════

export function loginWithGoogle() {
  const nonce = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36);
  sessionStorage.setItem('ags_google_nonce', nonce);
  const params = new URLSearchParams({
    client_id: '343511838560-a4i1po9t8neg2gqhboae0i7vllmu5eof.apps.googleusercontent.com',
    redirect_uri: 'http://localhost:5173',
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    state: 'paws_panic_web_google'
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function exchangeGoogleIdToken(idToken) {
  const { baseURL, clientId } = AGS_CONFIG;
  try {
    const resp = await fetch(`${baseURL}/iam/v3/oauth/platforms/google/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(clientId + ':')}`,
      },
      body: new URLSearchParams({ platform_token: idToken }).toString(),
    });
    const tokenData = await resp.json();
    if (!resp.ok) throw new Error(tokenData.errorMessage || 'Exchange failed');
    setSession(tokenData);
    return { ok: true, data: tokenData };
  } catch (e) {
    console.error('Google exchange failed:', e);
    return { ok: false, error: e.message };
  }
}

// ════════════════════════════════════════════════════════════════════════
// 6. GET PROFILE
// ════════════════════════════════════════════════════════════════════════

export async function getProfile() {
  try {
    const res = await UsersApi(sdk).getUsersMe_v3();
    console.log('[DEBUG] Raw Profile Response:', res);
    return res.response?.data || res.data || null;
  } catch (e) {
    console.error('[DEBUG] Get Profile Error:', e);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════
// 7. LOGOUT
// ════════════════════════════════════════════════════════════════════════

export async function logout() {
  try {
    await OAuth20ExtensionApi(sdk).createLogout_v3();
  } catch (e) {
    console.warn('[AGS Auth] logout:', e?.response?.data || e?.message);
  } finally {
    clearTransientSessionState();
    sessionStorage.removeItem(SESSION_FLAG);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_MODE_KEY);
  }
}
