import { createFileRoute } from "@tanstack/react-router";
import { validateAndConsumeOAuthState } from "@/lib/storage/oauth-state.server";
import { parseSessionCookie, validateSession } from "@/lib/auth/session.server";
import { query } from "@/lib/db/pool.server";

export const Route = createFileRoute("/api/public/canva/return")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const stateToken = url.searchParams.get("state");
        const customPath = url.searchParams.get("return_to");

        // 1. If signed state token is provided, strictly validate Super Admin session & ownership
        if (stateToken) {
          try {
            const state = validateAndConsumeOAuthState(stateToken);
            if (state.provider !== "canva") {
              return new Response("Invalid provider for Canva return navigation.", { status: 400 });
            }

            // Session Verification
            const cookieHeader = request.headers.get("cookie");
            let sessionId = parseSessionCookie(cookieHeader);
            if (!sessionId) {
              const authHeader = request.headers.get("authorization");
              if (authHeader && authHeader.startsWith("Bearer ")) {
                sessionId = authHeader.replace("Bearer ", "");
              }
            }

            if (!sessionId) {
              return new Response("Forbidden: Active Super Administrator session required.", {
                status: 403,
              });
            }

            const sessionUser = await validateSession(sessionId);
            if (!sessionUser || sessionUser.id !== state.userId) {
              return new Response(
                "Forbidden: Authenticated user does not match return navigation state owner.",
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
                "Forbidden: Only Super Administrators may use Canva return navigation.",
                { status: 403 },
              );
            }

            const targetYearbook = state.yearbookId;
            if (targetYearbook) {
              const safeDestination = `/yearbooks/${encodeURIComponent(targetYearbook)}?tab=design`;
              return new Response(null, {
                status: 302,
                headers: { Location: safeDestination },
              });
            }
          } catch (err: any) {
            console.warn("[CanvaReturn] Invalid or replayed state token:", err?.message);
            return new Response(`Return Navigation Failed: ${err?.message || "Invalid state"}`, {
              status: 400,
            });
          }
        }

        // 2. Validate custom return_to path if state is not provided (must be safe relative URL)
        if (customPath) {
          if (
            !customPath.startsWith("/") ||
            customPath.startsWith("//") ||
            customPath.includes("://") ||
            customPath.includes("\\")
          ) {
            return new Response("Unsafe external return URL rejected.", { status: 400 });
          }
          return new Response(null, {
            status: 302,
            headers: { Location: customPath },
          });
        }

        // Fallback default safe dashboard redirect
        return new Response(null, {
          status: 302,
          headers: { Location: "/dashboard" },
        });
      },
    },
  },
});
