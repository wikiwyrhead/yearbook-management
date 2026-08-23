import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const isLocal = (process.env["DATA_BACKEND"] || "local") === "local";
    const request = getRequest();

    const SUPABASE_URL = process.env["SUPABASE_URL"] || "https://hqypeomqassitvdhmrfj.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY =
      process.env["SUPABASE_PUBLISHABLE_KEY"] || "sb_publishable_R8Vxp-iWiAa1GrZ5gHiEPw_3_iCv_sL";

    if (isLocal) {
      // 1. LOCAL AUTHENTICATION (Session Cookie or Bearer Token)
      const { parseSessionCookie, validateSession } = await import("../../lib/auth/session.server");
      const cookieHeader = request?.headers?.get("cookie");
      let sessionId = parseSessionCookie(cookieHeader);

      if (!sessionId) {
        const authHeader = request?.headers?.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          sessionId = authHeader.replace("Bearer ", "");
        }
      }

      if (!sessionId) {
        throw new Error("Unauthorized: No active session. Please sign in.");
      }

      const user = await validateSession(sessionId);
      if (!user) {
        throw new Error("Unauthorized: Session expired or invalid.");
      }

      const { localPgClient } = await import("../../lib/db/pg-client.server");

      return next({
        context: {
          supabase: localPgClient as any,
          userId: user.id as string,
          claims: { sub: user.id, email: user.email, roles: user.roles } as any,
        },
      });
    }

    // 2. SUPABASE CLOUD FALLBACK
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Missing Supabase environment variables");
    }

    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims || !data.claims.sub) {
      throw new Error("Unauthorized: Invalid token");
    }

    return next({
      context: {
        supabase: supabase as SupabaseClient<Database>,
        userId: data.claims.sub as string,
        claims: data.claims,
      },
    });
  },
);
