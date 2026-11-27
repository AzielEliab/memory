import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { USE_CASES } from "../src/calibration-manifest.js";
import { openMemory } from "../src/memory.js";
import { assembleTriadDecision, selectThreeOfFour } from "../src/triad.js";

describe("3-of-4 triad", () => {
  it("returns TRIAD_INCOMPLETE instead of fabricating a score", () => {
    const selected = selectThreeOfFour(
      USE_CASES.forensic_evidence,
      { E: 0, C: 0, P: 0, B: 0 },
      0,
    );
    assert.equal(selected.ok, false);
    assert.equal(selected.state, "TRIAD_INCOMPLETE");
    assert.deepEqual(selected.selected, []);
    const decision = assembleTriadDecision({
      use_case: USE_CASES.forensic_evidence,
      availability: { E: 0, C: 0, P: 0, B: 0 },
      effective_observations: 0,
      channel_scores: { E: 0.99, C: 0.99, P: 0.99, B: 0.99 },
    });
    assert.equal(decision.triad_score, null);
    assert.equal(decision.belief_is_not_truth, true);
    assert.equal(decision.authorizes_action, false);
    assert.equal(decision.confidence_class, "LOW");
  });

  it("selects channels by suitability, never by the component scores", () => {
    const low = assembleTriadDecision({
      use_case: USE_CASES.forensic_evidence,
      availability: { E: 1, C: 1, P: 1, B: 1 },
      effective_observations: 20,
      channel_scores: { E: 0.01, C: 0.02, P: 0.03, B: 0.99 },
    });
    const high = assembleTriadDecision({
      use_case: USE_CASES.forensic_evidence,
      availability: { E: 1, C: 1, P: 1, B: 1 },
      effective_observations: 20,
      channel_scores: { E: 0.99, C: 0.98, P: 0.97, B: 0.01 },
    });
    assert.deepEqual(low.selected, ["E", "C", "P"]);
    assert.equal(low.omitted, "B");
    assert.deepEqual(low.selected, high.selected);
    assert.notEqual(low.triad_score, high.triad_score);
    assert.equal(low.ok, true);
    assert.equal(high.belief_is_not_truth, true);
  });

  it("calibrates a live ledger and records the triad on the node", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "memory-triad-"));
    const app = await openMemory({ dataDir: dir });
    const observed = await app.observe({
      subject: "forensic dockets",
      fact: "archive witness notes align with the evidence ledger",
      use_case: "forensic_evidence",
      completeness: 0.8,
      provenance: 0.7,
    });
    assert.equal(observed.ok, true);
    for (let i = 0; i < 4; i++) {
      const resolved = await app.resolve({
        memory_id: observed.memory_id,
        outcome: 1,
        evidence_hash: `f${i}`.padEnd(64, "0"),
        completeness: 0.8,
      });
      assert.equal(resolved.ok, true);
    }
    const calibrated = await app.calibrate({
      memory_id: observed.memory_id,
      subject: "forensic dockets",
      use_case: "forensic_evidence",
      fact: "archive witness notes align with the evidence ledger",
      completeness: 0.8,
      provenance: 0.7,
    });
    assert.equal(calibrated.ok, true);
    assert.equal(calibrated.belief_is_not_truth, true);
    assert.equal(calibrated.authorizes_action, false);
    assert.equal(calibrated.triad.belief_is_not_truth, true);
    assert.ok(calibrated.triad.selected.length === 3 || calibrated.triad.state === "TRIAD_INCOMPLETE");
    if (calibrated.triad.ok) {
      assert.equal(typeof calibrated.triad.triad_score, "number");
      assert.equal(calibrated.node.latest_triad.triad_score, calibrated.triad.triad_score);
    }
    assert.equal(calibrated.posterior.belief_is_not_truth, true);
    const recalled = await app.recall({ q: "witness" });
    assert.equal(recalled.ok, true);
    assert.equal(recalled.verified, true);
    assert.equal(recalled.belief_is_not_truth, true);
    assert.ok(recalled.count >= 1);
  });
});
