import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { openMemory } from "../src/memory.js";
import { startServer } from "../src/http.js";

async function listen() {
  const dir = await mkdtemp(path.join(tmpdir(), "memory-http-"));
  const app = await openMemory({ dataDir: dir });
  const started = await startServer(app, { host: "127.0.0.1", port: 0 });
  return { dir, app, ...started };
}

async function hit(base, method, pathname, body) {
  const res = await fetch(base + pathname, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  if (text) json = JSON.parse(text);
  return { status: res.status, json, headers: res.headers };
}

describe("local HTTP API", () => {
  it("serves the AKM routes and refuses rewrite", async () => {
    const started = await listen();
    try {
      const health = await hit(started.url, "GET", "/v1/memory");
      assert.equal(health.status, 200);
      assert.equal(health.json.spec, "AKM-TRIAD-1.0");
      assert.equal(health.json.belief_is_not_truth, true);
      assert.equal(health.json.memory_delete, false);
      assert.equal(health.json.history_rewrite, false);
      assert.equal(health.headers.get("access-control-allow-origin"), "*");

      const pre = await fetch(started.url + "/v1/memory/observe", { method: "OPTIONS" });
      assert.equal(pre.status, 204);

      const observed = await hit(started.url, "POST", "/v1/memory/observe", {
        subject: "lantern",
        fact: "the wick was trimmed before the watch",
      });
      assert.equal(observed.status, 200);
      const id = observed.json.memory_id;

      const got = await hit(started.url, "GET", `/v1/memory/${id}`);
      assert.equal(got.status, 200);
      assert.equal(got.json.node.subject_key, "lantern");

      const resolved = await hit(started.url, "POST", "/v1/memory/resolve", {
        memory_id: id,
        outcome: 1,
        evidence_hash: "9".repeat(64),
      });
      assert.equal(resolved.status, 200);

      const calibrated = await hit(started.url, "POST", "/v1/memory/calibrate", {
        memory_id: id,
        subject: "lantern",
        fact: "the wick was trimmed before the watch",
        completeness: 0.6,
      });
      assert.equal(calibrated.status, 200);
      assert.equal(calibrated.json.belief_is_not_truth, true);

      const recalled = await hit(started.url, "POST", "/v1/memory/recall", { q: "wick" });
      assert.equal(recalled.status, 200);
      assert.equal(recalled.json.verified, true);

      const history = await hit(started.url, "GET", `/v1/memory/${id}/history`);
      assert.equal(history.status, 200);
      assert.ok(history.json.events.length >= 2);

      const calibration = await hit(started.url, "GET", `/v1/memory/${id}/calibration`);
      assert.equal(calibration.status, 200);
      assert.equal(typeof calibration.json.posterior_probability, "number");

      const rebuilt = await hit(started.url, "POST", "/v1/memory/rebuild-index", {});
      assert.equal(rebuilt.status, 200);
      assert.equal(rebuilt.json.derived, true);
      const same = rebuilt.json.nodes.find((node) => node.memory_id === id);
      assert.equal(same.index_hash, calibration.json.index_hash);

      const missing = await hit(started.url, "GET", "/v1/memory/akm_missing");
      assert.equal(missing.status, 404);
      assert.equal(missing.json.code, "AKM-NOT-FOUND");

      const before = await readFile(path.join(started.dir, "chains", "learn.jsonl"), "utf8");
      for (const route of ["delete", "update", "rewrite", "rollback", "model_update"]) {
        const refused = await hit(started.url, "POST", `/v1/memory/${route}`, { memory_id: id });
        assert.equal(refused.status, 400);
        assert.equal(refused.json.code, "AKM-STUB");
      }
      const after = await readFile(path.join(started.dir, "chains", "learn.jsonl"), "utf8");
      assert.equal(after, before);

      const method = await hit(started.url, "GET", "/v1/memory/observe");
      assert.equal(method.status, 405);
    } finally {
      started.server.close();
    }
  });

  it("runs the CLI against a fresh ledger", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "memory-cli-"));
    const cli = path.join(process.cwd(), "src", "cli.js");
    const run = (args) =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cli, "--data", dir, ...args], { encoding: "utf8" });
        let out = "";
        let err = "";
        child.stdout.on("data", (chunk) => {
          out += chunk;
        });
        child.stderr.on("data", (chunk) => {
          err += chunk;
        });
        child.on("close", (code) => resolve({ code, out, err }));
        child.on("error", reject);
      });
    const observed = await run(["observe", "--subject", "cli", "--fact", "the ledger accepted the stamp"]);
    assert.equal(observed.code, 0, observed.err);
    const body = JSON.parse(observed.out);
    assert.equal(body.ok, true);
    const health = await run(["health"]);
    assert.equal(health.code, 0);
    assert.equal(JSON.parse(health.out).nodes, 1);
    const refused = await run(["verify"]);
    assert.equal(refused.code, 0);
    assert.equal(JSON.parse(refused.out).ok, true);
  });
});
