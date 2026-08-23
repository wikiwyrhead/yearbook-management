import fs from "fs";
import pg from "pg";

let connectionString = process.env.DATABASE_URL || "";
if (!connectionString && fs.existsSync(".env")) {
  const envText = fs.readFileSync(".env", "utf8");
  for (const line of envText.split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
  const m = envText.match(/DATABASE_URL="?([^"\n]+)"?/);
  if (m) connectionString = m[1];
}
if (connectionString.includes("@postgres:5432") && !fs.existsSync("/.dockerenv")) {
  connectionString = connectionString.replace("@postgres:5432", "@localhost:5432");
}

async function auditSessions() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — DEEP SESSION AUDIT & AGGREGATE ANALYSIS");
  console.log("================================================================================");

  const pool = new pg.Pool({ connectionString });

  try {
    // 1. Expired vs Active
    const expRes = await pool.query(`
      SELECT 
        CASE WHEN expires_at < now() THEN 'expired' ELSE 'active' END AS status,
        COUNT(*) AS count
      FROM public.sessions
      GROUP BY 1
    `);
    console.log("\n--- 1. Expired vs Active Sessions ---");
    console.table(expRes.rows);

    // 2. Grouped by User Email / ID
    const userRes = await pool.query(`
      SELECT 
        COALESCE(u.email, 'ORPHANED / UNKNOWN') AS user_email,
        s.user_id,
        COUNT(*) AS session_count,
        COUNT(CASE WHEN s.expires_at >= now() THEN 1 END) AS active_count,
        COUNT(CASE WHEN s.expires_at < now() THEN 1 END) AS expired_count
      FROM public.sessions s
      LEFT JOIN public.users u ON u.id = s.user_id
      GROUP BY u.email, s.user_id
      ORDER BY session_count DESC
    `);
    console.log("\n--- 2. Sessions Grouped by User ---");
    console.table(userRes.rows);

    // 3. Grouped by Creation Date
    const dateRes = await pool.query(`
      SELECT 
        date_trunc('day', created_at)::date AS creation_date,
        COUNT(*) AS total_created,
        COUNT(CASE WHEN expires_at >= now() THEN 1 END) AS active_count
      FROM public.sessions
      GROUP BY 1
      ORDER BY creation_date DESC
    `);
    console.log("\n--- 3. Sessions Grouped by Creation Date ---");
    console.table(dateRes.rows);

    // 4. Recognized Test Prefix vs Standard UUID
    const prefixRes = await pool.query(`
      SELECT 
        CASE 
          WHEN id LIKE 'test-session-%' THEN 'test-session-*'
          WHEN id LIKE 'screenshot-session-%' THEN 'screenshot-session-*'
          WHEN id LIKE 'perm-verify-%' THEN 'perm-verify-*'
          WHEN id LIKE 'canva-test-%' THEN 'canva-test-*'
          WHEN id LIKE 'debug-session-%' THEN 'debug-session-*'
          WHEN id LIKE 'coord-test-%' THEN 'coord-test-*'
          WHEN id LIKE 'admin-debug-%' THEN 'admin-debug-*'
          WHEN id LIKE 'adv-check-%' THEN 'adv-check-*'
          WHEN id LIKE 'student-test-%' THEN 'student-test-*'
          WHEN id LIKE 'advisor-test-%' THEN 'advisor-test-*'
          WHEN id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'Standard UUID Session'
          ELSE 'Other Non-Standard Session'
        END AS session_pattern,
        COUNT(*) AS count,
        COUNT(CASE WHEN expires_at >= now() THEN 1 END) AS active_count,
        COUNT(CASE WHEN expires_at < now() THEN 1 END) AS expired_count
      FROM public.sessions
      GROUP BY 1
      ORDER BY count DESC
    `);
    console.log("\n--- 4. Sessions Grouped by Pattern / Prefix ---");
    console.table(prefixRes.rows);

    // 5. Sessions with Missing Users (Orphaned)
    const orphanRes = await pool.query(`
      SELECT COUNT(*) AS orphaned_sessions_count
      FROM public.sessions s
      LEFT JOIN public.users u ON u.id = s.user_id
      WHERE u.id IS NULL
    `);
    console.log("\n--- 5. Orphaned Sessions (Missing User Reference) ---");
    console.table(orphanRes.rows);

    // 6. Delete Expired Sessions and Confirmed Test Sessions
    console.log("\n--- 6. Deleting Expired Sessions & Automated Test Prefixes ---");
    const testPrefixes = [
      'test-session-%',
      'screenshot-session-%',
      'perm-verify-%',
      'canva-test-%',
      'debug-session-%',
      'coord-test-%',
      'admin-debug-%',
      'adv-check-%',
      'student-test-%',
      'advisor-test-%'
    ];

    const delExpired = await pool.query(`DELETE FROM public.sessions WHERE expires_at < now()`);
    console.log(`Deleted ${delExpired.rowCount} expired sessions.`);

    const delTest = await pool.query(
      `DELETE FROM public.sessions WHERE ${testPrefixes.map((_, i) => `id LIKE $${i + 1}`).join(' OR ')}`,
      testPrefixes
    );
    console.log(`Deleted ${delTest.rowCount} confirmed automated test sessions.`);

    // 7. Post-Cleanup Summary
    const finalSummary = await pool.query(`
      SELECT 
        COALESCE(u.email, 'ORPHANED') AS user_email,
        COUNT(*) AS active_sessions
      FROM public.sessions s
      LEFT JOIN public.users u ON u.id = s.user_id
      GROUP BY u.email
      ORDER BY active_sessions DESC
    `);
    console.log("\n--- 7. Final Active Sessions After Cleanup ---");
    console.table(finalSummary.rows);

  } finally {
    await pool.end();
  }
}

auditSessions().catch((err) => {
  console.error("Session audit error:", err);
  process.exit(1);
});
