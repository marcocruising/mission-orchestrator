#!/usr/bin/env node
import "../../../scripts/load-env.mjs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { handleApi } from "./api-handlers.js";

const PORT = Number(process.env.ORCHESTRATOR_DEV_PORT ?? 8787);

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  try {
    const body = req.method === "POST" ? await readJson(req) : undefined;
    const { status, body: payload } = await handleApi(req.method ?? "GET", url.pathname, body);
    send(res, status, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send(res, 500, { error: message });
  }
}

createServer((req, res) => {
  handler(req, res).catch((err) => {
    console.error(err);
    send(res, 500, { error: "Internal server error" });
  });
}).listen(PORT, () => {
  console.log(`Orchestrator dev API → http://localhost:${PORT}`);
});
