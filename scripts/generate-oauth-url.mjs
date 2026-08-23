import { generateOAuthState } from "../src/lib/storage/oauth-state.server.ts";
import fs from "fs";

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

const state = generateOAuthState({
  provider: "google_drive",
  scope: "center",
  userId: "22222222-2222-2222-2222-222222222222",
  centerId: "3f7ff3c9-0560-43a0-8de0-edeb9914e176",
  yearbookId: "f40b6896-9a90-4a14-ac4a-f9e204002716",
});

const clientId = process.env["GOOGLE_CLIENT_ID"];
const redirectUri = "http://localhost:8088/api/public/auth/callback";

const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
url.searchParams.set("response_type", "code");
url.searchParams.set("client_id", clientId);
url.searchParams.set("state", state);
url.searchParams.set("redirect_uri", redirectUri);
url.searchParams.set("access_type", "offline");
url.searchParams.set("prompt", "consent");
url.searchParams.set(
  "scope",
  [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.file",
  ].join(" "),
);

console.log("Localhost OAuth URL generated successfully.");

const tunnelRedirectUri = "https://milestone-portal.arnelbg.com/api/public/auth/callback";
const urlTunnel = new URL("https://accounts.google.com/o/oauth2/v2/auth");
urlTunnel.searchParams.set("response_type", "code");
urlTunnel.searchParams.set("client_id", clientId);
urlTunnel.searchParams.set("state", state);
urlTunnel.searchParams.set("redirect_uri", tunnelRedirectUri);
urlTunnel.searchParams.set("access_type", "offline");
urlTunnel.searchParams.set("prompt", "consent");
urlTunnel.searchParams.set(
  "scope",
  [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.file",
  ].join(" "),
);

console.log("Tunnel OAuth URL generated successfully.");
