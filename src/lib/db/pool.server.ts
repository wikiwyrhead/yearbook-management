import pg from "pg";
import fs from "node:fs";

const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function getDbPool(): pg.Pool {
  if (!_pool) {
    let connectionString = process.env["DATABASE_URL"];
    if (!connectionString && fs.existsSync(".env")) {
      const envContent = fs.readFileSync(".env", "utf8");
      const m = envContent.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
      if (m) connectionString = m[1];
    }
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required but not set.");
    }

    const resolvedUrl = (!fs.existsSync("/.dockerenv") && connectionString.includes("@postgres:5432"))
      ? connectionString.replace("@postgres:5432", "@localhost:5432")
      : connectionString;

    _pool = new Pool({
      connectionString: resolvedUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    _pool.on("error", (err) => {
      console.error("[PostgreSQL Pool] Unexpected client error:", err);
    });
  }
  return _pool;
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: any[] = [],
): Promise<pg.QueryResult<T>> {
  const pool = getDbPool();
  return pool.query<T>(text, params);
}
