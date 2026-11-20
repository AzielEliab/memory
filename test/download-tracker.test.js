import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import { THEME } from "../workers/download-tracker/src/home.js";
import { TRACKER, handleRequest } from "../workers/download-tracker/src/index.js";
import { RUNTIME_TEXT } from "../workers/download-tracker/src/runtime.js";

const ARCHIVE = new URL("../workers/download-tracker/public/memory-0.1.0.tar.gz", import.meta.url);

function memoryKv() {
  const store = new Map();
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
    async list() {
      return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true };
    },
    store,
  };
}

function diskAssets() {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const file = new URL("../workers/download-tracker/public/" + name, import.meta.url);
      if (name.includes("..") || !existsSync(file)) return new Response("missing", { status: 404 });
      const buf = readFileSync(file);
      return new Response(buf, { status: 200, headers: { "content-length": String(buf.byteLength) } });
    },
  };
}

function makeEnv(fetchImpl) {
  const env = {
    DOWNLOADS: memoryKv(),
    ASSETS: diskAssets(),
    AZIEL_RUNTIME_ORIGIN: "https://aziel-runtime.example",
  };
  if (fetchImpl) env.AZIEL_RUNTIME = { fetch: fetchImpl };
  return env;
}

async function call(path, init = {}, env = makeEnv()) {
  const headers = new Headers(init.headers);
  if (!headers.has("user-agent")) headers.set("user-agent", "Mozilla/5.0");
  const req = new Request("http://127.0.0.1" + path, { ...init, headers });
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ stars: 0, forks: 0 }), { status: 200 }));
  try {
    return await handleRequest(req, env);
  } finally {
    globalThis.fetch = previous;
  }
}

function contrast(hexA, hexB) {
  const lum = (hex) => {
    const n = hex.replace("#", "");
    const rgb = [0, 2, 4].map((i) => {
      const c = parseInt(n.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const a = lum(hexA);
  const b = lum(hexB);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

describe("memory download tracker", () => {
  it("serves the real 0.1.0 archive with HTTP 200 and counts dimensions", async () => {
    assert.equal(TRACKER.project, "memory");
    assert.equal(TRACKER.version, "0.1.0");
    assert.equal(TRACKER.asset, "memory-0.1.0.tar.gz");
    assert.equal(TRACKER.host, "https://memory-download-tracker.vibelock.workers.dev");
    assert.ok(statSync(ARCHIVE).size > 1000);
    const listing = execFileSync("tar", ["-tzf", ARCHIVE.pathname], { encoding: "utf8" });
    assert.match(listing, /memory-0\.1\.0\/package\.json/);
    assert.match(listing, /memory-0\.1\.0\/src\/cli\.js/);
    assert.match(listing, /memory-0\.1\.0\/LICENSE/);
    const packed = execFileSync("tar", ["-xOzf", ARCHIVE.pathname, "memory-0.1.0/package.json"], { encoding: "utf8" });
    assert.equal(JSON.parse(packed).version, "0.1.0");

    const env = makeEnv();
    const res = await call("/download", {}, env);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /gzip/);
    assert.match(res.headers.get("content-disposition") || "", /memory-0\.1\.0\.tar\.gz/);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(bytes[0], 0x1f);
    assert.equal(bytes[1], 0x8b);
    const raw = gunzipSync(bytes);
    assert.ok(raw.byteLength > 100);
    assert.equal(res.status !== 302, true);

    const again = await call("/download?branch=dev", {}, env);
    assert.equal(again.status, 200);
    const named = await call("/download/memory-0.1.0.tar.gz", {}, env);
    assert.equal(named.status, 200);
    const go = await call("/go", {}, env);
    assert.equal(go.status, 200);
    const fork = await call("/download?owner=Other&repo=memory&branch=main", {}, env);
    assert.equal(fork.status, 200);

    const statsRes = await call("/stats", {}, env);
    const stats = await statsRes.json();
    assert.equal(stats.project, "memory");
    assert.equal(stats.total, stats.downloads);
    assert.equal(stats.downloads, 5);
    assert.equal(stats.views, stats.views_human + stats.views_bot);
    assert.equal(stats.downloads, stats.downloads_human + stats.downloads_bot);
    assert.equal(stats.human.downloads + stats.bot.downloads, stats.downloads);
    assert.equal(stats.classification.bot_score_threshold, 30);
    assert.equal(stats.classification.method, "ua_denylist + healthcheck_ua");
    assert.match(stats.classification.note, /views_bot = views - views_human/);
    assert.match(stats.classification.legacy, /KV history not rewritten/);
    assert.equal(stats.note, "Forks identified by GitHub owner/repo. Key layout: project|owner|repo|branch|fork");
    assert.equal(stats.by_branch.main, 4);
    assert.equal(stats.by_branch.dev, 1);
    assert.equal(stats.by_fork["0"], 4);
    assert.equal(stats.by_fork["1"], 1);
    assert.equal(stats.by_repo["AzielEliab/memory"], 4);
    assert.equal(stats.by_repo["Other/memory"], 1);
    assert.ok(Array.isArray(stats.breakdown));
    assert.equal(typeof stats.github.stars, "number");
    assert.equal(typeof stats.github.forks, "number");
    assert.equal(typeof stats.github.watchers, "number");
    assert.equal(typeof stats.github.release_download_count, "number");
    assert.ok(stats.github.fetched_at);

    const count = await call("/count", {}, env);
    const body = await count.json();
    assert.equal(body.project, "memory");
    assert.equal(body.downloads, 5);
    assert.equal(body.total, 5);
    assert.equal(body.downloads, body.downloads_human + body.downloads_bot);
    assert.equal(count.headers.get("access-control-allow-origin"), "*");
  });

  it("does not count HEAD, a missing asset, /v1, or /mcp", async () => {
    const env = makeEnv();
    const head = await call("/download", { method: "HEAD" }, env);
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get("content-length")) > 0, true);
    const missing = await call("/download?asset=memory-9.9.9.tar.gz", {}, env);
    assert.equal(missing.status, 404);
    const missingBody = await missing.json();
    assert.equal(missingBody.error, "asset not hosted");
    assert.equal(missingBody.hosted, "memory-0.1.0.tar.gz");

    const root = await call("/v1", {}, env);
    assert.equal(root.status, 200);
    const health = await call("/v1/health", {}, env);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.version, "0.1.0");
    assert.equal(healthBody.kv_increment, false);
    assert.equal(healthBody.mesh_enabled_by_get, false);
    assert.equal(healthBody.belief_is_not_truth, true);
    const skill = await call("/v1/skill", {}, env);
    assert.equal(skill.status, 200);
    assert.match(await skill.text(), /AKM-TRIAD-1.0/);
    const doctor = await call("/v1/doctor", {}, env);
    assert.equal(doctor.status, 200);
    const limitation = await call("/v1/limitation", {}, env);
    const limitationBody = await limitation.json();
    assert.equal(limitationBody.limitation, RUNTIME_TEXT.LIMITATION);
    assert.match(limitationBody.limitation, /not truth/);
    const describe = await call("/v1/describe", {}, env);
    assert.equal(describe.status, 200);
    const openapi = await call("/openapi.json", {}, env);
    assert.equal(openapi.status, 200);
    const cite = await call("/cite.json", {}, env);
    assert.equal(cite.status, 200);
    const sitemap = await call("/sitemap.xml", {}, env);
    assert.equal(sitemap.status, 200);
    const robots = await call("/robots.txt", {}, env);
    assert.match(await robots.text(), /Sitemap:/);
    const llms = await call("/llms.txt", {}, env);
    assert.match(await llms.text(), /Forks: always allowed/);
    const ai = await call("/ai.txt", {}, env);
    assert.equal(ai.status, 200);
    const mcpGet = await call("/mcp", {}, env);
    assert.equal(mcpGet.status, 200);
    const mcp = await call("/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }, env);
    const rpc = await mcp.json();
    const names = rpc.result.tools.map((tool) => tool.name);
    assert.deepEqual(names, ["memory_health", "memory_skill", "memory_doctor", "memory_limitation", "memory_describe"]);

    const count = await call("/count", {}, env);
    const body = await count.json();
    assert.equal(body.downloads, 0);
    assert.equal(body.views, 0);
  });

  it("keeps the human/bot remainder invariant, including pre-split totals", async () => {
    const env = makeEnv();
    await call("/", { headers: { "user-agent": "Mozilla/5.0" } }, env);
    await call("/", { headers: { "user-agent": "" } }, env);
    await call("/", { headers: { "user-agent": "uptimerobot/1.0" } }, env);
    await call("/download", { headers: { "user-agent": "Mozilla/5.0" } }, env);
    await call("/download", { headers: { "user-agent": "Googlebot/2.1" } }, env);
    const stats = await (await call("/stats", {}, env)).json();
    assert.equal(stats.views, 3);
    assert.equal(stats.views_human, 1);
    assert.equal(stats.views_bot, 2);
    assert.equal(stats.views, stats.views_human + stats.views_bot);
    assert.equal(stats.downloads_human, 1);
    assert.equal(stats.downloads_bot, 1);
    assert.equal(stats.downloads, stats.downloads_human + stats.downloads_bot);
    assert.equal(stats.human.views, stats.views_human);
    assert.equal(stats.bot.downloads, stats.downloads_bot);

    env.DOWNLOADS.store.set("memory|__total__", "10");
    env.DOWNLOADS.store.set("memory|__views__", "7");
    const remainder = await (await call("/stats", {}, env)).json();
    assert.equal(remainder.downloads, 10);
    assert.equal(remainder.downloads_bot, remainder.downloads - remainder.downloads_human);
    assert.equal(remainder.views_bot, remainder.views - remainder.views_human);
    assert.equal(remainder.classification.bot_score_threshold, 30);
  });

  it("renders the landing, install script, CORS preflight, and fork events", async () => {
    const env = makeEnv();
    const home = await call("/", {}, env);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /<h1>memory<\/h1>/);
    assert.match(html, /id="download" href="\/download"/);
    assert.match(html, /prefers-color-scheme:\s*light/);
    assert.match(html, /:focus-visible/);
    assert.match(html, /Features/);
    assert.match(html, /Append-only learn ledger/);
    assert.match(html, /0\.1\.0/);
    assert.match(html, /calibrated belief/);
    for (const theme of [THEME.dark, THEME.light]) {
      assert.ok(contrast(theme.ink, theme.bg) >= 4.5);
      assert.ok(contrast(theme.muted, theme.bg) >= 4.5);
      assert.ok(contrast(theme.btnInk, theme.btnBg) >= 4.5);
      assert.ok(contrast(theme.focus, theme.bg) >= 3);
    }
    const install = await call("/install.sh", {}, env);
    const script = await install.text();
    assert.match(script, /memory-0\.1\.0\.tar\.gz/);
    assert.match(script, /curl -fsSL -A 'Mozilla\/5.0'/);
    assert.match(script, /node src\/cli\.js serve/);
    const opt = await call("/download", { method: "OPTIONS" }, env);
    assert.equal(opt.status, 204);
    assert.equal(opt.headers.get("access-control-allow-origin"), "*");
    assert.match(opt.headers.get("access-control-allow-methods") || "", /POST/);

    const event = await call("/event", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
      body: JSON.stringify({ owner: "ForkUser", repo: "memory", branch: "feature", fork: true }),
    }, env);
    assert.equal(event.status, 200);
    const eventBody = await event.json();
    assert.equal(eventBody.ok, true);
    assert.equal(eventBody.fork, "1");
    assert.equal(eventBody.branch, "feature");
    const stats = await (await call("/stats", {}, env)).json();
    assert.equal(stats.by_branch.feature, 1);
    assert.equal(stats.by_fork["1"], 1);
    assert.equal(stats.downloads, 1);
    assert.equal(stats.views, 1);
    assert.equal(stats.views, stats.views_human + stats.views_bot);
  });

  it("proxies FragGate and mesh without incrementing", async () => {
    const seen = [];
    const env = makeEnv(async (input, init) => {
      seen.push({ url: String(input), method: init?.method || "GET" });
      return new Response(JSON.stringify({ ok: true, proxied: true, enabled: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const mesh = await call("/v1/mesh", {}, env);
    assert.equal(mesh.status, 200);
    assert.equal(mesh.headers.get("x-aziel-door"), "proxy");
    assert.match(seen[0].url, /\/v1\/mesh$/);
    const meshBody = await mesh.json();
    assert.equal(meshBody.proxied, true);
    const refused = await call("/v1/observe", { method: "POST", body: JSON.stringify({ fact: "no" }) }, env);
    assert.equal(refused.status, 400);
    const refusedBody = await refused.json();
    assert.equal(refusedBody.code, "MEMORY-DOOR");
    assert.equal(seen.length, 1);
    const count = await call("/count", {}, env);
    const body = await count.json();
    assert.equal(body.downloads, 0);
    assert.equal(body.views, 0);
  });
});
