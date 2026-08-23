import { createFileRoute } from "@tanstack/react-router";
import { handleProofStreamRequest } from "@/lib/storage/proof-streaming.server";

export const Route = createFileRoute("/api/storage/proofs/$proofId/stream")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { proofId: string } }) => {
        return await handleProofStreamRequest(params.proofId, request);
      },
    },
  },
});
