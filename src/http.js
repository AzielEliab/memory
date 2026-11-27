/**
 * Local HTTP API for AKM-TRIAD-1.0.
 * Binds to loopback unless the caller passes another host.
 * This server is not a hosted FragGate door.
 * Author: Aziel Eliab. SPDX-License-Identifier: Apache-2.0
 */

import { createServer } from "node:http";
import { refuse } from "./memory.js";

const MAX_BODY = 64 * 1024;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, User-Agent, Authorization",
  };
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const err = new Error("body too large");
      err.code = "AKM-BODY";
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text);
}

export async function dispatchMemoryHttp(app, method, pathname, payload) {
  const m = String(method || "GET").toUpperCase();
  const path = String(pathname || "").split("?")[0].replace(/\/+$/, "") || "/";
  const postOps = {
    "/v1/memory/observe": "observe",
    "/v1/memory/resolve": "resolve",
    "/v1/memory/calibrate": "calibrate",
    "/v1/memory/recall": "recall",
    "/v1/memory/rebuild-index": "rebuild-index",
    "/v1/memory/delete": "delete_history",
    "/v1/memory/update": "rewrite",
    "/v1/memory/rewrite": "rewrite",
    "/v1/memory/rollback": "rollback",
    "/v1/memory/model_update": "model_update",
  };
  if (postOps[path]) {
    if (m !== "POST") return { status: 405, body: refuse("AKM-METHOD", `POST ${path}.`) };
    const body = await app.run(postOps[path], payload || {});
    return { status: body.ok === false ? 400 : 200, body };
  }
  const getMatch = path.match(/^\/v1\/memory\/([^/]+)(?:\/(history|calibration))?$/);
  if (getMatch && (m === "GET" || m === "HEAD")) {
    const view = getMatch[2] || "get";
    await app.ensureIndex();
    const body = app.explain(decodeURIComponent(getMatch[1]), view);
    return { status: body.ok === false ? 404 : 200, body };
  }
  if (path === "/v1/memory" && (m === "GET" || m === "HEAD")) {
    return { status: 200, body: app.health() };
  }
  return {
    status: 404,
    body: refuse("AKM-NOT-FOUND", "Unknown memory path.", {
      hint: "POST /v1/memory/observe|resolve|calibrate|recall|rebuild-index  GET /v1/memory/{id}[/history|/calibration]  POST /v1/memory/delete|update|rewrite refuse AKM-STUB",
    }),
  };
}

export function startServer(app, options = {}) {
  const host = options.host || "127.0.0.1";
  const port = Number(options.port ?? 8788);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    try {
      let payload = {};
      if (req.method === "POST") payload = await readJson(req);
      const result = await dispatchMemoryHttp(app, req.method, url.pathname, payload);
      const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", ...corsHeaders() };
      if (req.method === "HEAD") {
        res.writeHead(result.status, headers);
        res.end();
        return;
      }
      res.writeHead(result.status, headers);
      res.end(JSON.stringify(result.body, null, 2));
    } catch (err) {
      const code = err && err.code === "AKM-BODY" ? "AKM-BODY" : "AKM-JSON";
      const message = code === "AKM-BODY" ? "Request body exceeds 64 KiB." : "Request body must be JSON.";
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() });
      res.end(JSON.stringify(refuse(code, message)));
    }
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        host,
        port: typeof address === "object" && address ? address.port : port,
        url: `http://${host}:${typeof address === "object" && address ? address.port : port}`,
      });
    });
  });
}
