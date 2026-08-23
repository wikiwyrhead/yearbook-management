import crypto from "crypto";
import fs from "fs";
import path from "path";
import pg from "pg";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const { Client } = pg;

function generatePassword() {
  return "Mb8!" + crypto.randomBytes(12).toString("hex") + "$Z1";
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

const accounts = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    email: "admin@test.yearbook",
    role: "super_admin",
    name: "System Admin (LocalDev)",
    scope: "Global Administration",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "coordinator@test.yearbook",
    role: "coordinator",
    name: "Elena Rostova (Coordinator)",
    scope: "School A (Demo High School)",
  },
  {
    id: "88888888-8888-8888-8888-888888888888",
    email: "teacher@test.yearbook",
    role: "advisor",
    name: "Dr. Arthur Harrison (Faculty Advisor)",
    scope: "School A (Demo High School)",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    email: "member@test.yearbook",
    role: "editorial_member",
    name: "Marcus Vance (Student Editor)",
    scope: "School A (Demo High School)",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    email: "student@test.yearbook",
    role: "student_contributor",
    name: "Chloe Bennett (Student)",
    scope: "School A (Demo High School)",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    email: "coordinator-b@test.yearbook",
    role: "coordinator",
    name: "David Kim (School B Coordinator)",
    scope: "School B (RLS Isolation)",
  },
  {
    id: "66666666-6666-6666-6666-666666666666",
    email: "member-b@test.yearbook",
    role: "editorial_member",
    name: "Sarah Jenkins (School B Student Editor)",
    scope: "School B (RLS Isolation)",
  },
  {
    id: "77777777-7777-7777-7777-777777777777",
    email: "student-b@test.yearbook",
    role: "student_contributor",
    name: "Toby Ziegler (School B Student)",
    scope: "School B (RLS Isolation)",
  },
];

async function updatePasswords() {
  const envFile = fs.readFileSync(".env", "utf8");
  let connStr = envFile
    .match(/DATABASE_URL="?([^"\n]+)"?/)[1]
    .replace("@postgres:5432", "@localhost:5432");
  const client = new Client({ connectionString: connStr });
  await client.connect();

  let markdownContent = `# Milestone Yearbook — LocalDev Test Accounts\n\n> [!IMPORTANT]\n> These credentials are generated strictly for LocalDev testing on \`http://yearbook-manager.test\`.\n> This file is excluded from Git via \`.gitignore\`.\n\n| Email | Role | Name | LocalDev Password | Assigned Scope |\n|---|---|---|---|---|\n`;

  const seedAccountsArray = [];

  for (const acc of accounts) {
    const newPass = generatePassword();
    const pHash = await hashPassword(newPass);

    await client.query("UPDATE public.users SET password_hash = $1 WHERE email = $2", [
      pHash,
      acc.email,
    ]);

    markdownContent += `| \`${acc.email}\` | \`${acc.role}\` | ${acc.name} | \`${newPass}\` | ${acc.scope} |\n`;
    seedAccountsArray.push({
      id: acc.id,
      email: acc.email,
      pass: newPass,
      name: acc.name,
      role: acc.role,
    });
  }

  markdownContent += `\n---\n\n## Testing Matrix & Roles\n\n- **\`admin@test.yearbook\`**: Global Super Admin with system-wide access to all schools, yearbooks, audit logs, and settings.\n- **\`coordinator@test.yearbook\`**: School A Coordinator with full management rights over Demo High School 2026 Yearbook (\`Legacy & Horizons\`).\n- **\`member@test.yearbook\`**: Staff Designer with access to page assignments and section designs in School A.\n- **\`student@test.yearbook\`**: Student Contributor with access to submit photos and view assigned spreads in School A.\n- **\`coordinator-b@test.yearbook\`**: School B Coordinator isolated from School A (cross-tenant security validation).\n- **\`member-b@test.yearbook\`**: Staff Designer isolated to School B.\n- **\`student-b@test.yearbook\`**: Student Contributor isolated to School B.\n`;

  fs.writeFileSync(".localdev/test-accounts.md", markdownContent);

  const accountsMap = {};
  for (const a of seedAccountsArray) {
    accountsMap[a.email] = {
      id: a.id,
      email: a.email,
      role: a.role,
      name: a.name,
      password: a.pass,
    };
  }
  fs.writeFileSync(".localdev/test-accounts.json", JSON.stringify(accountsMap, null, 2));

  await client.end();
  console.log(
    "Successfully regenerated all test account passwords and updated database + .localdev/test-accounts.md!",
  );
}

updatePasswords().catch(console.error);
