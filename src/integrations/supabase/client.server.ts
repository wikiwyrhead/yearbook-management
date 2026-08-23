import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { localPgClient } from "../../lib/db/pg-client.server.ts";

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      (supabaseKey.startsWith("sb_publishable_") || supabaseKey.startsWith("sb_secret_")) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseAdminClient() {
  const isLocal = (process.env["DATA_BACKEND"] || "local") === "local";

  if (isLocal) {
    return localPgClient;
  }

  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return localPgClient;
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_SERVICE_ROLE_KEY),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: any | undefined;

export const supabaseAdmin = new Proxy({} as any, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
