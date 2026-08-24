// scripts/test-db-guard.mjs
import http from "node:http";
import https from "node:https";

/**
 * Validates that TEST_DATABASE_URL is provided, points strictly to yearbook_disposable_test_db,
 * and sets process.env.DATABASE_URL so downstream application modules connect to the test database.
 */
export function enforceTestDatabaseEnv() {
  let testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl && process.env.DATABASE_URL && process.env.DATABASE_URL.includes("/yearbook_db")) {
    testUrl = process.env.DATABASE_URL.replace("/yearbook_db", "/yearbook_disposable_test_db");
    process.env.TEST_DATABASE_URL = testUrl;
  }

  if (!testUrl || testUrl.trim() === "") {
    console.error("FATAL: TEST_DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  let normalized = testUrl;
  if (normalized.includes("@postgres:5432")) {
    normalized = normalized.replace("@postgres:5432", "@localhost:5432");
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (err) {
    console.error("FATAL: TEST_DATABASE_URL is not a valid URL:", err.message);
    process.exit(1);
  }

  const dbName = parsed.pathname.replace(/^\//, "");
  const host = parsed.hostname;

  if (dbName !== "yearbook_disposable_test_db") {
    console.error(`REFUSED: Database name '${dbName}' is not 'yearbook_disposable_test_db'.`);
    process.exit(1);
  }

  if (host !== "localhost" && host !== "127.0.0.1" && host !== "postgres") {
    console.error(`REFUSED: Host '${host}' is not a local test database host.`);
    process.exit(1);
  }

  if (["yearbook_db", "postgres", "template0", "template1"].includes(dbName)) {
    console.error(`REFUSED: Target database '${dbName}' is protected.`);
    process.exit(1);
  }

  // Set process.env.DATABASE_URL for application pool
  process.env.DATABASE_URL = testUrl;
}

/**
 * Installs a central fail-closed network interceptor when ENABLE_EXTERNAL_MOCK_PROVIDERS is active.
 * Any outbound network request to external hosts (Canva, Google Drive, Box, external mail APIs) fails the test.
 */
export function installFailClosedNetworkGuard() {
  if (process.env.ENABLE_EXTERNAL_MOCK_PROVIDERS !== "true") {
    return;
  }

  const isLocalHost = (host) => {
    if (!host) return true;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.startsWith("127.") ||
      host === "postgres"
    );
  };

  // Intercept global fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (input, init) {
    let urlStr =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    try {
      const u = new URL(urlStr);
      if (!isLocalHost(u.hostname)) {
        const errMsg = `FATAL: Fail-closed guard blocked outbound network call to external host '${u.hostname}' during test execution.`;
        console.error(errMsg);
        throw new Error(errMsg);
      }
    } catch (e) {
      if (e.message.startsWith("FATAL: Fail-closed guard blocked")) {
        throw e;
      }
    }
    return originalFetch.call(this, input, init);
  };

  // Intercept http.request
  const origHttpRequest = http.request;
  http.request = function (options, callback) {
    const host =
      typeof options === "string" ? new URL(options).hostname : options.host || options.hostname;
    if (!isLocalHost(host)) {
      const errMsg = `FATAL: Fail-closed guard blocked outbound HTTP call to external host '${host}' during test execution.`;
      console.error(errMsg);
      throw new Error(errMsg);
    }
    return origHttpRequest.call(this, options, callback);
  };

  // Intercept https.request
  const origHttpsRequest = https.request;
  https.request = function (options, callback) {
    const host =
      typeof options === "string" ? new URL(options).hostname : options.host || options.hostname;
    if (!isLocalHost(host)) {
      const errMsg = `FATAL: Fail-closed guard blocked outbound HTTPS call to external host '${host}' during test execution.`;
      console.error(errMsg);
      throw new Error(errMsg);
    }
    return origHttpsRequest.call(this, options, callback);
  };
}
