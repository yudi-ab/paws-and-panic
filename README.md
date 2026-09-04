# 🐈 Paws & Panic

A frantic button-masher built to **test AccelByte Gaming Services (AGS) infrastructure** — login, matchmaking, and real-time position sync. Click to outrun a creeping cat (single-player) or race another player (multiplayer).

## Project layout

```
paws-and-panic/
├── index.html        # Single-page app — 4 screens (menu, matchmaking, game, result)
├── style.css         # Hyper-casual styling (Fredoka + Nunito)
├── app.js            # Game engine + window.ags* PLACEHOLDER functions
├── ags.js            # Real AGS SDK wiring (overrides the placeholders)
├── ags-config.js     # Reads AGS credentials from .env
├── package.json      # npm + Vite tooling
├── vite.config.js    # Vite dev server / build config
├── .env.example      # Template for your AGS credentials
└── .gitignore
```

## Two ways to run

### A. Zero-install (placeholder simulation)

The game is plain static files. Just serve the folder — no npm needed:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

AGS calls are **simulated** (fake login, fake opponent). Great for playing/UI work.

> Note: opening `index.html` directly via `file://` will fail because `app.js`/`ags.js`
> are ES modules. Use a local server (above) or Vite (below).

### B. With npm + Vite (real AGS integration)

```bash
npm install
cp .env.example .env      # then edit .env with your AGS credentials
npm run dev               # http://localhost:5173
```

Build for production:

```bash
npm run build             # → dist/
npm run preview           # serve the built output
```

## Wiring up AGS

All AGS traffic funnels through **four functions**, defined as placeholders in `app.js`
and overridden by `ags.js`:

| Function | Direction | Purpose |
|---|---|---|
| `window.agsLogin()` | out | OAuth login |
| `window.agsFindMatch(duration)` | out | Matchmaking v2 ticket |
| `window.agsSendPosition(distance)` | out | Send our distance to the opponent |
| `window.agsOnReceiveOpponentPosition(distance)` | in | Render opponent's distance |

To go live:

1. `cp .env.example .env` and fill in `VITE_AGS_*` values.
2. In `ags.js`, uncomment the SDK imports at the top and search for `TODO:` —
   each marks a spot where you plug in a real SDK call. The method names shown
   match the typical AGS Web SDK v28 shape; adjust for your version.
3. `ags.js` auto-detects credentials via `isAgsConfigured()`. Until `.env` is set,
   it logs a warning and leaves the simulated placeholders in place, so the game
   stays playable throughout integration.

## Debugging

- `window._pp` — live game state (screen, distances, timer)
- `window._ags` — AGS module state (sdk, lobby socket, session, user)
