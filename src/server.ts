import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

const startHandler = createStartHandler(defaultStreamHandler);

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);

    // 1. Storage Upload Endpoint
    if (request.method === "POST" && url.pathname === "/api/storage/upload") {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const bucket = (formData.get("bucket") as string) || "yearbook_assets";
        const yearbookId = (formData.get("yearbookId") as string) || "general";
        const subfolder = (formData.get("subfolder") as string) || "";

        if (!file) {
          return new Response(JSON.stringify({ error: "No file provided" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const folderPart = subfolder ? `${subfolder.replace(/^\/+|\/+$/g, "")}/` : "";
        const storagePath = `yearbooks/${yearbookId}/${folderPart}${Date.now()}_${cleanName}`;

        const arrayBuffer = await file.arrayBuffer();
        const { localStorageProvider } = await import("./lib/storage/local.provider");
        await localStorageProvider.upload(bucket, storagePath, Buffer.from(arrayBuffer));

        return new Response(
          JSON.stringify({
            ok: true,
            storagePath,
            publicUrl: `/api/storage/${bucket}/${storagePath}`,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (err: any) {
        console.error("[Storage Upload Error]:", err);
        return new Response(JSON.stringify({ error: err.message || "Upload failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 2. Storage Streaming Endpoint for Local Provider
    if (url.pathname.startsWith("/api/storage/")) {
      const rawPath = url.pathname.replace(/^\/api\/storage\//, "");
      const slashIdx = rawPath.indexOf("/");
      if (slashIdx > 0) {
        const bucket = rawPath.substring(0, slashIdx);
        const filePath = rawPath.substring(slashIdx + 1);

        try {
          const { localStorageProvider } = await import("./lib/storage/local.provider");
          const buffer = await localStorageProvider.download(bucket, filePath);

          let contentType = "application/octet-stream";
          if (filePath.endsWith(".pdf")) contentType = "application/pdf";
          else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"))
            contentType = "image/jpeg";
          else if (filePath.endsWith(".png")) contentType = "image/png";
          else if (filePath.endsWith(".webp")) contentType = "image/webp";
          else if (filePath.endsWith(".svg")) contentType = "image/svg+xml";
          else if (filePath.endsWith(".json")) contentType = "application/json";

          return new Response(new Uint8Array(buffer), {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=3600",
              "Content-Length": buffer.length.toString(),
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      }
    }

    // 2. Application Route Handling
    try {
      const response = await startHandler(request);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
