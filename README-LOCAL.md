# Milestone Yearbook — Local Development & Docker Deployment

This guide explains how to run the Milestone Yearbook application locally using the canonical development hostname:
```
http://yearbook-manager.test
```

---

## 1. Local Hostname Setup (Hosts File)

Map `yearbook-manager.test` to your local loopback address (`127.0.0.1`).

### Windows 11 / Windows 10
1. Open **Notepad** (or your code editor) as **Administrator** (Right-click → "Run as administrator").
2. Open the hosts file at:
   ```
   C:\Windows\System32\drivers\etc\hosts
   ```
3. Add the following line at the bottom:
   ```text
   127.0.0.1 yearbook-manager.test
   ```
4. Save the file.

### Linux / macOS
Add the entry to `/etc/hosts`:
```bash
echo "127.0.0.1 yearbook-manager.test" | sudo tee -a /etc/hosts
```

---

## 2. Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Configure core parameters:
   ```ini
   # Canonical application URL (no trailing slash)
   VITE_APP_URL=http://yearbook-manager.test

   # Internal container port (keep 8080)
   PORT=8080

   # Host port exposed by Docker Compose
   # Use 80 for direct access at http://yearbook-manager.test
   # Use 8080 or custom (e.g. 8088) if port 80 is occupied on your host
   HOST_PORT=80

   # Supabase Credentials (from your Supabase project dashboard)
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

   # 32-byte Base64 AES-256-GCM encryption secret (generate with: openssl rand -base64 32)
   MILESTONE_PROVIDER_SECRET=your-32-byte-base64-secret
   ```

---

## 3. Database Setup (Supabase / PostgreSQL)

1. Apply migrations from `supabase/migrations/` to your Supabase/PostgreSQL database.
2. Verify the 3 required storage buckets exist:
   - `yearbook_assets`
   - `yearbook_proofs`
   - `yearbook_production`

---

## 4. Supabase Auth Configuration (Dashboard)

To enable email sign-up confirmations, password resets, and Google OAuth to redirect back to `yearbook-manager.test`:

1. Go to your **Supabase Dashboard** → **Authentication** → **URL Configuration**.
2. Set **Site URL**:
   ```
   http://yearbook-manager.test
   ```
3. In **Redirect URLs**, add:
   ```
   http://yearbook-manager.test/**
   http://yearbook-manager.test/dashboard
   http://yearbook-manager.test/auth
   ```

---

## 5. OAuth Provider Configuration

When configuring external providers, register the unified callback route:
```
http://yearbook-manager.test/api/public/auth/callback
```

### A. Google Cloud Console (Direct Google Drive API v3)
- **Console**: [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
- **Authorized JavaScript origins**: `http://yearbook-manager.test`
- **Authorized redirect URIs**:
  ```
  http://yearbook-manager.test/api/public/auth/callback
  ```
- *Note for Supabase Google Sign-In*: If using Google for user login via Supabase Auth, also register the Supabase callback URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
- *Scopes*: `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `.../auth/drive.readonly`.

### B. Box Developer Console (Box Content API v2)
- **Console**: [Box Developer Console](https://account.box.com/developers/console)
- **OAuth 2.0 Redirect URI**:
  ```
  http://yearbook-manager.test/api/public/auth/callback
  ```

### C. Canva Developer Portal (Canva Connect API with PKCE)
- **Console**: [Canva Developers Portal](https://www.canva.com/developers/)
- **Redirect URL**:
  ```
  http://yearbook-manager.test/api/public/auth/callback
  ```
- *Scopes*: `design:content:read`, `design:meta:read`.
- *Note on HTTPS*: In production, Canva Connect requires HTTPS; development test integrations allow custom registered local URLs.

---

## 6. Running Locally

### Via Docker Compose (Recommended)
```bash
# Build multi-stage container
docker compose build

# Start container in detached mode
docker compose up -d
```
Access the application at:
```
http://yearbook-manager.test
```
*(If `HOST_PORT` was set to e.g. `8080`, access at `http://yearbook-manager.test:8080`)*.

To view logs or stop:
```bash
docker compose logs -f
docker compose down
```

### Via Local Node.js Dev Server
```bash
npm install
npm run dev
```
Development server runs on port 8080. If bound with port 80 proxy or directly, access at `http://yearbook-manager.test:8080`.
