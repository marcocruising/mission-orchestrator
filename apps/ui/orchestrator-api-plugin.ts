import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Plugin } from "vite";

const uiDir = dirname(fileURLToPath(import.meta.url));
const root = join(uiDir, "../..");
const handlersPath = join(root, "apps/orchestrator/dist/api-handlers.js");

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

/** Dev-only: run orchestrator ticks from the UI without a separate API process. */
export function orchestratorApiPlugin(): Plugin {
  return {
    name: "orchestrator-api",
    configureServer(server) {
      config({ path: join(root, ".env") });

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/")) return next();

        try {
          const { handleApi } = await import(pathToFileURL(handlersPath).href);
          const body = req.method === "POST" ? await readBody(req) : undefined;
          const { status, body: payload } = await handleApi(req.method ?? "GET", url, body);
          sendJson(res, status, payload);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[orchestrator-api]", message);
          sendJson(res, 500, { error: message });
        }
      });
    },
  };
}
