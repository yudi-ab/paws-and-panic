# Production Client ID Setup Guide

This guide walks you through setting up a **dedicated OAuth client ID for production** with a separated redirect URI. This ensures your production environment is isolated from development, improving security and preventing accidental cross-environment issues.

## Why a Separate Production Client?

- **Isolation**: Production and dev credentials are completely separate
- **Safety**: Reducing the risk of using dev credentials in production or vice versa
- **Auditability**: Makes it easier to track which client was used in logs/monitoring
- **Control**: Each environment can have different settings (CORS, allowed URIs, etc.)

---

## Step 1: Create a Production OAuth Client in AGS Admin

1. **Login to AGS Admin Console**
   - Go to: https://abyuditest-pawsandpanic.prod.gamingservices.accelbyte.io/admin
   - Navigate to: **IAM → OAuth Clients** (or **Clients → OAuth**)

2. **Create New Client**
   - Click **"Create Client"** or **"New Client"**
   - Client Name: `Paws & Panic Web Production` (or similar)
   - Client Type: **Public** (since this is a browser-based client)

3. **Configure Redirect URIs**
   - Add Redirect URI: `https://yudi-ab.github.io/paws-and-panic/`
   - Make sure this matches **exactly** (no trailing slash issues, exact domain)
   - Save the client

4. **Copy Your Production Client ID**
   - After creation, you'll see a **Client ID** (looks like: `1d2aecca2a234c49b14a664f1b7953fc`)
   - Copy this value — you'll need it in the next step

---

## Step 2: Update Environment Configuration Files

### For Local Development (`.env`)

Your `.env` file already has the dev client configured. No changes needed unless you want to add the prod values:

```bash
# Dev client (used locally)
VITE_AGS_CLIENT_ID=1d2aecca2a234c49b14a664f1b7953fc
VITE_AGS_REDIRECT_URI=http://localhost:5173

# Prod client (optional locally, but good to have for testing)
VITE_AGS_PROD_CLIENT_ID=YOUR-PROD-CLIENT-ID-HERE
VITE_AGS_PROD_REDIRECT_URI=https://yudi-ab.github.io/paws-and-panic/
```

### For Production Builds (`.env.production`)

This file is used by `npm run build` when building for production:

```bash
# Replace with your actual production client ID from Step 1
VITE_AGS_PROD_CLIENT_ID=YOUR-PROD-CLIENT-ID-HERE
VITE_AGS_PROD_REDIRECT_URI=https://yudi-ab.github.io/paws-and-panic/
```

### In GitHub Actions CI (`.github/workflows/deploy.yml`)

The CI workflow automatically sets these values during the build. Update the placeholder:

```yaml
# Line ~31 in .github/workflows/deploy.yml
echo "VITE_AGS_PROD_CLIENT_ID=YOUR-PROD-CLIENT-ID-HERE" >> .env.production
echo "VITE_AGS_PROD_REDIRECT_URI=https://yudi-ab.github.io/paws-and-panic/" >> .env.production
```

---

## Step 3: How the Code Detects Production

The `ags-config.js` file automatically detects the environment and selects the appropriate client:

```javascript
// Detects if running in production
const isProduction = () => {
  return env.MODE === 'production' ||
         (typeof window !== 'undefined' && window.location.hostname.includes('github.io'));
};

// Uses prod client ID if production, otherwise uses dev client ID
const getClientId = () => {
  if (isProduction()) {
    return env.VITE_AGS_PROD_CLIENT_ID || env.VITE_AGS_CLIENT_ID || '';
  }
  return env.VITE_AGS_CLIENT_ID || '';
};
```

**No code changes needed** — the detection happens automatically!

---

## Step 4: Test Locally (Optional)

If you want to test production credentials locally:

1. Build production locally:
   ```bash
   npm run build
   ```

2. Check the built `.env.production` to verify your prod client ID is included

3. Serve the build locally:
   ```bash
   npm install -g http-server
   http-server dist/
   ```

4. Open `http://localhost:8080/paws-and-panic/` (adjust port as needed)

---

## Step 5: Deploy and Verify

### Deploy to GitHub Pages

1. Merge your changes to `main`:
   ```bash
   git add .env.example .env .env.production .github/workflows/deploy.yml ags-config.js
   git commit -m "feat: add dedicated production OAuth client ID"
   git push
   ```

2. GitHub Actions automatically runs the deploy workflow
   - The workflow sets `VITE_AGS_PROD_CLIENT_ID` and builds with production credentials

3. Check the deployment:
   - Go to: https://yudi-ab.github.io/paws-and-panic/
   - Open browser DevTools → Network → Login
   - Verify the OAuth redirect is to the production client (check the Authorization URL)

### Verify in AGS Logs

1. Login to AGS Admin → **Audit Logs** or **OAuth Logs**
2. Look for authentication events using your production client ID
3. Confirm redirect URI matches `https://yudi-ab.github.io/paws-and-panic/`

---

## Troubleshooting

### Error: `redirect_uri_mismatch`

**Cause**: The redirect URI in the code doesn't match what's registered in AGS admin.

**Fix**:
1. Check `.env.production` has the correct `VITE_AGS_PROD_REDIRECT_URI`
2. Verify AGS admin OAuth client settings match exactly
3. No trailing slashes, exact domain/path match

### Error: `invalid_client` or `client not found`

**Cause**: The production client ID is wrong or not created yet.

**Fix**:
1. Verify you created the client in AGS admin
2. Double-check the client ID (copy-paste from admin console)
3. Update all three locations: `.env`, `.env.production`, `.github/workflows/deploy.yml`

### Prod site still uses dev credentials

**Cause**: Production build may have stale prod client ID.

**Fix**:
1. Clear `.env.production` (it may have been cached)
2. Manually verify in CI logs that the prod client ID was written
3. Force a new build by pushing a small commit

---

## Summary

| Environment | Client ID Variable | Redirect URI Variable | Used In |
|---|---|---|---|
| **Local Dev** | `VITE_AGS_CLIENT_ID` | `VITE_AGS_REDIRECT_URI` | `.env` |
| **Production** | `VITE_AGS_PROD_CLIENT_ID` | `VITE_AGS_PROD_REDIRECT_URI` | `.env.production` |
| **GitHub CI** | Set in workflow step | Set in workflow step | `.github/workflows/deploy.yml` |

The app automatically selects the right credentials based on `isProduction()` detection in `ags-config.js`.

---

## Next Steps

1. ✅ Create the production OAuth client in AGS admin → copy the client ID
2. ✅ Update `VITE_AGS_PROD_CLIENT_ID` in `.env`, `.env.production`, and the CI workflow
3. ✅ Commit and push to `main`
4. ✅ Watch GitHub Actions deploy automatically
5. ✅ Verify prod site login works with the new client ID
6. ✅ Monitor AGS logs to confirm production client usage
