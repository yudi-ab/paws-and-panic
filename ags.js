// ════════════════════════════════════════════════════════════════════════
// PAWS & PANIC — AGS INTEGRATION
// ────────────────────────────────────────────────────────────────────────
// Handles matchmaking + lobby + real-time position sync.
// Auth is now handled by auth.js — this module consumes the SDK instance
// and user info after login succeeds.
//
// Load order (index.html):
//   <script type="module" src="/app.js"></script>   ← game engine + login UI
//   <script type="module" src="/ags.js"></script>   ← this file (matchmaking/lobby)
//
// SDK versions (pinned at integration time):
//   @accelbyte/sdk@4.3.3
//   @accelbyte/sdk-iam@6.3.6
//   @accelbyte/sdk-lobby@5.2.8
//   @accelbyte/sdk-matchmaking@5.3.6
// ════════════════════════════════════════════════════════════════════════

import { AGS_CONFIG, isAgsConfigured } from './ags-config.js';
import { sdk }                          from './auth.js';

import { Lobby }           from '@accelbyte/sdk-lobby';
import { MatchTicketsApi } from '@accelbyte/sdk-matchmaking';
import { UserStatisticApi } from '@accelbyte/sdk-social';
import { LeaderboardDataV3Api } from '@accelbyte/sdk-leaderboard';
import { UsersApi } from '@accelbyte/sdk-iam';

// ════════════════════════════════════════════════════════════════════════
// MODULE STATE — kept alive across window.ags* calls
// ════════════════════════════════════════════════════════════════════════

const ags = {
  lobbyWs:          null,   // Lobby.WebSocket client
  currentSession:   null,   // active matchId from matchmakingNotif
  opponentUserId:   null,   // opponent AGS userId (for personalChat relay)
  userInfo:         null,   // { userId, displayName }
  pendingDuration:  null,   // match duration stored before redirect
  pendingTicketId:  null,   // active matchmaking ticket ID (for cancellation)
};

// ── GUARD — skip real wiring if credentials are not configured ──────────
if (!isAgsConfigured()) {
  console.warn(
    '[AGS] No credentials configured. Using placeholder simulation.\n' +
    '      Copy .env.example → .env and fill in VITE_AGS_* values, then reload.'
  );
} else {
  console.log('[AGS] Configured for', AGS_CONFIG.baseURL, '/', AGS_CONFIG.namespace);
  wireUpAgs();
}

// ════════════════════════════════════════════════════════════════════════
// MAIN WIRING
// ════════════════════════════════════════════════════════════════════════

function wireUpAgs() {
  window.agsFindMatch    = agsFindMatch;
  window.agsCancelMatch  = agsCancelMatch;
  window.agsSendPosition = agsSendPosition;
  window.submitRunResult = submitRunResult;
  window.loadLeaderboard = loadLeaderboard;
}

// ════════════════════════════════════════════════════════════════════════
// POST-LOGIN HOOK — called by app.js after any login method succeeds
// ════════════════════════════════════════════════════════════════════════

export async function onLoginComplete(userInfo) {
  ags.userInfo = userInfo;
  console.log('[AGS] onLoginComplete:', userInfo?.displayName);

  if (isAgsConfigured()) {
    try {
      await openLobbySocket();
    } catch (err) {
      console.warn('[AGS] Could not open lobby socket:', err?.message || err);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
// POST-LOGOUT HOOK — called by app.js on logout
// ════════════════════════════════════════════════════════════════════════

export function onLogoutComplete() {
  if (ags.lobbyWs) {
    ags.lobbyWs.disconnect();
    ags.lobbyWs = null;
  }
  ags.userInfo        = null;
  ags.currentSession  = null;
  ags.opponentUserId  = null;
  console.log('[AGS] onLogoutComplete');
}

// ════════════════════════════════════════════════════════════════════════
// LOBBY SOCKET — open once; reused across matches
// ════════════════════════════════════════════════════════════════════════

async function openLobbySocket() {
  if (ags.lobbyWs) return ags.lobbyWs;

  console.log('[AGS] Opening Lobby WebSocket…');

  const ws = Lobby.WebSocket(sdk);
  ws.connect();

  ws.onOpen(() => {
    console.log('[AGS] Lobby WebSocket open');
  });

  ws.onClose(ev => {
    console.log('[AGS] Lobby WebSocket closed', ev.code, ev.reason);
    ags.lobbyWs = null;
  });

  ws.onError(err => {
    console.error('[AGS] Lobby WebSocket error:', err);
  });

  ws.onMessage(msg => {
    handleLobbyMessage(msg);
  });

  ags.lobbyWs = ws;
  return ws;
}

// ════════════════════════════════════════════════════════════════════════
// LOBBY MESSAGE HANDLER
// ════════════════════════════════════════════════════════════════════════

function handleLobbyMessage(msg) {
  if (!msg?.type) return;

  switch (msg.type) {

    // ── Matchmaking v2 match found ────────────────────────────────────
    case 'matchmakingNotif': {
      console.log('[AGS] matchmakingNotif status:', msg.status, 'matchId:', msg.matchId);

      if (msg.status === 'done') {
        if (ags.currentSession) break;   // already handled by OnMatchFound
        ags.currentSession = msg.matchId;

        if (Array.isArray(msg.counterPartyMember) && msg.counterPartyMember.length) {
          ags.opponentUserId = msg.counterPartyMember[0];
        }

        console.log('[AGS] Match found! sessionId:', ags.currentSession,
                    'opponent:', ags.opponentUserId);

        if (typeof window._ppStartGame === 'function') {
          window._ppStartGame('multi', ags.pendingDuration || 30);
        }

      } else if (msg.status === 'timeout') {
        console.warn('[AGS] Matchmaking timed out');
        if (window._pp?.screen === 'matchmaking') {
          if (typeof window.showScreen === 'function') window.showScreen('menu');
          const el = document.getElementById('menu-login-status');
          if (el) el.textContent = 'Matchmaking timed out — try again';
        }
      }
      break;
    }

    // ── Matchmaking v2: OnMatchFound (contains sessionId + teams) ────────
    case 'messageNotif': {
      if (msg.topic !== 'OnMatchFound') break;
      if (ags.currentSession) break;   // already handled by matchmakingNotif
      try {
        const data = JSON.parse(atob(msg.payload));
        const sessionId = data.ID;
        ags.currentSession = sessionId;
        ags.pendingTicketId = null;   // ticket consumed

        // Find opponent: the UserID that isn't ours
        const myId = ags.userInfo?.userId;
        const allUsers = (data.Teams || []).flatMap(t => t.UserIDs || []);
        ags.opponentUserId = allUsers.find(id => id !== myId) || null;

        console.log('[AGS] OnMatchFound — sessionId:', sessionId,
                    'opponent:', ags.opponentUserId, 'teams:', JSON.stringify(data.Teams));

        if (typeof window._ppStartGame === 'function') {
          window._ppStartGame('multi', ags.pendingDuration || 30);
        }
      } catch (e) {
        console.warn('[AGS] messageNotif (OnMatchFound) parse error:', e);
      }
      break;
    }

    // ── Matchmaking v2: OnSessionJoined (session members confirmed) ───────
    case 'messageSessionNotif': {
      if (msg.topic !== 'OnSessionJoined') break;
      try {
        const data = JSON.parse(atob(msg.payload));
        console.log('[AGS] OnSessionJoined — sessionId:', data.SessionID,
                    'members:', (data.Members || []).map(m => m.ID).join(', '));
        // sessionId already set from OnMatchFound; this is a confirmation
        if (!ags.currentSession) ags.currentSession = data.SessionID;

        // Fallback: if OnMatchFound wasn't received, extract opponent from Members here
        if (!ags.opponentUserId && data.Members) {
          const myId = ags.userInfo?.userId;
          ags.opponentUserId = data.Members.find(m => m.ID !== myId)?.ID || null;
        }

        // Start the game if not already started
        if (typeof window._ppStartGame === 'function') {
          window._ppStartGame('multi', ags.pendingDuration || 30);
        }
      } catch (e) {
        console.warn('[AGS] messageSessionNotif parse error:', e);
      }
      break;
    }

    // ── Position updates from opponent ────────────────────────────────
    case 'personalChatNotif': {
      if (msg.from !== ags.opponentUserId) break;
      try {
        const payload = JSON.parse(msg.payload);
        // Handle both old format (distance) and new format (x, y, panic, etc)
        if (typeof window.agsOnReceiveOpponentPosition === 'function') {
          window.agsOnReceiveOpponentPosition({
            ...payload,
            playerId: msg.from,
            timestamp: Date.now()
          });
        }
      } catch {
        // ignore malformed payloads
      }
      break;
    }

    // ── Error notifications (don't break game, just log) ─────────────
    case 'errorNotif': {
      console.warn('[AGS] Lobby error:', msg.message || msg);
      // Don't break the game flow on errors
      break;
    }

    // ── Personal chat response (position sync not using this API) ─────
    case 'personalChatResponse': {
      // Suppress - not using personalChat for position sync anymore
      break;
    }

    default:
      if (msg.type !== 'connectNotif') {
        console.log('[AGS] Unhandled lobby message:', msg.type, msg);
      }
  }
}

// ════════════════════════════════════════════════════════════════════════
// 2. MATCHMAKING — submit a Matchmaking v2 ticket
// ════════════════════════════════════════════════════════════════════════

async function agsFindMatch(duration) {
  console.log('[AGS] agsFindMatch(%d)', duration);

  const pool = AGS_CONFIG.matchPools[duration];
  if (!pool) {
    console.error('[AGS] No match pool configured for duration', duration);
    return null;
  }

  ags.pendingDuration = duration;

  try {
    await openLobbySocket();

    // SDK already throws on error; returns axios response directly.
    const ticketResult = await MatchTicketsApi(sdk).createMatchTicket({
      matchPool:  pool,
      attributes: {},
    });

    const ticketId = ticketResult.data?.matchTicketID;
    ags.pendingTicketId = ticketId;
    console.log('[AGS] Matchmaking ticket submitted — id:', ticketId, 'pool:', pool);
    return ticketId;

  } catch (err) {
    console.error('[AGS] agsFindMatch() failed:', err);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════
// 2b. CANCEL MATCHMAKING — delete the pending ticket from AGS
// ════════════════════════════════════════════════════════════════════════

async function agsCancelMatch() {
  const ticketId = ags.pendingTicketId;
  if (!ticketId) {
    console.warn('[AGS] agsCancelMatch() — no pending ticket to cancel');
    return;
  }

  try {
    await MatchTicketsApi(sdk).deleteMatchTicket_ByTicketid(ticketId);
    console.log('[AGS] Match ticket cancelled:', ticketId);
  } catch (err) {
    console.warn('[AGS] agsCancelMatch() failed (ticket may have already expired):', err?.message || err);
  } finally {
    ags.pendingTicketId = null;
  }
}

// ════════════════════════════════════════════════════════════════════════
// 3. REAL-TIME SEND — push position to opponent via personal chat
// ════════════════════════════════════════════════════════════════════════

function agsSendPosition(data) {
  // NOTE: Position sync via personalChat was rejected by AGS (Request rejected error)
  // Instead, we use demo opponent movement which works locally
  // For real multiplayer position sync, a dedicated API endpoint or session
  // attributes should be used instead of personalChat
  //
  // This function is kept for API compatibility but doesn't send anything
  return;
}

// ════════════════════════════════════════════════════════════════════════
// 4. SUBMIT RUN RESULT — update stats (MAX strategy) after each game
// ════════════════════════════════════════════════════════════════════════

async function submitRunResult({ meters, seconds, maxPanic, won, mode }) {
  let userId = ags.userInfo?.userId;

  // Fallback: extract userId from SDK token if not directly set
  if (!userId) {
    const token = sdk.getToken();
    if (token?.accessToken) {
      try {
        const payloadBase64 = token.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(payloadBase64));
        userId = payload?.sub || payload?.user_id || payload?.userId;
        if (userId) {
          if (!ags.userInfo) ags.userInfo = {};
          ags.userInfo.userId = userId;
          if (!ags.userInfo.displayName) {
            ags.userInfo.displayName = payload?.display_name || payload?.displayName || 'Player';
          }
        }
      } catch (e) {
        console.warn('[AGS] Could not extract userId from JWT:', e);
      }
    }
  }

  if (!userId) {
    console.warn('[AGS] submitRunResult: no user logged in — skipping');
    return;
  }

  console.log('[AGS] submitRunResult — user:', userId, 'meters:', meters, 'seconds:', seconds, 'maxPanic:', maxPanic, 'won:', won, 'mode:', mode);

  const displayName = ags.userInfo?.displayName || ags.userInfo?.username || 'Player';
  const additionalData = { displayName };

  const updates = [];

  // 1. Distance in meters (MAX strategy — personal best)
  if (typeof meters === 'number' && meters > 0) {
    updates.push({
      statCode:       AGS_CONFIG.stats.longestMeters,
      updateStrategy: 'MAX',
      value:          meters,
      additionalData,
    });
  }

  // 2. Survival time in seconds (MAX strategy — personal best)
  if (typeof seconds === 'number' && seconds > 0) {
    updates.push({
      statCode:       AGS_CONFIG.stats.longestSeconds,
      updateStrategy: 'MAX',
      value:          seconds,
      additionalData,
    });
  }

  // 3. Lowest Panic reached (MIN strategy — lower peak panic is better)
  if (typeof maxPanic === 'number' && !isNaN(maxPanic)) {
    updates.push({
      statCode:       AGS_CONFIG.stats.lowestPanic,
      updateStrategy: 'MIN',
      value:          Math.max(0, Math.min(100, Math.round(maxPanic))),
      additionalData,
    });
  }

  // 4. Win/loss counters (INCREMENT)
  if (won) {
    updates.push({ statCode: AGS_CONFIG.stats.totalWins,   updateStrategy: 'INCREMENT', value: 1 });
  } else {
    updates.push({ statCode: AGS_CONFIG.stats.totalLosses, updateStrategy: 'INCREMENT', value: 1 });
  }

  try {
    await UserStatisticApi(sdk).updateStatitemValueBulk_ByUserId_v2(userId, updates);
    console.log('[AGS] Stats submitted OK');
  } catch (err) {
    // 404 means stat item doesn't exist yet — create it first, then retry
    if (err?.response?.status === 404 || err?.status === 404) {
      console.log('[AGS] Stat item not found — creating first…');
      try {
        const creates = updates.map(u => ({ statCode: u.statCode }));
        await UserStatisticApi(sdk).createStatitemBulk_ByUserId(userId, creates);
        await UserStatisticApi(sdk).updateStatitemValueBulk_ByUserId_v2(userId, updates);
        console.log('[AGS] Stats created + submitted OK');
      } catch (e2) {
        console.warn('[AGS] submitRunResult retry failed:', e2?.message || e2);
      }
    } else {
      console.warn('[AGS] submitRunResult failed:', err?.message || err);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
// 5. LOAD LEADERBOARD — fetch real rankings from AGS
//    Returns { meters, seconds, panic } each as [{ name, score, userId }]
// ════════════════════════════════════════════════════════════════════════

async function loadLeaderboard() {
  const lbApi = LeaderboardDataV3Api(sdk);

  const fetchTab = async (leaderboardCode, limit = 10) => {
    try {
      const res = await lbApi.getAlltime_ByLeaderboardCode_v3(leaderboardCode, { limit });
      const rawEntries = res?.data?.data || [];
      if (!rawEntries.length) return [];

      return rawEntries.map(entry => {
        // Read displayName stored in additionalData on stat submission
        let name = entry.additionalData?.displayName;
        if (!name) {
          // If current logged-in user, use active displayName
          if (entry.userId === ags.userInfo?.userId) {
            name = ags.userInfo?.displayName || 'You';
          } else {
            name = `Runner-${entry.userId?.slice(0, 6) || 'Guest'}`;
          }
        }
        return {
          userId: entry.userId,
          score:  entry.point,
          name:   name,
        };
      });
    } catch (err) {
      console.warn('[AGS] loadLeaderboard failed for', leaderboardCode, ':', err?.message || err);
      return null; // null = use fallback dummy data
    }
  };

  const [metersData, secondsData, panicData] = await Promise.all([
    fetchTab(AGS_CONFIG.leaderboards.meters),
    fetchTab(AGS_CONFIG.leaderboards.seconds),
    fetchTab(AGS_CONFIG.leaderboards.panic),
  ]);

  return { meters: metersData, seconds: secondsData, panic: panicData };
}

// ════════════════════════════════════════════════════════════════════════
// EXPOSED FOR DEBUGGING
// ════════════════════════════════════════════════════════════════════════

window._ags = ags;
