# Production Client ID Implementation Checklist

## ✅ What Was Done

### 1. Code Changes
- [x] **ags-config.js** — Added environment detection and separate client ID selection:
  - `isProduction()` detects if running in prod (checks `env.MODE` and `github.io` domain)
  - `getClientId()` returns prod client ID in production, dev client ID in dev
  - `getRedirectURI()` returns prod redirect URI in production, dev redirect URI in dev
  - `AGS_CONFIG.isProduction` flag added for debugging

- [x] **auth.js** — No changes needed (uses `AGS_CONFIG.clientId` and `AGS_CONFIG.redirectURI` automatically)

### 2. Environment Configuration
- [x] **.env** — Development config with:
  - Dev client: `VITE_AGS_CLIENT_ID=1d2aecca2a234c49b14a664f1b7953fc`
  - Dev redirect: `VITE_AGS_REDIRECT_URI=http://localhost:5173`
  - Prod placeholders for documentation

- [x] **.env.example** — Template with dev/prod sections clearly separated

- [x] **.env.production** — Production config (used by `npm run build`):
  - Prod client placeholder: `VITE_AGS_PROD_CLIENT_ID=your-prod-client-id`
  - Prod redirect: `VITE_AGS_PROD_REDIRECT_URI=https://yudi-ab.github.io/paws-and-panic/`

### 3. CI/CD Pipeline
- [x] **.github/workflows/deploy.yml** — Updated to:
  - Set `VITE_AGS_PROD_CLIENT_ID` during build (with TODO placeholder)
  - Set `VITE_AGS_PROD_REDIRECT_URI` to production GitHub Pages URL
  - Keep dev client as fallback for compatibility
  - Added clear comments explaining the separate client approach

### 4. Documentation
- [x] **PROD_CLIENT_SETUP.md** — Comprehensive guide with:
  - Step-by-step AGS admin setup instructions
  - Environment file configuration
  - How the detection works
  - Troubleshooting common issues
  - Verification steps

---

## 📋 Remaining Tasks (For You)

### Critical: Create Production OAuth Client in AGS

1. **Login to AGS Admin Console**
   ```
   https://abyuditest-pawsandpanic.prod.gamingservices.accelbyte.io/admin
   ```

2. **Navigate to IAM → OAuth Clients**

3. **Create New OAuth Client**
   - Name: `Paws & Panic Web Production`
   - Type: `Public`
   - Redirect URI: `https://yudi-ab.github.io/paws-and-panic/`

4. **Copy the Client ID** (looks like: `1d2aecca2a234c49b14a664f1b7953fc`)

### Update Configuration Files with Production Client ID

1. **Update `.env`** (for local development):
   ```bash
   VITE_AGS_PROD_CLIENT_ID=<YOUR-NEW-PROD-CLIENT-ID>
   VITE_AGS_PROD_REDIRECT_URI=https://yudi-ab.github.io/paws-and-panic/
   ```

2. **Update `.env.production`**:
   ```bash
   VITE_AGS_PROD_CLIENT_ID=<YOUR-NEW-PROD-CLIENT-ID>
   VITE_AGS_PROD_REDIRECT_URI=https://yudi-ab.github.io/paws-and-panic/
   ```

3. **Update `.github/workflows/deploy.yml` (line ~31)**:
   ```yaml
   echo "VITE_AGS_PROD_CLIENT_ID=<YOUR-NEW-PROD-CLIENT-ID>" >> .env.production
   ```

### Push to GitHub

```bash
git add -A
git commit -m "feat: add dedicated production OAuth client credentials"
git push origin dev  # or main if ready
```

GitHub Actions will automatically deploy with the production client ID.

---

## 🔍 How to Verify It Works

### 1. Local Development Test
```bash
npm run dev
# Login with dev client ID (1d2aecca2a234c49b14a664f1b7953fc)
# Should work on http://localhost:5173
```

### 2. Production Build Test
```bash
npm run build
# Check that dist/ was created with prod config
```

### 3. Live Verification
After deployment to GitHub Pages:
1. Go to https://yudi-ab.github.io/paws-and-panic/
2. Try to login
3. Check browser console (F12 → Console):
   ```javascript
   // If you add this to ags-config.js during testing:
   console.log('AGS_CONFIG:', AGS_CONFIG);
   ```
4. Verify `clientId` is your production client ID (not the dev one)

### 4. AGS Admin Logs
1. Login to AGS Admin → Audit Logs or OAuth Logs
2. Filter for your production client ID
3. Confirm you see login attempts from the GitHub Pages domain

---

## 🎯 Benefits of This Setup

| Before | After |
|--------|-------|
| Single client ID for dev + prod | Separate client IDs |
| Risk of using dev credentials in prod | Isolated credentials per environment |
| Manual redirect URI switching needed | Automatic detection & selection |
| Hard to audit which env was used | Clear environment indicators |
| Accidental cross-env misconfigurations | Built-in safety checks |

---

## 📚 Files Modified

```
✏️  .env                                  — Added prod placeholders
✏️  .env.production                       — Updated with new structure
✏️  .env.example                          — Added prod section
✏️  ags-config.js                         — Added environment detection
✏️  .github/workflows/deploy.yml          — Updated CI env vars
📝 PROD_CLIENT_SETUP.md                   — New setup guide
📝 PROD_CLIENT_CHECKLIST.md               — This file
```

---

## ⚡ Quick Reference

### Environment Variables

**Development (.env)**:
- `VITE_AGS_CLIENT_ID` — Dev OAuth client ID
- `VITE_AGS_REDIRECT_URI` — Dev redirect (localhost:5173)
- `VITE_AGS_PROD_CLIENT_ID` — Prod OAuth client ID (for reference)
- `VITE_AGS_PROD_REDIRECT_URI` — Prod redirect (GitHub Pages URL)

**Production (.env.production)**:
- `VITE_AGS_PROD_CLIENT_ID` — Production OAuth client ID
- `VITE_AGS_PROD_REDIRECT_URI` — Production redirect URI
- `VITE_AGS_CLIENT_ID` — Fallback dev client (for compatibility)

### Configuration Flow

```
.env / .env.production
    ↓
npm run dev / npm run build
    ↓
Vite loads VITE_* variables into import.meta.env
    ↓
ags-config.js reads import.meta.env
    ↓
isProduction() detects environment
    ↓
getClientId() & getRedirectURI() select appropriate credentials
    ↓
auth.js uses AGS_CONFIG.clientId & AGS_CONFIG.redirectURI
    ↓
OAuth login uses correct client credentials per environment
```

---

## 🆘 Need Help?

See **PROD_CLIENT_SETUP.md** for:
- Detailed AGS admin walkthrough
- Troubleshooting redirect_uri_mismatch errors
- Testing steps with local production builds
- Verification in AGS logs
