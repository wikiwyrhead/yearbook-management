// scripts/precommit-secret-scan.mjs
// Pre-commit security and privacy scanner for Milestone Yearbook repository.
// Scans tracked modifications and untracked files, enforcing AGENTS.md rules with redacted output.

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function redactValue(val) {
  if (!val || val.length <= 4) return "****";
  return val.slice(0, 2) + "****" + val.slice(-2);
}

async function getCandidateFiles() {
  const { stdout } = await execFileAsync("git", ["status", "--short"]);
  const lines = stdout.trim().split("\n").filter(Boolean);
  const files = [];

  for (const line of lines) {
    const rawPath = line.slice(3).trim();
    // Handle renamed files "old -> new"
    const filePath = rawPath.includes("->") ? rawPath.split("->")[1].trim() : rawPath;
    if (filePath && !filePath.startsWith(".git") && !filePath.startsWith("node_modules")) {
      files.push(filePath);
    }
  }

  // Include only our new test & verification scripts
  const relevantScripts = [
    "scripts/setup-test-db.mjs",
    "scripts/test-db-guard.mjs",
    "scripts/register-test-network-guard.mjs",
    "scripts/audit-schema-parity.mjs",
    "scripts/test-historical-proof-migration.mjs",
    "scripts/test-concurrent-proof-creation.mjs",
    "scripts/test-browser-drawer-interactions.mjs",
    "scripts/test-milestone-full-workflow-uat.mjs",
    "scripts/test-migration-idempotency.mjs",
    "scripts/test-roles-domain.mjs",
    "scripts/run-all-tests.mjs",
    "scripts/precommit-secret-scan.mjs",
  ];
  for (const sf of relevantScripts) {
    if (!files.includes(sf)) files.push(sf);
  }

  return Array.from(new Set(files));
}

export async function runSecretScan() {
  console.log("================================================================================");
  console.log("  PRE-COMMIT PRIVACY & SECRET SCAN (AGENTS.md Compliance)");
  console.log("================================================================================\n");

  const files = await getCandidateFiles();
  const findings = [];

  // Scanning rules
  const rules = [
    {
      name: "Absolute user home path",
      regex: /\/home\/[a-zA-Z0-9_-]+\//g,
      severity: "CRITICAL",
    },
    {
      name: "Personal Cloudflare tunnel domain",
      regex: /https?:\/\/[a-zA-Z0-9_-]+\.trycloudflare\.com/g,
      severity: "CRITICAL",
    },
    {
      name: "Hardcoded postgres password in connection string",
      regex: /postgresql:\/\/[^:]+:([^@]+)@/g,
      severity: "HIGH",
      filter: (match, p1) =>
        p1 !== "****" && p1 !== "postgres" && p1 !== "<YOUR_POSTGRES_PASSWORD>",
    },
    {
      name: "Sequential AES test key",
      regex: new RegExp("0123456789" + "abcdef0123456789abcdef", "gi"),
      severity: "CRITICAL",
    },
    {
      name: "Personal email address",
      regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      severity: "MEDIUM",
      filter: (match) => {
        const lower = match.toLowerCase();
        return (
          !lower.endsWith("@test.yearbook") &&
          !lower.endsWith("example.com") &&
          !lower.endsWith(".example.com") &&
          !lower.endsWith("milestone.local") &&
          !lower.endsWith("googleapis.com") &&
          !lower.endsWith("postgres") &&
          !lower.endsWith("github.com")
        );
      },
    },
  ];

  for (const relPath of files) {
    try {
      const stats = await fs.stat(relPath);
      if (!stats.isFile()) continue;

      const content = await fs.readFile(relPath, "utf8");
      const lines = content.split("\n");

      for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
        const lineText = lines[lineNum - 1];

        for (const rule of rules) {
          rule.regex.lastIndex = 0;
          let match;
          while ((match = rule.regex.exec(lineText)) !== null) {
            const matchedValue = match[0];
            if (rule.filter && !rule.filter(matchedValue, match[1])) {
              continue;
            }

            findings.push({
              file: relPath,
              line: lineNum,
              rule: rule.name,
              severity: rule.severity,
              snippet: lineText
                .replace(matchedValue, `[REDACTED:${redactValue(matchedValue)}]`)
                .trim(),
            });
          }
        }
      }
    } catch {
      // Ignore deleted or unreadable files
    }
  }

  console.log(`Scanned ${files.length} candidate files.`);
  if (findings.length === 0) {
    console.log("✓ Zero secrets, tunnel endpoints, or personal paths detected.");
    console.log(
      "\n================================================================================",
    );
    console.log("  PRE-COMMIT SCAN: 100% CLEAN (READY TO COMMIT)");
    console.log(
      "================================================================================\n",
    );
    return { success: true, findings: [] };
  } else {
    console.log(`⚠️ Found ${findings.length} potential compliance findings:\n`);
    for (const f of findings) {
      console.log(`  [${f.severity}] ${f.file}:${f.line} - ${f.rule}`);
      console.log(`    ${f.snippet}`);
    }
    return { success: false, findings };
  }
}

if (process.argv[1]?.endsWith("precommit-secret-scan.mjs")) {
  runSecretScan()
    .then(({ success }) => process.exit(success ? 0 : 1))
    .catch((err) => {
      console.error("Secret scan failed:", err);
      process.exit(1);
    });
}
