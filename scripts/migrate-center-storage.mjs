import pg from "pg";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf8");
let connStr = envFile
  .match(/DATABASE_URL="?([^"\n]+)"?/)[1]
  .replace("@postgres:5432", "@localhost:5432");
const pool = new pg.Pool({ connectionString: connStr });

export async function migrateCenterStorage() {
  const client = await pool.connect();
  try {
    console.log(
      "[Migration] Installing center_storage_connections table and yearbook folder mapping...",
    );
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.center_storage_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        center_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
        provider TEXT NOT NULL DEFAULT 'google_drive',
        credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
        account_email TEXT,
        scopes TEXT[] DEFAULT ARRAY['https://www.googleapis.com/auth/drive.file']::text[],
        status TEXT NOT NULL DEFAULT 'connected',
        root_folder_id TEXT,
        connected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (center_id, provider)
      );

      ALTER TABLE public.yearbook_storage_config
        ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS assets_folder_id TEXT,
        ADD COLUMN IF NOT EXISTS portraits_folder_id TEXT,
        ADD COLUMN IF NOT EXISTS proofs_folder_id TEXT,
        ADD COLUMN IF NOT EXISTS production_folder_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_center_storage_center_provider
        ON public.center_storage_connections (center_id, provider);
    `);

    await client.query("COMMIT");
    console.log("[Migration] center_storage_connections schema created successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Migration] Error migrating center storage:", err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith("migrate-center-storage.mjs")) {
  migrateCenterStorage()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end().finally(() => process.exit(1));
    });
}
