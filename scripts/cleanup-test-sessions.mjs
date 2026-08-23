import fs from "fs";
import pg from "pg";

let connectionString = process.env.DATABASE_URL || "";
if (!connectionString && fs.existsSync(".env")) {
  const envText = fs.readFileSync(".env", "utf8");
  const m = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
  if (m) connectionString = m[1];
}
if (connectionString.includes("@postgres:5432") && !fs.existsSync("/.dockerenv")) {
  connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
}

async function cleanup() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — TEMPORARY TEST SESSION PURGE & AUDIT");
  console.log("================================================================================");

  const pool = new pg.Pool({ connectionString });

  try {
    const prefixes = [
      "coord-test-%",
      "student-test-%",
      "advisor-test-%",
      "admin-debug-%",
      "adv-check-%",
      "perm-verify-%",
      "canva-test-%",
      "debug-session-%",
      "screenshot-session-%",
      "test-session-%",
    ];

    const findQuery = `
      SELECT id, user_id, created_at, expires_at 
      FROM public.sessions 
      WHERE ${prefixes.map((_, i) => `id LIKE $${i + 1}`).join(" OR ")}
    `;

    const found = await pool.query(findQuery, prefixes);
    console.log(`Found ${found.rows.length} confirmed temporary test sessions in public.sessions:`);
    for (const r of found.rows) {
      console.log(` - ID: ${r.id} (User: ${r.user_id})`);
    }

    if (found.rows.length > 0) {
      const deleteQuery = `
        DELETE FROM public.sessions 
        WHERE ${prefixes.map((_, i) => `id LIKE $${i + 1}`).join(" OR ")}
      `;
      const delRes = await pool.query(deleteQuery, prefixes);
      console.log(`\nSuccessfully deleted ${delRes.rowCount} temporary test sessions.`);
    } else {
      console.log("\nZero temporary test sessions remaining in database.");
    }

    const totalSessions = await pool.query(`SELECT count(*) FROM public.sessions`);
    console.log(`Total remaining genuine sessions: ${totalSessions.rows[0].count}`);
  } finally {
    await pool.end();
  }
}

cleanup().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
