# Milestone Yearbook - Local Development & Docker Deployment

This guide explains how to run the Milestone Yearbook application independently in local development or containerized via Docker.

## Prerequisites
- Node.js 22+ (or Docker 24+)
- A Supabase project (Cloud or self-hosted PostgreSQL)

## 1. Environment Setup
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
3. Generate a security secret: `openssl rand -base64 32` and set it as `MILESTONE_PROVIDER_SECRET`.
4. Set `VITE_APP_URL` to `http://localhost:8080` (for local development).

## 2. Database Setup
1. Apply the migrations in `supabase/migrations/` to your database.
2. Ensure you have the required storage buckets created:
   - `yearbook_assets`
   - `yearbook_proofs`
   - `yearbook_production`

## 3. Local Development
```bash
npm install
npm run dev
```
The development server will be available at `http://localhost:8080`.

To build and preview locally:
```bash
npm run build
npm run preview
```

## 4. Docker Deployment
To build and run the multi-stage production container:
```bash
docker compose build
docker compose up
```
The container boots using Node.js SSR (`node .output/server/index.mjs`) on port `8080`.

## 5. OAuth & Provider Configuration
When setting up Google Cloud, Box, or Canva developer applications, register the unified callback URL:
```
http://localhost:8080/api/public/auth/callback
```
Provide the corresponding Client ID and Client Secret in `.env`:
- **Google Drive**: `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` (Direct Google Drive API v3)
- **Box**: `BOX_CLIENT_ID` & `BOX_CLIENT_SECRET` (Box Content API v2)
- **Canva**: `CANVA_CLIENT_ID` & `CANVA_CLIENT_SECRET` (Canva Connect API with PKCE)

