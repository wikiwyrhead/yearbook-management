import fs from "fs";
import pg from "pg";

const envFile = fs.readFileSync(".env", "utf8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

let connStr = (process.env.DATABASE_URL || "").replace("@postgres:5432", "@localhost:5432");
const pool = new pg.Pool({ connectionString: connStr });

async function cleanupTestArtifacts() {
  console.log("=== Optional Cleanup: Purging Canva Test Artifacts ===");
  const yearbookId = "f40b6896-9a90-4a14-ac4a-f9e204002716";

  // 1. Delete test corrections
  const delCorr = await pool.query(
    `DELETE FROM public.corrections WHERE yearbook_id = $1 AND title = 'Check font size'`,
    [yearbookId],
  );
  console.log(`✓ Deleted ${delCorr.rowCount} test correction(s).`);

  // 2. Delete test proofs created from Canva export
  const delProofs = await pool.query(
    `DELETE FROM public.proofs WHERE yearbook_id = $1 AND canva_export_id IS NOT NULL`,
    [yearbookId],
  );
  console.log(`✓ Deleted ${delProofs.rowCount} test proof record(s).`);

  // 3. Reset Canva link on page
  const resetPage = await pool.query(
    `UPDATE public.pages SET canva_design_id = null, canva_design_url = null, canva_synced_at = null WHERE yearbook_id = $1 AND canva_design_id IS NOT NULL`,
    [yearbookId],
  );
  console.log(`✓ Reset Canva links on ${resetPage.rowCount} page(s).`);

  // 4. Delete linked canva_designs records
  const delDesigns = await pool.query(`DELETE FROM public.canva_designs WHERE yearbook_id = $1`, [
    yearbookId,
  ]);
  console.log(`✓ Deleted ${delDesigns.rowCount} test canva_designs record(s).`);

  await pool.end();
  console.log("\n[COMPLETE] All local database test artifacts cleaned up successfully.");
}

cleanupTestArtifacts().catch(console.error);
