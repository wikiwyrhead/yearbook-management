# Milestone Yearbook - Local Development & Deployment

This guide explains how to run the Milestone Yearbook application outside the Lovable environment.

## Prerequisites
- Node.js 20+ or Bun 1.1+
- A Supabase project (or self-hosted Supabase/PostgreSQL)

## 1. Environment Setup
1. Copy `.env.example` to `.env`.
2. Fill in your `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
3. Generate a security secret: `openssl rand -base64 32` and set it as `MILESTONE_PROVIDER_SECRET`.
4. Set `VITE_APP_URL` to `http://localhost:8080` (for local dev).

## 2. Database Setup
1. Apply the migrations located in `supabase/migrations/` to your Supabase/PostgreSQL database.
2. Ensure you have the required storage buckets created:
   - `yearbook_assets`
   - `yearbook_proofs`
   - `yearbook_production`

## 3. Local Development
Using Bun (Recommended):
```bash
bun install
bun dev
```

Using NPM:
```bash
npm install
npm run dev
```

## 4. Docker Deployment
```bash
docker-compose up --build
```

## 5. OAuth Configuration
When setting up Google, Box, or Canva developer apps, use the following callback URL:
`${VITE_APP_URL}/api/public/auth/callback`

For local development with the default Vite port:
`http://localhost:8080/api/public/auth/callback`
