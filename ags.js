// ═══════════════════════════════════════════════════════════════════════
// PAWS & PANIC — AGS INTEGRATION
// ───────────────────────────────────────────────────────────────────────
// This file overrides the four window.ags* placeholder functions that
// app.js defines, replacing the simulated behavior with real AGS Web SDK
// calls.
//
//   window.agsLogin()                          — OAuth login
//   window.agsFindMatch(duration)              — matchmaking v2
//   window.agsSendPosition(distance)           — real-time position send
//   window.agsOnReceiveOpponentPosition(dist)  — real-time position recv
//
// Load order (index.html):
//   <script type="module" src="/app.js"></script>   ← defines placeholders
//   <script type="module" src="/ags.js"></script>   ← overrides them
//
// IMPORTANT: The exact AGS SDK import paths and method names below are
// documented as TODOs. Check your AGS Web SDK version's docs and adjust —
// the AccelByte SDK has evolved (v20 → v28+) and package names differ.
// ═══════════════════════════════════════════════════════════════════════

import { AGS_CONFIG, isAgsConfigured } from './ags-config.js';

// ── TODO: import the SDK pieces you need ─────────────────────────────
// The imports below are the *typical* shape as of AGS Web SDK v28.
// If your version differs, adjust package names and named exports.
//
// import { AccelByteSDK } from '@accelbyte/sdk';
// import { IAM }          from '@accelbyte/sdk-iam';
// import { Matchmaking }  from '@accelbyte/sdk-matchmaking';
// import { Session }      from '@accelbyte/sdk-session';
// import { Lobby }        from '@accelbyte/sdk-lobby';

// ═══════════════════════════════════════════════════════════════════════
// GUARD — skip real wiring if credentials are not configured
// ═══════════════════════════════════════════════════════════════════════

if (!isAgsConfigured()) {
  console.warn(
    '[AGS] No credentials configured. Using placeholder simulation.\n' +
    '      Copy .env.example → .env and fill in VITE_AGS_* values, then reload.'
  );
} else {
  console.log('[AGS] Configured for', AGS_CONFIG.baseURL, '/', AGS_CONFIG.namespace);
  wireUpAgs();
}

// ═══════════════════════════════════════════════════════════════════════
// MODULE STATE — kept alive across window.ags* calls
// ═══════════════════════════════════════════════════════════════════════

const ags = {
  sdk:            null,   // AccelByteSDK instance
  lobbyWs:        null,   // WebSocket connection to lobby / session
  currentSession: null,   // active game session object
  userInfo:       null,   // { userId, displayName, ... }
};

// ═══════════════════════════════════════════════════════════════════════
// MAIN WIRING
// ═══════════════════════════════════════════════════════════════════════

function wireUpAgs() {
  // ── Initialize the SDK once, then override each window.ags* function ──
  // TODO: adjust to your SDK version's constructor signature.
  //
  // ags.sdk = new AccelByteSDK({
  //   baseURL:   AGS_CONFIG.baseURL,
  //   clientId:  AGS_CONFIG.clientId,
  //   namespace: AGS_CONFIG.namespace,
  //   redirectURI: AGS_CONFIG.redirectURI,
  // });

  window.agsLogin                     = agsLogin;
  window.agsFindMatch                 = agsFindMatch;
  window.agsSendPosition              = agsSendPosition;
  // NOTE: agsOnReceiveOpponentPosition is the *inbound* callback that
  //       app.js already defines. We DO NOT override it — instead we
  //       call it from our lobby-message handler below.
}

// ═══════════════════════════════════════════════════════════════════════
// 1. LOGIN — OAuth authorization-code flow
// ═══════════════════════════════════════════════════════════════════════

async function agsLogin() {
  console.log('[AGS] agsLogin()');

  // Reach into app.js's UI helpers via the exposed debug hook.
  const state = window._pp;
  const setStatus = (msg) => {
    const el = document.getElementById('menu-login-status');
    if (el) el.textContent = msg || '';
  };

  try {
    setStatus('Redirecting to AGS login…');

    // ── TODO: swap for your SDK's login call ─────────────────────────
    // For a browser SPA, the auth-code + PKCE flow is standard:
    //
    // await ags.sdk.IAM.UserAuthorization.loginWithAuthorizationCode({
    //   scope: 'commerce account social publishing analytics',
    // });
    //
    // The SDK will redirect to the AGS login page and return here with
    // a code in the URL, which the SDK exchanges for tokens.

    // After the redirect returns, fetch the user profile:
    // const me = await ags.sdk.IAM.UserProfile.getMyProfileInfo();
    // ags.userInfo = { userId: me.userId, displayName: me.displayName };

    // ── Wire up the game state that app.js reads ─────────────────────
    // state.loggedIn = true;
    // state.username = ags.userInfo.displayName || 'Runner';
    // document.getElementById('btn-login').textContent = '👤 ' + state.username;
    // document.getElementById('btn-login').disabled    = true;
    // setStatus('Signed in as ' + state.username + ' ✓');

    setStatus('⚠ TODO: implement real AGS login in ags.js');
    console.warn('[AGS] agsLogin() has TODOs — see ags.js');
  } catch (err) {
    console.error('[AGS] Login failed:', err);
    setStatus('Login failed — check console');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 2. MATCHMAKING — Matchmaking v2
// ═══════════════════════════════════════════════════════════════════════

async function agsFindMatch(duration) {
  console.log('[AGS] agsFindMatch(%d)', duration);

  const pool = AGS_CONFIG.matchPools[duration];
  if (!pool) {
    console.error('[AGS] No match pool configured for duration', duration);
    return null;
  }

  try {
    // ── TODO: create a matchmaking ticket ────────────────────────────
    // const ticket = await ags.sdk.Matchmaking.MatchTickets.createMatchTicket({
    //   matchPool: pool,
    //   attributes: { /* skill, region, party, etc. */ },
    // });
    //
    // ── TODO: subscribe to lobby / notifications for match result ────
    // The AGS Lobby WebSocket pushes an OnMatchFound event when a
    // session is created. Open the socket if you haven't already:
    //
    // await openLobbySocket();
    //
    // ags.lobbyWs.onMatchFound = (event) => {
    //   ags.currentSession = event.sessionId;
    //   joinGameSession(event.sessionId);
    // };

    console.warn('[AGS] agsFindMatch() has TODOs — see ags.js. Pool:', pool);
    return null;
  } catch (err) {
    console.error('[AGS] Matchmaking failed:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. REAL-TIME SEND — push our distance to the opponent
// ═══════════════════════════════════════════════════════════════════════

function agsSendPosition(distance) {
  if (!ags.lobbyWs || ags.lobbyWs.readyState !== WebSocket.OPEN) {
    // Silently skip if socket isn't open yet — the game keeps running.
    return;
  }

  // ── TODO: adjust envelope shape to your session / lobby protocol ───
  // Two common approaches:
  //
  // A. Send via the AGS Lobby "send message" API:
  //    ags.sdk.Lobby.sendMessage({
  //      type:      'position_update',
  //      sessionId: ags.currentSession,
  //      payload:   { distance },
  //    });
  //
  // B. Send raw over the WebSocket directly:
  const msg = JSON.stringify({
    type:      'position_update',
    sessionId: ags.currentSession,
    distance,
  });
  ags.lobbyWs.send(msg);
}

// ═══════════════════════════════════════════════════════════════════════
// 4. REAL-TIME RECEIVE — bounces incoming messages to app.js
// ═══════════════════════════════════════════════════════════════════════

/**
 * Wire this to your lobby socket's message handler. When a peer's
 * position_update lands, forward the distance to app.js which already
 * knows how to render it via window.agsOnReceiveOpponentPosition.
 */
function handleLobbyMessage(rawMessage) {
  let msg;
  try {
    msg = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;
  } catch {
    console.warn('[AGS] Malformed lobby message:', rawMessage);
    return;
  }

  switch (msg.type) {
    case 'position_update':
      if (typeof msg.distance === 'number') {
        window.agsOnReceiveOpponentPosition(msg.distance);
      }
      break;

    // ── TODO: handle other event types your session emits ─────────────
    // case 'match_found': ...
    // case 'session_ended': ...
    // case 'player_left': ...

    default:
      console.log('[AGS] Unhandled lobby message:', msg);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LOBBY SOCKET — open once, reuse across matches
// ═══════════════════════════════════════════════════════════════════════

async function openLobbySocket() {
  if (ags.lobbyWs) return ags.lobbyWs;

  // ── TODO: prefer the SDK's Lobby client if your version provides one ─
  // const lobby = ags.sdk.Lobby.WebSocketClient();
  // await lobby.connect();
  // lobby.on('message', handleLobbyMessage);
  // ags.lobbyWs = lobby;

  // Fallback: open a raw WebSocket. You'll need the AGS-issued access
  // token and the correct wss:// endpoint for your environment.
  //
  // const token = ags.sdk.getAccessToken?.() || '';
  // const wsURL = AGS_CONFIG.baseURL.replace(/^http/, 'ws') +
  //               '/lobby/?token=' + encodeURIComponent(token);
  //
  // const ws = new WebSocket(wsURL);
  // ws.onopen    = () => console.log('[AGS] Lobby socket open');
  // ws.onmessage = (ev) => handleLobbyMessage(ev.data);
  // ws.onerror   = (err) => console.error('[AGS] Lobby socket error:', err);
  // ws.onclose   = () => { ags.lobbyWs = null; };
  // ags.lobbyWs = ws;

  return ags.lobbyWs;
}

// ═══════════════════════════════════════════════════════════════════════
// EXPOSED FOR DEBUGGING
// ═══════════════════════════════════════════════════════════════════════

window._ags = ags;
