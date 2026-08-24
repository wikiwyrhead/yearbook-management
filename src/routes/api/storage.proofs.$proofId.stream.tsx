import { createFileRoute } from "@tanstack/react-router";
import { handleProofStreamRequest } from "@/lib/storage/proof-streaming.server";

export const Route = createFileRoute("/api/storage/proofs/$proofId/stream")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params?: { proofId?: string } }) => {
        try {
          const url = new URL(request.url);
          // Match /api/storage/proofs/:proofId/stream
          const match = url.pathname.match(/\/api\/storage\/proofs\/([^/]+)\/stream/);
          const proofId = params?.proofId || (match ? match[1] : "");
          if (!proofId) {
            return new Response(JSON.stringify({ error: "Missing proof ID" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
          return await handleProofStreamRequest(proofId, request);
        } catch (err: any) {
          console.error("[ProofStreamRoute] Error:", err);
          return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
