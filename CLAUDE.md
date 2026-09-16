# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Paws & Panic is a frantic button-masher game built to test AccelByte Gaming Services (AGS) infrastructure - specifically login flows, matchmaking, and real-time position synchronization. The game simulates a cat chasing the player (single-player) or racing against another player (multiplayer).

## Key Files & Structure
- **index.html**: Single-page application with 4 screens (menu, matchmaking, game, result)
- **app.js**: Core game engine containing:
  - Game state management (state object)
  - Physics/tick system (100ms intervals)
  - Player input handling (click events)
  - Rendering logic (position tracking)
  - AGS placeholder functions (overridden when configured)
- **ags.js**: Real AGS integration layer that:
  - Handles matchmaking and lobby socket connections
  - Processes position updates from opponent
  - Contains AGS SDK initialization and configuration
- **ags-config.js**: Central configuration file reading VITE_AGS_* environment variables
- **auth.js**: Authentication module with multiple login methods (OAuth, password, device ID)
- **package.json**: npm scripts for development and production builds

## Development Workflow
### Starting the Game
**Zero-install (placeholder simulation):**
```bash
python3 -m http.server 8080
# Open http://localhost:8080
```
*Note: Direct file:// access fails due to ES modules - use local server*

**With npm + Vite (real AGS integration):**
```bash
npm install
cp .env.example .env      # Edit .env with AGS credentials
npm run dev               # http://localhost:5173
npm run build             # → dist/ (production build)
npm run preview           # serve built output
```

### Key Scripts
- `npm run dev`: Start development server with hot reload
- `npm run build`: Create production build in dist/
- `npm run preview`: Preview production build locally

### AGS Configuration
1. Copy `.env.example` to `.env`
2. Fill in required values:
   - `VITE_AGS_BASE_URL`: AGS environment URL (demo or prod)
   - `VITE_AGS_NAMESPACE`: Your game namespace
   - `VITE_AGS_CLIENT_ID`: OAuth client ID (dev/staging)
   - `VITE_AGS_REDIRECT_URI`: Matching redirect URI
   - Production values: `VITE_AGS_PROD_CLIENT_ID` and `VITE_AGS_PROD_REDIRECT_URI`
3. The game automatically detects production vs development mode

## AGS Integration Architecture
The game uses a placeholder/override pattern:
1. **app.js** contains placeholder functions:
   - `window.agsFindMatch()` - simulates matchmaking
   - `window.agsSendPosition()` - placeholder for position sync
   - `window.agsOnReceiveOpponentPosition()` - callback handler

2. **ags.js** overrides these when configured:
   - Opens lobby WebSocket connection
   - Handles matchmaking ticket creation/cancellation
   - Processes real opponent position updates
   - Manages lobby state (session, user info, pending matches)

3. **Configuration detection**:
   - `isAgsConfigured()` checks for minimum required values
   - Production mode uses dedicated client ID and redirect URI
   - Development uses localhost:5173 with Vite proxy

## Game Mechanics
- **Single-player**: Player vs animated cat (cat moves continuously toward player)
- **Multiplayer**: Player races against another user (real-time position sync)
- **Scoring**: Distance traveled before game ends (time or cat catch)
- **Controls**: Click anywhere to move player (spacebar also works)

## Debugging & Testing
- `window._pp` contains live game state for debugging
- `window._ags` shows AGS module state
- Console logs provide detailed AGS operations
- Use browser dev tools to inspect network requests and state changes

## Common Issues & Solutions
1. **AGS not configured**: 
   - Ensure `.env` file exists with valid credentials
   - Check console for "Using placeholder simulation" warning
   - Verify `.env` values match AGS admin portal settings

2. **Login issues**:
   - Verify redirect URI matches exactly in AGS portal
   - Check browser console for OAuth flow errors
   - Clear localStorage if stuck in login loop

3. **Multiplayer sync problems**:
   - Ensure both players are properly logged in
   - Verify opponent position updates appear in game HUD
   - Check network tab for AGS API calls

## Important Notes
- Never commit `.env` file (it's gitignored)
- The game works in "placeholder mode" without real AGS credentials
- Production deployment requires proper AGS configuration and client IDs
- For multiplayer testing, use different browser profiles or incognito windows