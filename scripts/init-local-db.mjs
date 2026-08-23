import { seedDemoData } from "./seed-demo-data.mjs";

seedDemoData().catch((err) => {
  console.error("[Init DB Error]:", err);
  process.exit(1);
});
