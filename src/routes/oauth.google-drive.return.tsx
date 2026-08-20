import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/oauth/google-drive/return")({
  component: OAuthReturn,
  head: () => ({
    meta: [
      { title: "Finishing Google Drive connection — Milestone" },
      {
        name: "description",
        content: "Completing the Google Drive authorization for your Milestone account.",
      },
      { property: "og:title", content: "Finishing Google Drive connection — Milestone" },
      {
        property: "og:description",
        content: "Completing the Google Drive authorization for your Milestone account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const CONNECTOR_ID = "google_drive";

/**
 * Connector-gateway redirect landing page (opened in a popup).
 *
 * It only forwards the one-time `code` to the opener; the opener calls the
 * authenticated server function that exchanges it for the connection key.
 * The connection key never reaches the browser.
 */
function OAuthReturn() {
  const [message, setMessage] = useState("Finishing connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notify = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
      code?: string,
    ) => {
      window.opener?.postMessage(
        { type, connectorId: CONNECTOR_ID, code: code ?? null },
        window.location.origin,
      );
      window.close();
    };

    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "Authorization did not complete.");
      notify("appUserConnectorOAuthFailed");
      return;
    }

    const code = params.get("code");
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notify("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("Authorization completed without an exchange code.");
      notify("appUserConnectorOAuthFailed");
      return;
    }

    notify("appUserConnectorOAuthComplete", code);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
