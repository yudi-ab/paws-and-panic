/**
 * ═══════════════════════════════════════════════════════════════════════
 * Paws & Panic – AGS Infrastructure Test Game
 * ═══════════════════════════════════════════════════════════════════════
 *
 * AGS AUTH MODULE (auth.js) provides multiple login methods:
 *   loginWithOAuthRedirect()    – redirect to AGS hosted login
 *   loginWithPassword(e, p)     – email + password grant
 *   loginWithDeviceId()         – guest/headless account
 *   handleCallback()            – complete OAuth redirect on return
 *   refreshSession()            – restore a stored session
 *
 * AGS INTEGRATION (ags.js) handles:
 *   agsFindMatch(duration)      – start matchmaking
 *   agsSendPosition(distance)   – send player distance to opponent
 *   agsOnReceiveOpponentPosition(distance) – callback (below)
 */

'use strict';

import {
  handleCallback,
  hasStoredSession,
  refreshSession,
  loginWithOAuthRedirect,
  loginWithPassword,
  loginWithDeviceId,
  getProfile,
  logout as authLogout,
  loginWithGoogle,
  exchangeGoogleIdToken,
  sdk,
} from './auth.js';
import { IamUserAuthorizationClient, UsersApi } from '@accelbyte/sdk-iam';
import { AGS_CONFIG } from './ags-config.js';


import { onLoginComplete, onLogoutComplete } from './ags.js';

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

const CONFIG = Object.freeze({
  catSpeedPerSec:    40,   // distance units the cat gains every second
  clickPower:        8,    // distance units the player gains per click
  trackPadding:      60,   // px reserved at each end of the track
  tickInterval:      100,  // ms between physics ticks
  minClickGap:       30,   // ms cooldown between registered clicks
});

// ═══════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════

const state = {
  screen:       'menu',   // menu | matchmaking | game | result
  mode:         null,     // 'single' | 'multi'
  duration:     0,        // total seconds
  timeLeft:     0,        // seconds remaining
  running:      false,
  paused:       false,

  playerDist:   0,
  catDist:      0,
  opponentDist: 0,

  tickTimer:    null,     // setInterval id for physics
  countdownId:     null,     // setInterval id for 1-second countdown
  preCountdownId:  null,     // setTimeout chain id for 3-2-1 pre-game
  finishLine:      1,        // fixed distance scale for track rendering
  lastClick:    0,        // Date.now() of last registered click

  // AGS auth
  loggedIn:     false,
  username:     null,
  playerCaught: false,
};

// ═══════════════════════════════════════════════════════════════════════
// AGS PLACEHOLDER (only for fallback when ags.js guard is inactive)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find-match placeholder – simulates finding an opponent.
 * Overridden by ags.js when configured.
 */
window.agsFindMatch = window.agsFindMatch || function agsFindMatch(duration) {
  const matchId = 'match_' + Math.random().toString(36).slice(2, 11);
  console.log('[AGS Placeholder] agsFindMatch(%d) → %s', duration, matchId);
  return matchId;
};

/**
 * Send position placeholder. Overridden by ags.js when configured.
 */
window.agsSendPosition = window.agsSendPosition || function agsSendPosition(distance) {
  console.log('[AGS Placeholder] agsSendPosition(%d)', distance);
};

/**
 * Called when the AGS SDK delivers an opponent position update.
 */
window.agsOnReceiveOpponentPosition = function agsOnReceiveOpponentPosition(distance) {
  state.opponentDist = distance;
  renderPositions();
};

// ═══════════════════════════════════════════════════════════════════════
// DOM CACHE
// ═══════════════════════════════════════════════════════════════════════

const dom = {};

function cacheDom() {
  dom.screens = {
    menu:        document.getElementById('screen-menu'),
    matchmaking: document.getElementById('screen-matchmaking'),
    game:        document.getElementById('screen-game'),
    result:      document.getElementById('screen-result'),
  };

  // Menu — login tabs
  dom.loginSection     = document.getElementById('login-section');
  dom.loggedInBadge    = document.getElementById('logged-in-badge');
  dom.gameModesSection = document.getElementById('game-modes-section');
  dom.loggedInName     = document.getElementById('logged-in-name');
  dom.btnLogout        = document.getElementById('btn-logout');
  dom.statusMsg        = document.getElementById('menu-login-status');

  // Tab buttons
  dom.tabOAuth       = document.getElementById('tab-oauth');
  // dom.tabPassword removed per requirement
  dom.tabGuest       = document.getElementById('tab-guest');
  dom.panelOAuth     = document.getElementById('panel-oauth');
  // dom.panelPassword removed
  dom.panelGuest     = document.getElementById('panel-guest');

  // Login form elements
  dom.btnLoginOAuth  = document.getElementById('btn-login-oauth');
  dom.btnLoginGoogle = document.getElementById('btn-login-google');
  // Email/Password elements removed
  dom.btnLoginGuest  = document.getElementById('btn-login-guest');

  // Game HUD
  dom.hudMode       = document.getElementById('hud-mode');
  dom.hudTimer      = document.getElementById('hud-timer');
  dom.distPlayer    = document.getElementById('dist-player');
  dom.distCat       = document.getElementById('dist-cat');
  dom.distOpponent  = document.getElementById('dist-opponent');
  dom.distOppChip   = document.getElementById('dist-opponent-chip');

  // Track characters
  dom.track         = document.getElementById('track');
  dom.wrapCat       = document.getElementById('wrap-cat');
  dom.wrapPlayer    = document.getElementById('wrap-player');
  dom.wrapOpponent  = document.getElementById('wrap-opponent');
  dom.laneOpponent  = document.getElementById('lane-opponent');
  dom.charPlayer    = document.getElementById('char-player');

  // Buttons
  dom.btnRun        = document.getElementById('btn-run');
  dom.pauseOverlay  = document.getElementById('pause-overlay');
  dom.gameCountdown   = document.getElementById('game-countdown');
  dom.countdownNumber = document.getElementById('countdown-number');

  // Result
  dom.resultEmoji   = document.getElementById('result-emoji');
  dom.resultTitle   = document.getElementById('result-title');
  dom.resultBody    = document.getElementById('result-body');
}

// ═══════════════════════════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

function showScreen(name) {
  Object.values(dom.screens).forEach(s => s.classList.remove('active'));
  dom.screens[name].classList.add('active');
  state.screen = name;
}

function setStatus(msg) {
  dom.statusMsg.textContent = msg || '';
}

// ═══════════════════════════════════════════════════════════════════════
// LOGIN UI — tabs + post-login state
// ═══════════════════════════════════════════════════════════════════════

// Helper: Generate a fun, unique name and persist it
function getOrGenerateName(profile) {
  const rawName = profile?.displayName || profile?.userName;
  if (rawName && rawName.trim() !== '') return rawName;

  // Reuse already-generated name for this browser
  const stored = localStorage.getItem('paws_display_name');
  if (stored) return stored;

  const adjectives = ['Swift', 'Sneaky', 'Hungry', 'Fluffy', 'Zoomy', 'Quiet', 'Playful'];
  const nouns = ['Paws', 'Runner', 'Cat', 'Sprinter', 'Buddy', 'Whiskers', 'Meow'];
  const name = `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}${Math.floor(Math.random() * 999)}`;
  localStorage.setItem('paws_display_name', name);
  return name;
}

async function updateLoginUI() {
  if (state.loggedIn) {
    dom.loginSection.style.display     = 'none';
    dom.loggedInBadge.style.display    = 'flex';
    dom.gameModesSection.style.display = 'block';

    // Use cached profile set by completeLogin(); fall back to a fresh fetch
    const profile = state.profileCache || await getProfile();
    const displayName = getOrGenerateName(profile);

    dom.loggedInName.textContent = displayName;

    // Add "Edit" button once
    if (!document.getElementById('edit-name-btn')) {
      const editBtn = document.createElement('button');
      editBtn.id = 'edit-name-btn';
      editBtn.textContent = '✎ Edit Name';
      editBtn.style.marginLeft = '10px';
      editBtn.style.padding = '2px 8px';
      editBtn.style.fontSize = '12px';
      editBtn.style.cursor = 'pointer';
      editBtn.onclick = () => {
        const newName = prompt('Enter new display name:', displayName);
        if (newName && newName.trim() !== '') {
          updateDisplayName(newName);
        }
      };
      dom.loggedInBadge.appendChild(editBtn);
    }
  } else {
    dom.loginSection.style.display     = '';
    dom.loggedInBadge.style.display    = 'none';
    dom.gameModesSection.style.display = 'none';
  }
}

// Update display name on AGS and refresh local state
async function updateDisplayName(newName) {
  try {
    const { baseURL } = AGS_CONFIG;
    const resp = await fetch(`${baseURL}/iam/v3/public/namespaces/${AGS_CONFIG.namespace}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sdk.getToken().accessToken}`,
      },
      body: JSON.stringify({ displayName: newName }),
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.errorMessage || 'Failed to update name');
    }

    localStorage.setItem('paws_display_name', newName);
    dom.loggedInName.textContent = newName;
    const playerLabel = document.querySelector('.lane-player .char-label');
    if (playerLabel) playerLabel.textContent = `🏃 ${newName}`;
    console.log('[App] Display name updated to:', newName);
  } catch (e) {
    console.error('[App] Failed to update display name:', e);
    alert('Failed to update name: ' + (e.message || 'Unknown error'));
  }
}

function switchTab(tabButton) {
  // Deselect all tabs
  [dom.tabOAuth, dom.tabGuest].forEach(t => {
    t.setAttribute('aria-selected', 'false');
    t.classList.remove('active');
  });
  [dom.panelOAuth, dom.panelGuest].forEach(p => {
    p.classList.remove('active');
    p.hidden = true;
  });

  // Select the clicked tab
  tabButton.setAttribute('aria-selected', 'true');
  tabButton.classList.add('active');
  const panelId = tabButton.getAttribute('aria-controls');
  const panel   = document.getElementById(panelId);
  if (panel) {
    panel.classList.add('active');
    panel.hidden = false;
  }
}

/** After any successful login, fetch profile and update game state. */
async function completeLogin() {
  const profile = await getProfile();
  state.loggedIn     = true;
  state.profileCache = profile;
  state.username     = profile?.displayName || profile?.userName || 'Runner';
  setStatus('Signed in as ' + state.username + ' ✓');
  updateLoginUI();

  // Notify ags.js to open lobby socket
  await onLoginComplete({
    userId:      profile?.userId,
    displayName: state.username,
  });

  console.log('[App] Login complete:', state.username);
}

function setLoginLoading(button, loading) {
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = '⏳ Signing in…';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

// ── OAuth redirect ───────────────────────────────────────────────────

function handleOAuthLogin(platform = null) {
  setStatus('Redirecting...');
  const authClient = new IamUserAuthorizationClient(sdk);
  // Using both login_type and platform to ensure IAM triggers provider-specific flow
  const options = platform ? { platform, login_type: 'platform' } : {};
  window.location.href = authClient.createLoginURL(options);
}

// ── Email / password (REMOVED) ──────────────────────────────────────


// ── Guest / device-ID ────────────────────────────────────────────────

async function handleGuestLogin() {
  setLoginLoading(dom.btnLoginGuest, true);
  setStatus('Creating guest account…');

  const result = await loginWithDeviceId();

  if (!result.ok) {
    setLoginLoading(dom.btnLoginGuest, false);
    setStatus(result.error || 'Guest login failed.');
    return;
  }

  await completeLogin();
  setLoginLoading(dom.btnLoginGuest, false);
}

// ── Logout ───────────────────────────────────────────────────────────

async function handleLogout() {
  setStatus('Logging out…');
  await authLogout();
  onLogoutComplete();

  state.loggedIn = false;
  state.username = null;
  setStatus('Signed out ✓');
  updateLoginUI();
}

// ═══════════════════════════════════════════════════════════════════════
// GAME LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════

function startGame(mode, duration) {
  state.mode        = mode;
  state.duration    = duration;
  state.timeLeft    = duration;
  state.playerDist  = 0;
  state.catDist     = -50;  // Cat starts 50 units behind, giving player time to react
  state.opponentDist = 0;
  state.playerCaught = false; // Reset caught status
  state.finishLine  = CONFIG.catSpeedPerSec * duration || 1;
  state.running     = true;
  state.paused      = false;

  // HUD
  dom.hudMode.textContent  = (mode === 'single' ? 'SP' : 'MP') + ' · ' + duration + 's';
  dom.hudTimer.textContent = fmtTime(duration);
  dom.hudTimer.classList.remove('danger');
  dom.distPlayer.textContent  = '0';
  dom.distCat.textContent     = '0';
  dom.distOpponent.textContent = '0';

  // Opponent lane visibility
  const showOpp = mode === 'multi';
  dom.laneOpponent.style.display = showOpp ? 'flex' : 'none';
  dom.distOppChip.style.display  = showOpp ? 'inline' : 'none';

  // Reset positions
  renderPositions();

  dom.pauseOverlay.style.display = 'none';
  showScreen('game');

  // Start ticking
  state.tickTimer = setInterval(physicsTick, CONFIG.tickInterval);
  state.countdownId = setInterval(countdownTick, 1000);
}

// ═══════════════════════════════════════════════════════════════════════
// PRE-GAME COUNTDOWN — 3 · 2 · 1 · GO! then hand off to startGame()
// ═══════════════════════════════════════════════════════════════════════

function startGameCountdown(mode, duration) {
  // Show game screen so the track is visible during countdown,
  // but leave state.running = false so clicks/physics are no-ops.
  state.mode        = mode;
  state.duration    = duration;
  state.timeLeft    = duration;
  state.playerDist  = 0;
  state.catDist     = -50;
  state.opponentDist = 0;
  state.finishLine  = CONFIG.catSpeedPerSec * duration || 1;

  // HUD
  dom.hudMode.textContent  = (mode === 'single' ? 'SP' : 'MP') + ' · ' + duration + 's';
  dom.hudTimer.textContent = fmtTime(duration);
  dom.hudTimer.classList.remove('danger');
  dom.distPlayer.textContent   = '0';
  dom.distCat.textContent      = '0';
  dom.distOpponent.textContent = '0';

  // Opponent lane visibility
  const showOpp = mode === 'multi';
  dom.laneOpponent.style.display = showOpp ? 'flex' : 'none';
  dom.distOppChip.style.display  = showOpp ? 'inline' : 'none';

  renderPositions();
  showScreen('game');

  // Show countdown overlay
  const steps = ['3', '2', '1', 'GO!'];
  let i = 0;

  dom.countdownNumber.textContent = steps[i];
  dom.countdownNumber.classList.remove('pop');
  void dom.countdownNumber.offsetWidth; // reflow to restart animation
  dom.countdownNumber.classList.add('pop');
  dom.gameCountdown.style.display = 'flex';

  function tick() {
    i++;
    if (i < steps.length) {
      dom.countdownNumber.classList.remove('pop');
      void dom.countdownNumber.offsetWidth;
      dom.countdownNumber.textContent = steps[i];
      dom.countdownNumber.classList.add('pop');
      state.preCountdownId = setTimeout(tick, i === steps.length - 1 ? 600 : 1000);
    } else {
      dom.gameCountdown.style.display = 'none';
      startGame(mode, duration);
    }
  }

  state.preCountdownId = setTimeout(tick, 1000);
}

function startMatchmaking(mode, duration) {
  if (!state.loggedIn) {
    setStatus('Please log in first!');
    return;
  }

  showScreen('matchmaking');
  window.agsFindMatch(duration);
  // Game starts when ags.js receives a matchmakingNotif (status=done) from AGS
  // and calls window._ppStartGame(mode, duration).
}

function cancelMatchmaking() {
  if (typeof window.agsCancelMatch === 'function') {
    window.agsCancelMatch();
  }
  showScreen('menu');
  setStatus('Matchmaking cancelled');
}

// ═══════════════════════════════════════════════════════════════════════
// GAME TICKS
// ═══════════════════════════════════════════════════════════════════════

/** Runs every CONFIG.tickInterval ms – moves the cat smoothly. */
function physicsTick() {
  if (!state.running || state.paused) return;

  // Cat moves continuously
  state.catDist += CONFIG.catSpeedPerSec * (CONFIG.tickInterval / 1000);
  renderPositions();

  // Cat catches player if it reaches them
  if (state.catDist >= state.playerDist && !state.playerCaught) {
    state.playerCaught = true;
    endGame();
  }
}

/** Runs every 1 second – counts down the timer. */
function countdownTick() {
  if (!state.running || state.paused) return;

  state.timeLeft--;
  dom.hudTimer.textContent = fmtTime(state.timeLeft);

  if (state.timeLeft <= 5) {
    dom.hudTimer.classList.add('danger');
  }

  if (state.timeLeft <= 0) {
    endGame();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PLAYER INPUT
// ═══════════════════════════════════════════════════════════════════════

function onRunClick() {
  if (!state.running || state.paused) return;

  const now = Date.now();
  if (now - state.lastClick < CONFIG.minClickGap) return;
  state.lastClick = now;

  state.playerDist += CONFIG.clickPower;
  renderPositions();

  // Visual bounce
  dom.charPlayer.classList.remove('bouncing');
  void dom.charPlayer.offsetWidth; // reflow to restart animation
  dom.charPlayer.classList.add('bouncing');

  // Multiplayer sync
  if (state.mode === 'multi') {
    window.agsSendPosition(state.playerDist);
  }
}

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  dom.pauseOverlay.style.display = state.paused ? 'flex' : 'none';
}

function quitToMenu() {
  stopTimers();
  state.running = false;
  state.paused = false;
  dom.pauseOverlay.style.display  = 'none';
  dom.gameCountdown.style.display = 'none';
  showScreen('menu');
}

// ═══════════════════════════════════════════════════════════════════════
// END GAME
// ═══════════════════════════════════════════════════════════════════════

function endGame() {
  stopTimers();
  state.running = false;

  const pDist = Math.floor(state.playerDist);
  const cDist = Math.floor(state.catDist);
  const oDist = Math.floor(state.opponentDist);

  let emoji, title, verdict, verdictClass;

  // Cat catch is the primary outcome (applies to both single and multiplayer)
  const caughtByCat = pDist <= cDist;

  if (caughtByCat) {
    emoji        = '😿';
    title        = 'Caught by the Cat!';
    verdict      = 'The cat caught up… try clicking faster next time!';
    verdictClass = 'verdict-lose';
  } else if (state.mode === 'single') {
    // Survived: player outran the cat
    emoji        = '🎉';
    title        = 'You Survived!';
    verdict      = 'You outran the cat — nice reflexes!';
    verdictClass = 'verdict-win';
  } else {
    // Multiplayer: compare against opponent
    const won  = pDist > oDist;
    const tied = pDist === oDist;
    emoji        = won ? '🏆' : tied ? '🤝' : '😿';
    title        = won ? 'Victory!' : tied ? "It's a Tie!" : 'Defeat!';
    verdict      = won
      ? 'You ran farther than your opponent!'
      : tied
        ? 'Perfectly matched runners!'
        : 'Your opponent was faster this time.';
    verdictClass = won ? 'verdict-win' : tied ? 'verdict-tie' : 'verdict-lose';
  }

  dom.resultEmoji.textContent = emoji;
  dom.resultTitle.textContent = title;

  let statsHtml = `
    <div class="result-verdict ${verdictClass}">${verdict}</div>
    <div class="result-stats">
      <div class="result-stat">
        <span class="stat-label">🏃 You</span>
        <span class="stat-value">${pDist}m</span>
      </div>
      <div class="result-stat">
        <span class="stat-label">🐈 Cat</span>
        <span class="stat-value">${cDist}m</span>
      </div>`;

  if (state.mode === 'multi') {
    statsHtml += `
      <div class="result-stat">
        <span class="stat-label">🏃‍♂️ Opp</span>
        <span class="stat-value">${oDist}m</span>
      </div>`;
  }

  statsHtml += '</div>';
  dom.resultBody.innerHTML = statsHtml;

  showScreen('result');
}

// ═══════════════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════════════

function renderPositions() {
  const trackW = dom.track.clientWidth;
  const usable = trackW - CONFIG.trackPadding * 2;

  // Use a fixed finish-line scale so all characters race left→right on an
  // absolute axis. Set in startGame/startGameCountdown from catSpeedPerSec * duration.
  const fl = state.finishLine || 1;

  // Position each character
  positionChar(dom.wrapCat,      state.catDist,      fl, usable);
  positionChar(dom.wrapPlayer,   state.playerDist,   fl, usable);
  positionChar(dom.wrapOpponent, state.opponentDist, fl, usable);

  // Update distance readouts
  dom.distPlayer.textContent  = Math.floor(state.playerDist);
  dom.distCat.textContent     = Math.floor(state.catDist);
  dom.distOpponent.textContent = Math.floor(state.opponentDist);
}

function positionChar(wrapEl, dist, finishLine, usablePx) {
  // Clamp between 0 and 1 so negative distances (cat start offset) sit at start rail.
  const ratio = Math.max(0, Math.min(dist / finishLine, 1));
  const px    = CONFIG.trackPadding + ratio * usablePx;
  wrapEl.style.left = px + 'px';
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function stopTimers() {
  clearInterval(state.tickTimer);
  clearInterval(state.countdownId);
  clearTimeout(state.preCountdownId);
  state.tickTimer      = null;
  state.countdownId    = null;
  state.preCountdownId = null;
}

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  cacheDom();

  // ── Login tab switching ────────────────────────────────────────────
  dom.tabOAuth.addEventListener('click',    () => switchTab(dom.tabOAuth));
  dom.tabGuest.addEventListener('click',    () => switchTab(dom.tabGuest));

  // ── Login buttons ──────────────────────────────────────────────────
  dom.btnLoginGoogle.addEventListener('click', () => loginWithGoogle());
  dom.btnLoginGuest.addEventListener('click', handleGuestLogin);
  dom.btnLogout.addEventListener('click', handleLogout);


  // ── Game mode buttons ──────────────────────────────────────────────
  document.getElementById('btn-sp-30').addEventListener('click', () => startGameCountdown('single', 30));
  document.getElementById('btn-sp-60').addEventListener('click', () => startGameCountdown('single', 60));
  document.getElementById('btn-mp-30').addEventListener('click', () => startMatchmaking('multi', 30));
  document.getElementById('btn-mp-60').addEventListener('click', () => startMatchmaking('multi', 60));

  // ── Matchmaking ────────────────────────────────────────────────────
  document.getElementById('btn-mm-cancel').addEventListener('click', cancelMatchmaking);

  // ── Game ────────────────────────────────────────────────────────────
  dom.btnRun.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onRunClick();
  });
  dom.btnRun.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onRunClick();
  }, { passive: false });

  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-quit-pause').addEventListener('click', quitToMenu);

  // ── Result ──────────────────────────────────────────────────────────
  document.getElementById('btn-back-menu').addEventListener('click', quitToMenu);

  // ── Keyboard shortcut: spacebar = RUN ──────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (state.screen === 'game' && !state.paused && e.code === 'Space') {
      e.preventDefault();
      onRunClick();
    }
  });

  console.log('[Paws & Panic] Initialized — state available at window._pp');

  // ── Auto-login: handle OAuth callback or restore session ───────────
  // Handle Google Implicit Flow first
  const hash = window.location.hash.substring(1);
  const hashParams = new URLSearchParams(hash);
  const idToken = hashParams.get('id_token');
  if (idToken) {
    const googleResult = await exchangeGoogleIdToken(idToken);
    if (googleResult?.ok) {
      window.location.hash = '';
      window.location.reload();
    } else {
      setStatus(googleResult?.error || 'Google sign-in failed — please try again.');
    }
  }

  const callbackResult = await handleCallback();
  if (callbackResult?.ok) {
    await completeLogin();
  } else if (hasStoredSession()) {
    setStatus('Restoring session…');
    const refreshResult = await refreshSession();
    if (refreshResult?.ok) {
      await completeLogin();
    } else {
      setStatus('Session expired — please log in again.');
    }
  }
});

// Expose for debugging and AGS integration
window._pp           = state;
window.updateLoginUI = updateLoginUI;
window.showScreen    = showScreen;
// ags.js calls this when a match is found via matchmakingNotif
window._ppStartGame  = startGameCountdown;
