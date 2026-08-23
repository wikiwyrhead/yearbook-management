# Milestone Yearbook — Development & Agent Guidelines

> [!IMPORTANT]
>
> - Always maintain portable, local-first code compatible with standard Node.js SSR, Vite, TanStack Start, and Docker.
> - Direct provider integrations (Google Drive API v3, Box API v2, Canva Connect API) use direct OAuth and AES-256-GCM token storage.
> - Database operations and access control are strictly scoped via Supabase PostgreSQL RLS policies and server-side function middleware.
> - Avoid rewriting published Git history on the main branch.

---

## Public Repo / Private Local Dev Separation

> [!IMPORTANT]
> **This repository is PUBLIC. The owner's local environment is PRIVATE.**
> These two rules MUST be maintained in every session and every commit.

### The Golden Rule

**Source code = generic. Personal config = `.env` only.**

| Belongs in source code (committed) | Belongs in `.env` only (gitignored) |
|------------------------------------|--------------------------------------|
| `http://localhost:8080` (fallback) | `VITE_APP_URL=https://<your-tunnel-domain>` |
| `<YOUR_POSTGRES_PASSWORD>` in `.env.example` | `POSTGRES_PASSWORD=real-password` in `.env` |
| `@example.com` placeholder emails | Real OAuth client IDs and secrets |
| Generic feature code and migrations | Tunnel credentials, API tokens, session secrets |

### Local dev keeps working — here's why

The app resolves its URL in this priority order (`src/lib/app-url.ts`):

1. `x-forwarded-host` request header (set by Cloudflare tunnel automatically)
2. `VITE_APP_URL` from `.env` → **this is where your tunnel URL lives**
3. `window.location.origin` (client-side)
4. Generic fallback: `http://localhost:8080`

So in local development, `.env` configures `VITE_APP_URL` with your private tunnel URL and everything works smoothly. The public repo only contains `http://localhost:8080` as the generic fallback.

### What agents MUST NEVER commit

- Personal domains or tunnel URLs
- Absolute home/user paths (e.g. `/home/<user>/...`)
- Real email addresses (use `@test.yearbook` or `@example.com` for fixtures)
- Real service bureau domains in seed data (use `.example.com`)
- Any script containing production UUIDs, session tokens, or private tunnel endpoints
- `.env` files, `.localdev/` contents, `/etc/cloudflared/` contents

### Pull Request & Contribution Workflow

- **Fork**: `origin` (`https://github.com/wikiwyrhead/yearbook-management`) is the contributor repository.
- **Upstream**: `upstream` (`https://github.com/adonix26/yearbook-management`) is the original repository.
- **Workflow**:
  1. Develop and test features locally.
  2. Commit and push feature branches to your fork (`origin`).
  3. Open a Pull Request from `wikiwyrhead:<branch>` to `adonix26:main`.
  4. Leave the Pull Request **open** so the original repository maintainers can review and merge.

### Pre-commit hook

A `.git/hooks/pre-commit` hook is installed in local dev that blocks commits containing:
- Personal tunnel domains
- Absolute home directory paths
- Stale default passwords or sequential AES test keys
- Tracked `.env` or dev-only scripts

If the hook fires, **do not force-push**. Fix the offending file and re-commit.

---

## Infrastructure Guidelines

- **Tunnel & Proxy**: Handled via system services or containerized reverse proxy, configured via `VITE_APP_URL` in `.env`.
- **OAuth redirect URIs**: Configured at provider developer portals to point to `<APP_URL>/api/public/auth/callback`.
- **Canva credentials**: `design_provider_connections` (DPC) is authoritative.
- **Database password**: Stored in `.env` and Docker volume only; never hardcoded anywhere.
