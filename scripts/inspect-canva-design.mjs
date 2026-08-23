import fs from "fs";
import { resolveUserDesignRef } from "../src/lib/design/canva.server.ts";
import { canvaFetch } from "../src/lib/design/canva.provider.ts";

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

async function inspectDesign() {
  const userId = "11111111-1111-1111-1111-111111111111";
  const ref = await resolveUserDesignRef(userId);
  const designId = "DAHTA7_kXWI";

  const res = await canvaFetch(ref, `/designs/${designId}`);
  const json = await res.json();
  console.log("Canva Design Response for DAHTA7_kXWI:");
  console.log(JSON.stringify(json, null, 2));
}

inspectDesign().catch(console.error);
