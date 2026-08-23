import { createFileRoute } from "@tanstack/react-router";
import { validateAndConsumeOAuthState, deriveCodeVerifier } from "@/lib/storage/oauth-state.server";
import { sealCredentials } from "@/lib/storage/credentials.server";
import { parseSessionCookie, validateSession } from "@/lib/auth/session.server";
import { query, getDbPool } from "@/lib/db/pool.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateToken = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        if (error) {
          console.error(`OAuth error: ${error} - ${errorDescription}`);
          return new Response(`Authentication failed: ${errorDescription || error}`, {
            status: 400,
          });
        }

        if (!code || !stateToken) {
          return new Response("Missing code or state", { status: 400 });
        }

        try {
          const { getOAuthCallbackUrl } = await import("@/lib/app-url");
          const redirectUri = getOAuthCallbackUrl(request);

          // 1. Validate and consume single-use state
          const state = validateAndConsumeOAuthState(stateToken);

          // 2. Strict Super-Admin Session Matching for Canva
          if (state.provider === "canva") {
            const cookieHeader = request.headers.get("cookie");
            let sessionId = parseSessionCookie(cookieHeader);
            if (!sessionId) {
              const authHeader = request.headers.get("authorization");
              if (authHeader && authHeader.startsWith("Bearer ")) {
                sessionId = authHeader.replace("Bearer ", "");
              }
            }

            if (!sessionId) {
              return new Response(
                "Forbidden: Active Super Administrator session required for Canva connection.",
                { status: 403 },
              );
            }

            const sessionUser = await validateSession(sessionId);
            if (!sessionUser || sessionUser.id !== state.userId) {
              return new Response(
                "Forbidden: Authenticated session does not match OAuth state owner.",
                { status: 403 },
              );
            }

            // Verify current Super Admin role in database
            const adminCheck = await query(
              `SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'super_admin'`,
              [sessionUser.id],
            );
            if (adminCheck.rows.length === 0) {
              return new Response(
                "Forbidden: Only Super Administrators may connect external design providers.",
                { status: 403 },
              );
            }

            // Verify requested Yearbook exists if supplied
            if (state.yearbookId) {
              const ybCheck = await query(`SELECT id FROM public.yearbooks WHERE id = $1`, [
                state.yearbookId,
              ]);
              if (ybCheck.rows.length === 0) {
                return new Response("Invalid yearbook reference in OAuth state.", { status: 400 });
              }
            }
          }

          let tokens: { access_token: string; refresh_token?: string; expires_in?: number };

          // 3. Exchange code for tokens
          if (state.provider === "box") {
            const res = await fetch("https://api.box.com/oauth2/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                client_id: process.env["BOX_CLIENT_ID"]!,
                client_secret: process.env["BOX_CLIENT_SECRET"]!,
                redirect_uri: redirectUri,
              }),
            });
            if (!res.ok) throw new Error(`Box token exchange failed: ${await res.text()}`);
            tokens = await res.json();
          } else if (state.provider === "canva") {
            const authHeader = Buffer.from(
              `${process.env["CANVA_CLIENT_ID"]}:${process.env["CANVA_CLIENT_SECRET"]}`,
            ).toString("base64");
            const res = await fetch("https://api.canva.com/rest/v1/oauth/token", {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${authHeader}`,
              },
              body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                code_verifier: deriveCodeVerifier(stateToken),
                redirect_uri: redirectUri,
              }),
            });
            if (!res.ok) throw new Error(`Canva token exchange failed: ${await res.text()}`);
            tokens = await res.json();
          } else if (state.provider === "google_drive") {
            const res = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                client_id: process.env["GOOGLE_CLIENT_ID"]!,
                client_secret: process.env["GOOGLE_CLIENT_SECRET"]!,
                redirect_uri: redirectUri,
              }),
            });
            if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
            tokens = await res.json();
          } else {
            throw new Error(`Unsupported provider for OAuth callback: ${state.provider}`);
          }

          // 4. Encrypt tokens at rest (AES-256-GCM)
          const sealed = sealCredentials({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expires_in
              ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
              : undefined,
          });

          let accountEmail: string | undefined;
          let canvaUserId: string | undefined;
          let teamId: string | undefined;
          let displayName: string | undefined;

          if (state.provider === "google_drive") {
            try {
              const aboutRes = await fetch(
                "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)",
                {
                  headers: { Authorization: `Bearer ${tokens.access_token}` },
                },
              );
              if (aboutRes.ok) {
                const aboutJson = (await aboutRes.json()) as { user?: { emailAddress?: string } };
                accountEmail = aboutJson.user?.emailAddress;
              }
            } catch {
              // Ignore email resolution error
            }
          } else if (state.provider === "canva") {
            try {
              const meRes = await fetch("https://api.canva.com/rest/v1/users/me", {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
              });
              if (meRes.ok) {
                const meJson = (await meRes.json()) as {
                  team_user?: { team_id?: string; user_id?: string };
                };
                canvaUserId = meJson.team_user?.user_id;
                teamId = meJson.team_user?.team_id;
              }
              const profRes = await fetch("https://api.canva.com/rest/v1/users/me/profile", {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
              });
              if (profRes.ok) {
                const profJson = (await profRes.json()) as { profile?: { display_name?: string } };
                displayName = profJson.profile?.display_name;
              }
            } catch (err) {
              console.warn("[OAuthCallback] Canva profile fetch error:", err);
            }
          }

          // 5. Store in Database
          if (state.provider === "canva") {
            // Save into design_provider_connections transactionally
            const pool = getDbPool();
            const client = await pool.connect();
            try {
              await client.query("BEGIN");
              // Deactivate previous active connection
              await client.query(
                `UPDATE public.design_provider_connections
                 SET is_active = false, status = 'disconnected', disconnected_at = now(), updated_at = now()
                 WHERE provider = 'canva' AND is_active = true`,
              );

              // Insert new active connection
              await client.query(
                `INSERT INTO public.design_provider_connections (
                  provider,
                  connected_by,
                  encrypted_credentials,
                  external_user_id,
                  external_team_id,
                  display_name,
                  scopes,
                  is_active,
                  status,
                  connected_at,
                  updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'connected', now(), now())`,
                [
                  "canva",
                  state.userId,
                  sealed,
                  canvaUserId ?? null,
                  teamId ?? null,
                  displayName ?? "Connected Canva Account",
                  [
                    "profile:read",
                    "asset:read",
                    "asset:write",
                    "design:meta:read",
                    "design:content:read",
                    "design:content:write",
                  ],
                ],
              );
              await client.query("COMMIT");
            } catch (saveErr) {
              await client.query("ROLLBACK");
              throw saveErr;
            } finally {
              client.release();
            }

            console.log(
              `[OAuthCallback] Saved Super-Admin platform Canva connection (${displayName || canvaUserId})`,
            );
          } else if (state.scope === "center" && state.centerId) {
            const { error: upsertError } = await supabaseAdmin
              .from("center_storage_connections")
              .upsert({
                center_id: state.centerId,
                provider: state.provider,
                credentials: sealed,
                account_email: accountEmail ?? null,
                scopes: ["https://www.googleapis.com/auth/drive.file"],
                status: "connected",
                connected_by: state.userId,
                updated_at: new Date().toISOString(),
              });

            if (upsertError) {
              throw new Error(`Database error saving connection: ${upsertError.message}`);
            }

            if (state.yearbookId) {
              const { setupYearbookCenterFolders } =
                await import("@/lib/storage/settings.server.ts");
              await setupYearbookCenterFolders(state.yearbookId, state.centerId).catch(
                (err: unknown) => {
                  console.error("[OAuthCallback] Automatic folder setup warning:", err);
                },
              );
            }
          }

          // 6. Safe internal redirection
          const redirectUrl =
            state.provider === "canva"
              ? state.yearbookId
                ? `/yearbooks/${encodeURIComponent(state.yearbookId)}?tab=design`
                : "/dashboard"
              : state.yearbookId
                ? `/yearbooks/${encodeURIComponent(state.yearbookId)}?tab=storage`
                : state.centerId
                  ? `/schools/${encodeURIComponent(state.centerId)}`
                  : "/dashboard";

          return new Response(null, {
            status: 302,
            headers: { Location: redirectUrl },
          });
        } catch (err: any) {
          console.error("Callback error:", err);
          return new Response(`Authentication error: ${err.message}`, { status: 500 });
        }
      },
    },
  },
});
