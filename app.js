/**
 * ═══════════════════════════════════════════════════════════════════════
 * Paws & Panic – AGS Infrastructure Test Game
 * ═══════════════════════════════════════════════════════════════════════
 *
 * AGS SDK PLACEHOLDER FUNCTIONS (replace with real AGS Web SDK calls):
 *
 *   window.agsLogin()                           – authenticate the player
 *   window.agsFindMatch(duration)               – start matchmaking
 *   window.agsSendPosition(distance)            – send player distance to opponent
 *   window.agsOnReceiveOpponentPosition(distance) – called when opponent distance arrives
 *
 * The placeholders below simulate success so the game is playable standalone.
 */

'use strict';

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
  countdownId:  null,     // setInterval id for 1-second countdown
  lastClick:    0,        // Date.now() of last registered click

  // AGS auth
  loggedIn:     false,
  username:     null,
};

// ═══════════════════════════════════════════════════════════════════════
// AGS SDK PLACEHOLDERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Login placeholder – simulates a successful login after a short delay.
 * Replace the body of this function with the real AGS Web SDK login call.
 */
window.agsLogin = function agsLogin() {
  console.log('[AGS Placeholder] agsLogin() called');
  setStatus('Signing in…');

  setTimeout(() => {
    state.loggedIn = true;
    state.username = 'Runner' + Math.floor(Math.random() * 9000 + 1000);
    setStatus('Signed in as ' + state.username + ' ✓');
    dom.btnLogin.textContent = '👤 ' + state.username;
    dom.btnLogin.disabled = true;
    console.log('[AGS Placeholder] Login success:', state.username);
  }, 600);
};

/**
 * Find-match placeholder – simulates finding an opponent.
 * Replace with real AGS matchmaking call.
 * @param {number} duration – match length in seconds (30 | 60)
 * @returns {string} a fake matchId
 */
window.agsFindMatch = function agsFindMatch(duration) {
  const matchId = 'match_' + Math.random().toString(36).slice(2, 11);
  console.log('[AGS Placeholder] agsFindMatch(%d) → %s', duration, matchId);
  return matchId;
};

/**
 * Send the local player's current distance to the opponent.
 * Replace with real AGS real-time message send.
 * @param {number} distance
 */
window.agsSendPosition = function agsSendPosition(distance) {
  console.log('[AGS Placeholder] agsSendPosition(%d)', distance);
  // In a real integration this would send via AGS WebSocket / lobby.
};

/**
 * Called when the AGS SDK delivers an opponent position update.
 * Wire this as the callback in your AGS message listener.
 * @param {number} distance
 */
window.agsOnReceiveOpponentPosition = function agsOnReceiveOpponentPosition(distance) {
  console.log('[AGS Placeholder] agsOnReceiveOpponentPosition(%d)', distance);
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

  // Menu
  dom.btnLogin      = document.getElementById('btn-login');
  dom.statusMsg     = document.getElementById('menu-login-status');

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
// GAME LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════

function startGame(mode, duration) {
  state.mode        = mode;
  state.duration    = duration;
  state.timeLeft    = duration;
  state.playerDist  = 0;
  state.catDist     = 0;
  state.opponentDist = 0;
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

function startMatchmaking(mode, duration) {
  if (!state.loggedIn) {
    setStatus('Please log in first!');
    return;
  }

  showScreen('matchmaking');
  window.agsFindMatch(duration);

  // Simulate finding an opponent after a delay
  setTimeout(() => {
    startGame(mode, duration);
  }, 2200);
}

function cancelMatchmaking() {
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
  if (state.catDist >= state.playerDist) {
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
  dom.pauseOverlay.style.display = 'none';
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

  // Determine the farthest distance for scaling (so the leader fills the track)
  const maxDist = Math.max(state.playerDist, state.catDist, state.opponentDist, 1);

  // Position each character
  positionChar(dom.wrapCat,      state.catDist,      maxDist, usable);
  positionChar(dom.wrapPlayer,   state.playerDist,   maxDist, usable);
  positionChar(dom.wrapOpponent, state.opponentDist, maxDist, usable);

  // Update distance readouts
  dom.distPlayer.textContent  = Math.floor(state.playerDist);
  dom.distCat.textContent     = Math.floor(state.catDist);
  dom.distOpponent.textContent = Math.floor(state.opponentDist);
}

function positionChar(wrapEl, dist, maxDist, usablePx) {
  const ratio = Math.min(dist / maxDist, 1);
  const px = CONFIG.trackPadding + ratio * usablePx;
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
  state.tickTimer = null;
  state.countdownId = null;
}

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();

  // ── Menu buttons ───────────────────────────────────────────────────
  dom.btnLogin.addEventListener('click', () => window.agsLogin());

  document.getElementById('btn-sp-30').addEventListener('click', () => startGame('single', 30));
  document.getElementById('btn-sp-60').addEventListener('click', () => startGame('single', 60));
  document.getElementById('btn-mp-30').addEventListener('click', () => startMatchmaking('multi', 30));
  document.getElementById('btn-mp-60').addEventListener('click', () => startMatchmaking('multi', 60));

  // ── Matchmaking ────────────────────────────────────────────────────
  document.getElementById('btn-mm-cancel').addEventListener('click', cancelMatchmaking);

  // ── Game ────────────────────────────────────────────────────────────
  // The RUN button handles both mouse and touch for rapid tapping.
  dom.btnRun.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onRunClick();
  });
  // Fallback for older browsers
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
});

// Expose for debugging
window._pp = state;
