# Milestone Yearbook — Development & Agent Guidelines

> [!IMPORTANT]
> - Always maintain portable, local-first code compatible with standard Node.js SSR, Vite, TanStack Start, and Docker.
> - Direct provider integrations (Google Drive API v3, Box API v2, Canva Connect API) use direct OAuth and AES-256-GCM token storage.
> - Database operations and access control are strictly scoped via Supabase PostgreSQL RLS policies and server-side function middleware.
> - Avoid rewriting published Git history on the main branch.
