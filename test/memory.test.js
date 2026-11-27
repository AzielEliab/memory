import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { confidenceClass, rebuildPosterior } from "../src/adaptive.js";
import { boundMemoryMeta } from "../src/meta.js";
import { openMemory } from "../src/memory.js";

async function fresh() {
  const dir = await mkdtemp(path.join(tmpdir(), "memory-"));
  const app = await openMemory({ dataDir: dir });
  return { dir, app };
}

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

describe("AKM ledger", () => {
  it("appends, rebuilds the same Belief List, and refuses history mutation", async () => {
    const { dir, app } = await fresh();
    const observed = await app.observe({ subject: "harbor", fact: "the tide table matched the log" });
    assert.equal(observed.ok, true);
    assert.equal(observed.belief_is_not_truth, true);
    assert.equal(observed.authorizes_action, false);
    assert.equal(observed.software_tab, false);
    assert.equal(observed.node.status, "ACTIVE");
    const id = observed.memory_id;

    const yes = await app.resolve({
      memory_id: id,
      subject: "harbor",
      outcome: 1,
      evidence_hash: "a".repeat(64),
    });
    assert.equal(yes.ok, true);
    assert.ok(yes.node.posterior_probability > 0.5);

    const unknown = await app.resolve({
      memory_id: id,
      outcome: "UNKNOWN",
      outcome_label: "UNKNOWN",
      evidence_hash: "b".repeat(64),
    });
    assert.equal(unknown.ok, true);
    assert.equal(unknown.node.posterior_probability, yes.node.posterior_probability);

    const dup = await app.resolve({
      memory_id: id,
      outcome: 0,
      evidence_hash: "a".repeat(64),
    });
    assert.equal(dup.node.posterior_probability, yes.node.posterior_probability);

    const ai = await app.resolve({
      memory_id: id,
      outcome: 0,
      evidence_hash: "c".repeat(64),
      ai_generated: true,
    });
    assert.equal(ai.node.posterior_probability, yes.node.posterior_probability);

    const no = await app.resolve({
      memory_id: id,
      outcome: 0,
      evidence_hash: "d".repeat(64),
    });
    assert.ok(no.node.posterior_probability < yes.node.posterior_probability);
    assert.equal(no.node.belief_is_not_truth ?? no.belief_is_not_truth, true);

    const contested = await app.contradict({ memory_id: id, subject: "harbor", fact: "a second log disagrees" });
    assert.equal(contested.ok, true);
    assert.equal(contested.node.status, "CONTESTED");

    const before = sha(await readFile(path.join(dir, "chains", "learn.jsonl")));
    const indexHash = contested.node.index_hash;
    app.index.reset();
    const rebuilt = await app.rebuildIndex();
    assert.equal(rebuilt.ok, true);
    assert.equal(rebuilt.authority, "chainlock-learn");
    const again = app.explain(id, "calibration");
    assert.equal(again.index_hash, indexHash);
    assert.equal(again.status, "CONTESTED");
    assert.equal(again.posterior_probability, contested.node.posterior_probability);
    assert.match(again.note, /not truth/);

    for (const op of ["delete_history", "rewrite", "rollback", "model_update", "auto_update"]) {
      const refused = await app.run(op, { memory_id: id });
      assert.equal(refused.ok, false);
      assert.equal(refused.code, "AKM-STUB");
      assert.equal(refused.written, false);
    }
    const dry = await app.observe({ subject: "harbor", fact: "should not land", dry_run: true });
    assert.equal(dry.code, "AKM-DRY-RUN");
    assert.equal(dry.mutated, false);
    assert.equal(sha(await readFile(path.join(dir, "chains", "learn.jsonl"))), before);

    const raw = await readFile(path.join(dir, "chains", "learn.jsonl"), "utf8");
    assert.equal(raw.includes("password"), false);
    const tampered = raw.replace("the tide table matched the log", "the tide table matched the XXX");
    await writeFile(path.join(dir, "chains", "learn.jsonl"), tampered);
    const verified = await app.verify();
    assert.equal(verified.ok, false);
    assert.equal(verified.fail_closed, true);
    assert.ok(verified.learn.breaks.length >= 1);
    const blocked = await app.observe({ subject: "harbor", fact: "another fact after a break" });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "CHAIN_VERIFY_FAIL");
    const recalled = await app.recall({ q: "tide" });
    assert.equal(recalled.code, "CHAIN_VERIFY_FAIL");
  });

  it("keeps posterior math distinct from truth and restrains small N", () => {
    const rebuilt = rebuildPosterior(
      [
        { kind: "memory_resolution", outcome: 1, weight: 1, evidence_hash: "e1" },
        { kind: "memory_resolution", outcome: "UNKNOWN", outcome_label: "UNKNOWN", evidence_hash: "e2" },
        { kind: "memory_resolution", outcome: 1, weight: 1, evidence_hash: "e1" },
      ],
      { alpha: 1, beta: 1, alpha0: 1, beta0: 1 },
    );
    assert.equal(rebuilt.belief_is_not_truth, true);
    assert.equal(rebuilt.applied, 1);
    assert.equal(rebuilt.unknown, 1);
    assert.equal(rebuilt.probability, 2 / 3);
    assert.equal(confidenceClass(95, rebuilt.effective_observations), "LOW");
    assert.equal(confidenceClass(80, 12), "HIGH");
  });

  it("drops secret meta keys and refuses a hash-only observe", async () => {
    const bounded = boundMemoryMeta({
      memory_id: "akm_test",
      kind: "memory_observation",
      password: "nope",
      token: "nope",
      note: "kept",
    });
    assert.equal(bounded.password, undefined);
    assert.equal(bounded.token, undefined);
    assert.equal(bounded.note, "kept");
    const { app } = await fresh();
    const refused = await app.forwardLearn({ k: "memory_observation", subject: "x", fact: "", memory: { memory_id: "akm_x" } });
    assert.equal(refused.code, "AKM-NO-FACT");
    assert.equal(refused.ok, false);
  });
});
