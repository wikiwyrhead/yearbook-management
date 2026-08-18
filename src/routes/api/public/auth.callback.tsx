import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateOAuthState } from "@/lib/storage/oauth-state.server";
import { sealCredentials } from "@/lib/storage/credentials.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/auth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateToken = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        if (error) {
          console.error(`OAuth error: ${error} - ${errorDescription}`);
          return new Response(`Authentication failed: ${errorDescription || error}`, { status: 400 });
        }

        if (!code || !stateToken) {
          return new Response("Missing code or state", { status: 400 });
        }

        try {
          // 1. Validate state (CSRF protection + routing context)
          const state = validateOAuthState(stateToken);
          
          let tokens: { access_token: string; refresh_token?: string; expires_in?: number };

          // 2. Exchange code for tokens based on provider
          if (state.provider === "box") {
            const res = await fetch("https://api.box.com/oauth2/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                client_id: process.env["BOX_CLIENT_ID"]!,
                client_secret: process.env["BOX_CLIENT_SECRET"]!,
              }),
            });
            if (!res.ok) throw new Error(`Box token exchange failed: ${await res.text()}`);
            tokens = await res.json();
          } else if (state.provider === "canva") {
            const authHeader = Buffer.from(
              `${process.env["CANVA_CLIENT_ID"]}:${process.env["CANVA_CLIENT_SECRET"]}`
            ).toString("base64");
            const res = await fetch("https://api.canva.com/rest/v1/oauth/token", {
              method: "POST",
              headers: { 
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${authHeader}`
              },
              body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                code_verifier: "TODO_PKCE_VERIFIER", // Canva requires PKCE
                redirect_uri: `${url.origin}/api/public/auth/callback`,
              }),
            });
            if (!res.ok) throw new Error(`Canva token exchange failed: ${await res.text()}`);
            tokens = await res.json();
          } else {
            throw new Error(`Unsupported provider for custom OAuth callback: ${state.provider}`);
          }

          // 3. Encrypt and store tokens
          const sealed = sealCredentials({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : undefined,
          });

          if (state.scope === "organization") {
            await supabaseAdmin.from("organization_storage_connections").upsert({
              provider: state.provider as any,
              display_name: state.provider.charAt(0).toUpperCase() + state.provider.slice(1),
              credentials: sealed,
              updated_at: new Date().toISOString(),
            });
          } else if (state.scope === "member") {
            await supabaseAdmin.from("member_storage_connections").upsert({
              user_id: state.userId,
              provider: state.provider as any,
              credentials: sealed,
              updated_at: new Date().toISOString(),
            });
          } else if (state.provider === "canva" && state.yearbookId) {
             // Canva is yearbook-level in our current schema
             await supabaseAdmin.from("canva_integrations").upsert({
               yearbook_id: state.yearbookId,
               access_token_encrypted: sealed["accessToken"] ?? null,
               refresh_token_encrypted: sealed["refreshToken"] ?? null,
               updated_at: new Date().toISOString(),
             });
          }

          // 4. Redirect back to the app
          const redirectUrl = state.yearbookId 
            ? `/yearbooks/${state.yearbookId}?tab=settings`
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
