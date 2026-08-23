import crypto from "crypto";
import fs from "fs";
import pg from "pg";

const { Client } = pg;

async function rotateDbPassword() {
  const newDbPass = "yb_pg_" + crypto.randomBytes(16).toString("hex");

  let currentPass = "";
  if (fs.existsSync(".env")) {
    const envText = fs.readFileSync(".env", "utf8");
    const m = envText.match(/POSTGRES_PASSWORD="?([^"\n]+)"?/);
    if (m) currentPass = m[1];
  }
  if (!currentPass && process.env.POSTGRES_PASSWORD) {
    currentPass = process.env.POSTGRES_PASSWORD;
  }
  if (!currentPass) {
    throw new Error(
      "POSTGRES_PASSWORD must be set in .env or environment before running rotate-db-password."
    );
  }

  try {
    const client = new Client({
      connectionString: `postgresql://yearbook_user:${currentPass}@localhost:5432/yearbook_db`,
    });
    await client.connect();
    await client.query(`ALTER USER yearbook_user WITH PASSWORD '${newDbPass}';`);
    await client.end();
    console.log("PostgreSQL user password altered successfully in database.");
  } catch (e) {
    throw new Error(
      `Failed to connect with current POSTGRES_PASSWORD to rotate credentials: ${e.message}`
    );
  }

  // Update .env
  let envContent = fs.readFileSync(".env", "utf8");
  envContent = envContent.replace(
    /POSTGRES_PASSWORD="?[^"\n]+"?/,
    `POSTGRES_PASSWORD="${newDbPass}"`,
  );
  envContent = envContent.replace(
    /DATABASE_URL="?postgresql:\/\/([^:]+):[^@]+@([^"\n]+)"?/,
    `DATABASE_URL="postgresql://$1:${newDbPass}@$2"`,
  );
  fs.writeFileSync(".env", envContent);
  console.log(".env successfully updated with rotated database password.");
}

rotateDbPassword().catch(console.error);
