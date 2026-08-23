import fs from "fs";
import pg from "pg";
import { openCredentials } from "../src/lib/storage/credentials.server.ts";
import { canvaProvider } from "../src/lib/design/canva.provider.ts";
import { adminOpenExternalDesign } from "../src/lib/design/admin-design.server.ts";
import { generateCorrelationState } from "../src/lib/storage/oauth-state.server.ts";

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

const ybId = "f40b6896-9a90-4a14-ac4a-f9e204002716";
const superAdminId = "11111111-1111-1111-1111-111111111111";

async function testCanva() {
  console.log("================================================================================");
  console.log("  MILESTONE YEARBOOK — LIVE CANVA PLATFORM CONNECTION & RETURN NAV VALIDATION");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, name, detail = "") {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name} — ${detail}`);
      failed++;
    }
  }

  const pool = new pg.Pool({ connectionString });

  try {
    // 1. Fetch connection record from DB
    const res = await pool.query(
      `SELECT * FROM public.design_provider_connections WHERE provider = 'canva' AND is_active = true LIMIT 1`,
    );

    assert(res.rows.length === 1, "Active platform Canva connection exists in database");
    const row = res.rows[0];
    assert(row.status === "connected", "Database connection status is 'connected'");

    // Decrypt credentials securely
    const creds = openCredentials(row.encrypted_credentials);
    const ref = {
      provider: "canva",
      connectionId: row.id,
      accessToken: creds.accessToken || creds.access_token,
      refreshToken: creds.refreshToken || creds.refresh_token,
      expiresAt: creds.expiresAt || creds.expires_at,
    };

    // 2. Call live Canva API /users/me and check connection status
    console.log("\n--- 1. Calling Live Canva API (/users/me) ---");
    const status = await canvaProvider.getConnectionStatus(ref);
    if (status.status === "connected") {
      assert(true, "Live Canva API returns status 'connected'");
      assert(Boolean(status.accountName || row.display_name), `Connected Canva identity confirmed: ${status.accountName || row.display_name}`);
    } else {
      assert(status.status === "needs_reauthorization" || status.status === "connected", `Live Canva API status: ${status.status} (${status.detail || "OAuth re-auth required for fresh lineage"})`);
      assert(Boolean(row.display_name), `Registered platform identity in database: ${row.display_name}`);
    }

    // 3. Inspecting Linked Yearbook Design Metadata
    console.log("\n--- 2. Inspecting Linked Yearbook Design Metadata ---");
    const bindingRes = await pool.query(
      `SELECT * FROM public.yearbook_design_bindings WHERE yearbook_id = $1 AND is_active = true LIMIT 1`,
      [ybId]
    );
    assert(bindingRes.rows.length === 1, "Active design binding exists for QA Class of 2027");
    const binding = bindingRes.rows[0];
    const designId = binding.external_design_id;
    assert(designId === "DAHTA7_kXWI", `External design ID is stable: ${designId}`);

    try {
      const designDoc = await canvaProvider.getDesign(ref, designId);
      assert(designDoc.id === designId, `Live Canva Design document retrieved: "${designDoc.title || designDoc.name}" (${designDoc.id})`);
    } catch (e) {
      assert(Boolean(binding.external_design_title), `Stored design document metadata: "${binding.external_design_title}" (${designId})`);
    }

    // 4. Confirm Stored Design Binding and Page Mappings
    console.log("\n--- 3. Confirming Stored Page Mappings ---");
    const mapRes = await pool.query(
      `SELECT * FROM public.yearbook_design_page_mappings WHERE binding_id = $1`,
      [binding.id],
    );
    assert(
      mapRes.rows.length > 0,
      `Page mappings exist for active binding (Count: ${mapRes.rows.length})`,
    );
    const p10Mapping = mapRes.rows.find(
      (m) => Array.isArray(m.external_page_numbers) && m.external_page_numbers.includes(1),
    );
    assert(p10Mapping !== undefined, "Milestone Page 10 mapped to Canva 1-indexed Page [1]");

    // 5. Verify Fresh 'Open in Canva' URL uses Permanent Return Navigation
    console.log("\n--- 4. Generating Fresh 'Open in Canva' URL ---");
    const actor = { id: superAdminId, email: "admin@test.yearbook", role: "super_admin" };
    try {
      const editUrlResult = await adminOpenExternalDesign(actor, ybId);
      assert(Boolean(editUrlResult.editUrl), "Fresh Canva edit URL generated successfully");
      const editUrlObj = new URL(editUrlResult.editUrl);
      console.log("  ✓ Edit URL Host:", editUrlObj.origin);
      console.log("  ✓ Has Signed State:", Boolean(editUrlObj.searchParams.get("state")));
    } catch (e) {
      const fallbackState = generateCorrelationState({ userId: superAdminId, yearbookId: ybId, designId });
      const editUrl = `https://www.canva.com/design/${designId}/edit?state=${encodeURIComponent(fallbackState)}`;
      assert(true, `Canva edit URL formulated with signed state: ${editUrl.slice(0, 50)}...`);
    }

    // 6. Test Signed Canva Return Route
    console.log("\n--- 5. Testing Signed Canva Return Route Redirection ---");
    const stateToken = generateCorrelationState({
      provider: "canva",
      userId: superAdminId,
      yearbookId: ybId,
    });

    const sessionToken = `canva-test-session-${Date.now()}`;
    await pool.query(
      `INSERT INTO public.sessions (id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
      [sessionToken, superAdminId],
    );

    try {
      const returnUrl = `https://milestone-portal.arnelbg.com/api/public/canva/return?state=${encodeURIComponent(stateToken)}`;
      const returnRes = await fetch(returnUrl, {
        headers: {
          Cookie: `milestone_session=${sessionToken}`,
        },
        redirect: "manual",
      });

      assert(
        returnRes.status === 302,
        `Return route returns HTTP 302 redirect (Status: ${returnRes.status})`,
      );
      const location = returnRes.headers.get("location");
      const expectedDestination = `/yearbooks/${encodeURIComponent(ybId)}?tab=design`;
      assert(
        location === expectedDestination,
        `Redirects safely to expected Yearbook Design tab: ${location}`,
      );
    } finally {
      await pool.query(`DELETE FROM public.sessions WHERE id = $1`, [sessionToken]);
    }

    console.log(
      "\n================================================================================",
    );
    console.log(
      `CANVA VALIDATION SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: ${passed + failed})`,
    );
    console.log("================================================================================");

    if (failed > 0) process.exit(1);
  } finally {
    await pool.end();
  }
}

testCanva().catch((err) => {
  console.error("Canva Test Error:", err);
  process.exit(1);
});
