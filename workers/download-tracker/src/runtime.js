/**
 * memory download-tracker read surface.
 * /v1 and /mcp do not increment DOWNLOADS. GET never enables mesh.
 * This Worker does not run AKM writes and it is not a second FragGate door.
 * Author: Aziel Eliab only. SPDX-License-Identifier: Apache-2.0
 */
import { classifyV1Path, doorTargetUrl } from "./door.js";

const PRODUCT = "memory";
const NAME = "Adaptive Knowledge Memory";
const VERSION = "0.1.0";
const SPEC = "AKM-TRIAD-1.0";
const AUTHOR = "Aziel Eliab";
const HOST = "https://memory-download-tracker.vibelock.workers.dev";
const GITHUB = "https://github.com/AzielEliab/memory";
const CATALOG_MCP = "https://aziel-runtime.vibelock.workers.dev/mcp";
const FRAGGATE_CALL = "https://aziel-runtime.vibelock.workers.dev/v1/fraggate/call";
const MOTTO =
  "Append-only ChainLock learn ledger. Derived Belief List. 3-of-4 triad. Posterior is calibrated belief, not truth.";
const LIMITATION =
  "memory 0.1.0 is AKM-TRIAD-1.0 extracted as a local library, CLI, and loopback HTTP server. The learn ledger is hash-chained and append-only. Verify fails closed on a chain break. The Belief List is rebuilt from that ledger. Rewrite, delete, rollback, and automatic model update stay refused (AKM-STUB). The Beta-Bernoulli posterior is calibrated belief, not truth: belief_is_not_truth is true and authorizes_action is false. software_tab is false. This Worker counts downloads and serves the source archive. It does not execute observe, resolve, or calibrate. Hosted FragGate on aziel-runtime remains the fabric door. Dual lattice and TemporalLock receipts stay SLOT in the standalone. Hosted ChainLock Durable Objects are not this JSONL file. GET never enables mesh. Author: Aziel Eliab only. Apache-2.0. Forks are always allowed.";

const READ_OPS = ["health", "skill", "doctor", "limitation", "describe"];
const DOOR_NOTE =
  "This Worker serves the counted source archive and read-only status. It does not append to the learn ledger. Local memory runs with node src/cli.js serve. GET never enables mesh. /v1 and /mcp do not increment.";

const SKILL = `---
name: memory
description: >-
  AKM-TRIAD-1.0 append-only learn ledger, derived Belief List, and 3-of-4 triad.
  Posterior is calibrated belief, not truth. Author Aziel Eliab.
---

# memory

${MOTTO}

Author: **Aziel Eliab**. Identity is Aziel Eliab only.
Version: ${VERSION}
Spec: ${SPEC}
GitHub: ${GITHUB}
Download tracker: ${HOST}/download
Stats: ${HOST}/stats
Archive: memory-0.1.0.tar.gz (built from this repository; package.json ${VERSION})

${DOOR_NOTE}

Always send \`User-Agent: Mozilla/5.0\`.

## This Worker

| Method | Path | What |
|--------|------|------|
| GET | \`/download\` | Counted gzip of memory-0.1.0.tar.gz. HTTP 200. |
| GET | \`/stats\` | Full counter JSON. Does not increment. |
| GET | \`/count\` | Compact counter JSON. Does not increment. |
| GET | \`/v1/health\` | Tracker liveness. Does not increment. |
| GET | \`/v1/skill\` | This markdown. Does not increment. |
| GET | \`/v1/doctor\` | Read-only self-check. Does not increment. |
| GET | \`/v1/limitation\` | AKM honesty text. Does not increment. |
| GET | \`/v1/describe\` | Read-only describe. Does not increment. |
| GET | \`/v1/fraggate/list\` | PROXY to aziel-runtime. Not a second door. |
| POST | \`/v1/fraggate/call\` | PROXY to aziel-runtime. FragGate remains the executable door. |
| GET | \`/v1/mesh\` | PROXY. Does not enable mesh. |
| GET | \`/mcp\` | MCP docs. Does not increment. |
| POST | \`/mcp\` | JSON-RPC for the read-only tools below. |

Catalog MCP: \`${CATALOG_MCP}\`. memory is fabric, not a Softwares-tab slug.
Local app: \`node src/cli.js serve\` then http://127.0.0.1:8788/v1/memory

## Ledger

- observe, resolve, calibrate, recall, rebuild-index run in the local process.
- delete, update, rewrite, rollback, model_update return AKM-STUB and write nothing.
`;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version, mcp-session-id, User-Agent, Authorization",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

function describeBody() {
  return {
    ok: true,
    product: PRODUCT,
    name: NAME,
    spec: SPEC,
    version: VERSION,
    author: AUTHOR,
    identity: "Aziel Eliab only",
    license: "Apache-2.0",
    forks: "always allowed",
    github: GITHUB,
    motto: MOTTO,
    surface: "download-tracker",
    asset: "memory-0.1.0.tar.gz",
    belief_is_not_truth: true,
    authorizes_action: false,
    software_tab: false,
    history_rewrite: false,
    local: { listen: "127.0.0.1:8788", command: "node src/cli.js serve" },
    door: "fraggate",
    slug: PRODUCT,
    read_ops_here: READ_OPS,
    agent_path: FRAGGATE_CALL,
    note: DOOR_NOTE,
  };
}

function healthBody() {
  return {
    ok: true,
    product: PRODUCT,
    name: NAME,
    spec: SPEC,
    version: VERSION,
    author: AUTHOR,
    surface: "download-tracker",
    belief_is_not_truth: true,
    software_tab: false,
    door: "fraggate",
    slug: PRODUCT,
    kv_increment: false,
    mesh_enabled_by_get: false,
    note: DOOR_NOTE,
  };
}

function doctorBody() {
  return {
    ok: true,
    product: PRODUCT,
    spec: SPEC,
    version: VERSION,
    author: AUTHOR,
    identity: "Aziel Eliab only",
    worker_local: true,
    fraggate_live: false,
    asset: "memory-0.1.0.tar.gz",
    ledger_writes_here: false,
    note: "Read-only self-check. The learn ledger stays in the local Node process after install. This response does not enable mesh and does not append a stamp.",
  };
}

function doorRefusal(op) {
  return {
    ok: false,
    code: "MEMORY-DOOR",
    op,
    spec: SPEC,
    door: "fraggate",
    slug: PRODUCT,
    belief_is_not_truth: true,
    authorizes_action: false,
    agent_path: FRAGGATE_CALL,
    local: "node src/cli.js serve",
    note: `This Worker does not run \`${op}\`. Use the local memory app. Nothing was written and nothing was enabled.`,
  };
}

function openapiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "memory download tracker",
      version: VERSION,
      description: DOOR_NOTE,
      license: { name: "Apache-2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
    },
    servers: [{ url: HOST }],
    paths: {
      "/download": { get: { operationId: "downloadArchive", summary: "Counted download of memory-0.1.0.tar.gz", responses: { "200": { description: "gzip archive" } } } },
      "/stats": { get: { operationId: "stats", summary: "Full counter JSON. Does not increment.", responses: { "200": { description: "stats JSON" } } } },
      "/count": { get: { operationId: "downloadCount", summary: "Compact counter JSON. Does not increment.", responses: { "200": { description: "count JSON" } } } },
      "/v1/health": { get: { operationId: "health", summary: "Tracker liveness", responses: { "200": { description: "health" } } } },
      "/v1/skill": { get: { operationId: "skill", summary: "Skill markdown", responses: { "200": { description: "markdown" } } } },
      "/v1/doctor": { get: { operationId: "doctor", summary: "Read-only self-check", responses: { "200": { description: "doctor" } } } },
      "/v1/limitation": { get: { operationId: "limitation", summary: "AKM honesty text", responses: { "200": { description: "limitation" } } } },
      "/v1/describe": { get: { operationId: "describe", summary: "Read-only describe", responses: { "200": { description: "describe" } } } },
      "/mcp": { post: { operationId: "mcp", summary: "MCP JSON-RPC for read-only memory tracker tools", responses: { "200": { description: "JSON-RPC" } } } },
    },
  };
}

function mcpTools() {
  return [
    { name: "memory_health", description: "Tracker liveness. Does not append to the learn ledger or enable mesh.", inputSchema: { type: "object", properties: {} } },
    { name: "memory_skill", description: "Skill markdown for memory 0.1.0 (AKM-TRIAD-1.0).", inputSchema: { type: "object", properties: {} } },
    { name: "memory_doctor", description: "Read-only self-check of this download tracker.", inputSchema: { type: "object", properties: {} } },
    { name: "memory_limitation", description: "AKM-TRIAD-1.0 honesty text. Posterior is not truth.", inputSchema: { type: "object", properties: {} } },
    { name: "memory_describe", description: "Read-only describe of the local app and this tracker.", inputSchema: { type: "object", properties: {} } },
  ];
}

function mcpInitialize() {
  return {
    protocolVersion: "2025-03-26",
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "memory-download-tracker", version: VERSION },
    instructions: DOOR_NOTE + " Catalog MCP remains " + CATALOG_MCP + ". This tracker does not execute memory_observe.",
  };
}

function readTool(name) {
  if (name === "memory_health" || name === "health") return healthBody();
  if (name === "memory_skill" || name === "skill") return { skill: SKILL };
  if (name === "memory_doctor" || name === "doctor") return doctorBody();
  if (name === "memory_limitation" || name === "limitation") return { ok: true, limitation: LIMITATION, version: VERSION, spec: SPEC };
  if (name === "memory_describe" || name === "describe") return describeBody();
  return null;
}

async function handleMcp(request) {
  if (request.method === "GET" || request.method === "HEAD") {
    const docs = {
      product: PRODUCT,
      spec: SPEC,
      version: VERSION,
      author: AUTHOR,
      protocol: "mcp",
      door: "fraggate",
      slug: PRODUCT,
      catalog_mcp: CATALOG_MCP,
      tools: mcpTools().map((t) => t.name),
      belief_is_not_truth: true,
      note: DOOR_NOTE,
    };
    if (request.method === "HEAD") return new Response(null, { status: 200, headers: corsHeaders() });
    return json(docs);
  }
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  const id = body && Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;
  const method = body && body.method;
  const params = (body && body.params) || {};
  if (method === "initialize") return json({ jsonrpc: "2.0", id, result: mcpInitialize() });
  if (method === "notifications/initialized" || method === "initialized") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (method === "ping") return json({ jsonrpc: "2.0", id, result: {} });
  if (method === "tools/list") return json({ jsonrpc: "2.0", id, result: { tools: mcpTools() } });
  if (method === "tools/call") {
    const name = params.name;
    const data = readTool(name);
    if (!data) {
      return json({
        jsonrpc: "2.0",
        id,
        result: {
          isError: true,
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: false,
              code: "MEMORY-DOOR",
              error: "Unknown or non-local tool. AKM writes stay on the local app. This Worker did not execute them.",
              agent_path: FRAGGATE_CALL,
              catalog_mcp: CATALOG_MCP,
            }, null, 2),
          }],
        },
      });
    }
    if (name === "memory_skill" || name === "skill") {
      return json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: SKILL }] } });
    }
    return json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
  }
  return json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "Method not found. Use initialize, tools/list, tools/call." },
  });
}

function runtimeFetcher(env) {
  if (env && env.AZIEL_RUNTIME && typeof env.AZIEL_RUNTIME.fetch === "function") return env.AZIEL_RUNTIME;
  return null;
}

async function proxyDoor(request, url, env) {
  const dest = doorTargetUrl(url.pathname, request.url, env);
  if (!dest) return json({ ok: false, error: "not a door path", path: url.pathname, door: "fraggate" }, 404);
  const headers = new Headers();
  const pass = ["content-type", "accept", "authorization", "user-agent", "mcp-protocol-version", "mcp-session-id"];
  for (const name of pass) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }
  if (!headers.has("user-agent") && !headers.has("User-Agent")) headers.set("User-Agent", "Mozilla/5.0 memory/0.1.0");
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }
  try {
    const fetcher = runtimeFetcher(env);
    const res = fetcher ? await fetcher.fetch(dest, init) : await fetch(dest, init);
    const outHeaders = new Headers();
    const ctype = res.headers.get("content-type");
    if (ctype) outHeaders.set("content-type", ctype);
    for (const [k, v] of Object.entries(corsHeaders())) outHeaders.set(k, v);
    outHeaders.set("X-Aziel-Door", "proxy");
    outHeaders.set("X-Aziel-Door-Origin", dest);
    outHeaders.set("Cache-Control", "private, no-store");
    return new Response(res.body, { status: res.status, headers: outHeaders });
  } catch (exc) {
    return json({
      ok: false,
      error: "fraggate_proxy_failed",
      detail: String(exc && exc.message ? exc.message : exc).slice(0, 240),
      origin: dest,
      agent_path: FRAGGATE_CALL,
      door: "fraggate",
      slug: PRODUCT,
      note: "The proxy failed. Nothing was enabled on this Worker.",
    }, 502);
  }
}

export async function handleRuntimeApi(request, url, env) {
  const stripped = url.pathname.replace(/\/+$/, "") || "/";
  if (stripped === "/mcp") return handleMcp(request);

  const classified = classifyV1Path(url.pathname);
  if (classified.kind === "door") return proxyDoor(request, url, env);

  const path = stripped;
  const isApi = path === "/v1" || path.startsWith("/v1/") || path === "/openapi.json";
  if (!isApi) return null;

  if (classified.kind === "multi") {
    return json({
      ok: false,
      error: "not a local op",
      code: "NOT_LOCAL_OP",
      path: classified.path,
      note: "Local reads are a single /v1/{op} segment. FragGate and mesh paths proxy to aziel-runtime and do not increment downloads.",
    }, 404);
  }

  if (path === "/openapi.json" && request.method === "GET") return json(openapiSpec());
  if (path === "/v1" && request.method === "GET") {
    return json({
      ok: true,
      product: PRODUCT,
      spec: SPEC,
      version: VERSION,
      read_ops: READ_OPS,
      door: "fraggate",
      belief_is_not_truth: true,
      kv_increment: false,
      note: DOOR_NOTE,
    });
  }
  if (request.method === "GET" && path === "/v1/health") return json(healthBody());
  if (request.method === "GET" && path === "/v1/skill") {
    return new Response(SKILL, {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "private, no-store", ...corsHeaders() },
    });
  }
  if (request.method === "GET" && path === "/v1/doctor") return json(doctorBody());
  if (request.method === "GET" && path === "/v1/limitation") {
    return json({ ok: true, product: PRODUCT, spec: SPEC, version: VERSION, author: AUTHOR, limitation: LIMITATION, belief_is_not_truth: true });
  }
  if (request.method === "GET" && path === "/v1/describe") return json(describeBody());

  if (classified.kind === "local" && classified.op) {
    const op = classified.op;
    if (request.method === "GET" && !READ_OPS.includes(op)) {
      return json({ ...doorRefusal(op), hint: "Use the local memory app. GET does not enable this op." }, 405);
    }
    if (request.method === "POST") return json(doorRefusal(op), 400);
    if (request.method !== "GET") return json({ ok: false, code: "MEMORY-METHOD", note: "Method not allowed." }, 405);
  }

  return json({ error: "not found", product: PRODUCT, note: DOOR_NOTE }, 404);
}

export const RUNTIME_TEXT = { LIMITATION, MOTTO, VERSION, DOOR_NOTE, SPEC };
