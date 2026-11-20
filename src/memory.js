/**
 * AKM-TRIAD-1.0 local adaptive knowledge memory.
 *
 * Fabric extracted from aziel-runtime. Not a Softwares-tab product.
 * Not a second FragGate door. ChainLock learn on disk is the ledger.
 * Bayesian posterior is calibrated belief, not truth.
 * Author: Aziel Eliab. SPDX-License-Identifier: Apache-2.0
 */

import {
  MEMORY_CONTEXT_CAP,
  clip01,
  emptyPrior,
  evidenceWeight,
  hashMemoryDelta,
  lexicalRelevance,
  recencyScore,
  rebuildPosterior,
  retrievalScore,
} from "./adaptive.js";
import { BeliefIndex, LEARN_KINDS } from "./belief.js";
import {
  CALIBRATION_MANIFEST_VERSION,
  classifyUseCase,
  manifestView,
  RETRIEVAL_WEIGHTS,
} from "./calibration-manifest.js";
import { canonicalize, sha256Hex } from "./canon.js";
import {
  FACT_CAP,
  GENESIS,
  LEARN_CHAIN,
  REFUSALS_CHAIN,
  ROSE_CHAIN,
  SUBJECT_CAP,
  Vault,
  clip,
  composeLearnStamp,
  composeRose,
  toCard,
  verifyRoseRows,
  verifyRows,
} from "./chainlock.js";
import { verifyPreventedEdges } from "./prevented.js";
import { assembleTriadDecision, inspectAvailability, selectThreeOfFour } from "./triad.js";
import * as bayesProvider from "./providers/bayes.js";
import * as clceProvider from "./providers/clce.js";
import * as evidenceProvider from "./providers/generic-evidence.js";
import * as spreProvider from "./providers/spre.js";
import * as zionProvider from "./providers/zionpattern.js";

export const AKM_SPEC = "AKM-TRIAD-1.0";
export const AKM_AUTHOR = "Aziel Eliab";
export const MEMORY_SLUG = "memory";
export const MEMORY_NAME = "Adaptive Knowledge Memory";
export const AKM_VERSION = "0.1.0";

export const MEMORY_CANONICAL_OPS = Object.freeze([
  "observe",
  "resolve",
  "calibrate",
  "recall",
  "get",
  "history",
  "calibration",
  "support",
  "contradict",
  "supersede",
  "revoke",
  "feedback",
  "rebuild-index",
  "health",
  "skill",
  "verify",
  "lattice-learn",
]);

export const MEMORY_STUB_OPS = Object.freeze([
  "model_update",
  "rollback",
  "rewrite",
  "delete_history",
  "auto_update",
  "delete",
  "update",
]);

export const MEMORY_WRITE_OPS = Object.freeze([
  "observe",
  "resolve",
  "calibrate",
  "support",
  "contradict",
  "supersede",
  "revoke",
  "feedback",
]);

export const AKM_DRY_RUN = "AKM-DRY-RUN";

const PROVIDERS = {
  "generic-evidence": evidenceProvider,
  clce: clceProvider,
  spre: spreProvider,
  zionpattern: zionProvider,
  bayes: bayesProvider,
};

export function isTruthyFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function refuse(code, message, extra = {}) {
  return {
    ok: false,
    code,
    spec: AKM_SPEC,
    author: AKM_AUTHOR,
    software_tab: false,
    message,
    belief_is_not_truth: true,
    authorizes_action: false,
    ...extra,
  };
}

export function memoryLedgerHonesty(extra = {}) {
  return {
    index: "derived-cache",
    authority: "chainlock-learn",
    belief_list_durable: "chainlock-learn-jsonl",
    hosted_durable_object: false,
    dual_lattice: "SLOT",
    hosted_roseclock: false,
    hosted_temporallock: "SLOT",
    fragate_door: false,
    belief_is_not_truth: true,
    memory_delete: false,
    memory_update_overwrite: false,
    history_rewrite: false,
    ...extra,
  };
}

function capabilitiesOf(src) {
  if (Array.isArray(src.capabilities)) return src.capabilities.map((c) => String(c).toUpperCase());
  if (Array.isArray(src.authority)) return src.authority.map((c) => String(c).toUpperCase());
  return [];
}

function hasCap(caps, name) {
  return caps.includes(String(name).toUpperCase());
}

async function providersFor(useCase, packet) {
  const invoked = [];
  const scores = {};
  const refs = [];
  const needed = new Set(useCase.default_triad || []);
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    if (useCase.providers && !useCase.providers.includes(id) && id !== "generic-evidence" && id !== "bayes") {
      continue;
    }
    const suitability = provider.canScore(packet, useCase);
    const supportsNeeded = (provider.CHANNELS_SUPPORTED || []).some((ch) => needed.has(ch) || ch === "E");
    if (suitability <= 0 || !supportsNeeded) continue;
    if (id === "spre" && !useCase.providers.includes("spre")) continue;
    if (id === "clce" && !useCase.providers.includes("clce")) continue;
    if (id === "zionpattern" && !useCase.providers.includes("zionpattern")) continue;
    invoked.push(id);
    const out = await provider.score(packet);
    if (out && out.score != null) {
      if (out.scores) {
        for (const [ch, v] of Object.entries(out.scores)) scores[ch] = v;
      } else {
        scores[out.channel] = out.score;
      }
      if (out.evidence_refs) refs.push(...out.evidence_refs);
    }
  }
  return { invoked, scores, refs };
}

export class MemoryApp {
  constructor(vault) {
    this.vault = vault;
    this.index = new BeliefIndex();
    this.hydrated = false;
  }

  async verify() {
    const learn = await this.vault.load(LEARN_CHAIN);
    const rose = await this.vault.load(ROSE_CHAIN);
    const refusals = await this.vault.load(REFUSALS_CHAIN);
    const chains = await verifyRows(learn, { chain: LEARN_CHAIN });
    const roseCheck = await verifyRoseRows(rose);
    let prevented = null;
    if (learn.some((row) => row && row.k === "memory_prevented")) {
      prevented = await verifyPreventedEdges(learn, refusals);
      if (!prevented.ok) {
        chains.ok = false;
        for (const err of prevented.errors) {
          chains.breaks.push({ chain: LEARN_CHAIN, seq: err.seq, reason: err.code });
        }
      }
    }
    const roseHashes = new Set(rose.filter((row) => row && row.transition_hash).map((row) => row.transition_hash));
    if (chains.ok) {
      for (let i = 0; i < learn.length; i++) {
        const stamp = learn[i];
        if (stamp && stamp.rose_transition_hash && !roseHashes.has(stamp.rose_transition_hash)) {
          chains.ok = false;
          chains.breaks.push({ chain: LEARN_CHAIN, seq: i, reason: "rose-tip-missing" });
          break;
        }
      }
    }
    return {
      ok: chains.ok && roseCheck.ok,
      spec: AKM_SPEC,
      author: AKM_AUTHOR,
      software_tab: false,
      fail_closed: true,
      learn: chains,
      rose: roseCheck,
      prevented,
      ...memoryLedgerHonesty(),
      belief_is_not_truth: true,
      authorizes_action: false,
    };
  }

  async hydrate() {
    const verified = await this.verify();
    if (!verified.ok) {
      this.index.reset();
      this.hydrated = false;
      return refuse("CHAIN_VERIFY_FAIL", "ChainLock verify failed. The Belief List was not rebuilt from a broken ledger.", {
        verify: verified,
      });
    }
    const rows = await this.vault.load(LEARN_CHAIN);
    const rebuilt = await this.index.rebuild(rows);
    this.hydrated = true;
    return { ...rebuilt, ...memoryLedgerHonesty({ rebuilt: true }) };
  }

  async ensureIndex() {
    if (this.hydrated) return { ok: true };
    return this.hydrate();
  }

  async roseTip() {
    const rows = await this.vault.load(ROSE_CHAIN);
    if (!rows.length) return GENESIS;
    const last = rows[rows.length - 1];
    return last && last.transition_hash ? last.transition_hash : GENESIS;
  }

  async forwardLearn(input) {
    const caps = capabilitiesOf(input);
    if (hasCap(caps, "MODEL_UPDATE") && input.k !== "calibration_update") {
      return refuse("AKM-CAPABILITY", "MODEL_UPDATE is not granted by recall or observe. No automatic model update.", {
        required: "CALIBRATE",
      });
    }
    const fact = clip(input.fact, FACT_CAP);
    if (!fact) return refuse("AKM-NO-FACT", "Observation requires a fact. Hash-only cards are non-compliant.");
    const committed = await this.vault.commitLearnAndRose(async ({ learnRows, roseRows }) => {
      const learnCheck = await verifyRows(learnRows, { chain: LEARN_CHAIN });
      const roseCheck = await verifyRoseRows(roseRows);
      if (!learnCheck.ok || !roseCheck.ok) {
        return refuse("CHAIN_VERIFY_FAIL", "ChainLock verify failed. Refusing to append onto a broken ledger.", {
          verify: { learn: learnCheck, rose: roseCheck },
        });
      }
      const tip = roseRows.length ? roseRows[roseRows.length - 1].transition_hash : GENESIS;
      if (input.expected_rose_tip && input.expected_rose_tip !== tip) {
        return refuse(
          "AKM-CONFLICT",
          "Two calibration writes against the same local Rose tip cannot both silently commit. Re-read and construct a new forward transition.",
          { expected: input.expected_rose_tip, tip },
        );
      }
      const deltaHash = await hashMemoryDelta({
        k: input.k,
        memory_id: input.memory && input.memory.memory_id,
        prior: input.prior_hash || null,
        posterior: input.posterior_hash || null,
      });
      const rose = await composeRose(
        { action: input.k, result_hash: deltaHash },
        { prev: tip || GENESIS, seq: roseRows.length },
      );
      const learnPrev = learnRows.length ? learnRows[learnRows.length - 1].stamp_sha256 : GENESIS;
      const stamp = await composeLearnStamp(
        {
          k: input.k,
          subject: clip(input.subject, SUBJECT_CAP),
          fact,
          memory: input.memory,
          rose_transition_hash: rose.transition_hash,
          provenance_hash: input.provenance_hash,
        },
        { prev: learnPrev || GENESIS },
      );
      return { ok: true, rose, stamp };
    });
    if (!committed || committed.ok === false) return committed;
    const hydrated = await this.hydrate();
    if (hydrated.ok === false) return hydrated;
    const { stamp, rose, seq } = committed;
    return {
      ok: true,
      spec: AKM_SPEC,
      author: AKM_AUTHOR,
      software_tab: false,
      ...memoryLedgerHonesty(),
      authorizes_action: false,
      belief_is_not_truth: true,
      chainlock: { id: stamp.id, h: stamp.stamp_sha256, seq, c: LEARN_CHAIN },
      roseclock: {
        hash: rose.transition_hash,
        sequence: rose.seq,
        rollback: false,
        local: true,
        hosted_roseclock: false,
      },
      temporal: { hash: null, status: "SLOT" },
      memory_id: input.memory && input.memory.memory_id,
      node: this.index.get(input.memory && input.memory.memory_id),
    };
  }

  dryGuard(op, packet) {
    if (!isTruthyFlag(packet && packet.dry_run)) return null;
    return {
      ok: true,
      dry_run: true,
      mutated: false,
      code: AKM_DRY_RUN,
      spec: AKM_SPEC,
      author: AKM_AUTHOR,
      software_tab: false,
      op: String(op || ""),
      would: {
        op: String(op || ""),
        subject: packet.subject || packet.s || null,
        fact: packet.fact || packet.f || packet.claim || null,
        memory_id: packet.memory_id || packet.id || null,
      },
      ...memoryLedgerHonesty(),
      authorizes_action: false,
      belief_is_not_truth: true,
      note: "Preview only. dry_run does not write the learn ledger or the Belief List.",
    };
  }

  async observe(src = {}) {
    const packet = src && typeof src === "object" ? src : {};
    const preview = this.dryGuard("observe", packet);
    if (preview) return preview;
    const ready = await this.ensureIndex();
    if (ready.ok === false) return ready;
    if (packet.kind === "prevented") {
      return refuse(
        "AKM-PREVENTED-NO-RECEIPT",
        "kind=prevented needs a sealed refusal row on the local refusals chain. This standalone does not mint refusal receipts.",
        { written: false, spec_edge: "AKM-PREVENTED-EDGE-1.0" },
      );
    }
    const subject = clip(packet.subject || packet.s || "observation", SUBJECT_CAP);
    const fact = clip(packet.fact || packet.f || packet.claim || subject, FACT_CAP);
    if (!fact) return refuse("AKM-NO-FACT", "Observation requires a fact. Hash-only cards are non-compliant.");
    const memory_id = packet.memory_id || this.index.bySubject(subject)?.memory_id || this.index.findOrCreateId(subject);
    const provenance_hash = packet.provenance_hash || (await sha256Hex(canonicalize({ subject, fact })));
    return this.forwardLearn({
      k: "memory_observation",
      subject,
      fact,
      provenance_hash,
      capabilities: packet.capabilities,
      expected_rose_tip: packet.expected_rose_tip,
      memory: {
        memory_id,
        kind: "memory_observation",
        subject_key: subject,
        relation_key: packet.relation_key || null,
        object_key: packet.object_key || null,
        use_case: classifyUseCase(packet, "observe").id,
      },
    });
  }

  async resolve(src = {}) {
    const packet = src && typeof src === "object" ? src : {};
    const preview = this.dryGuard("resolve", packet);
    if (preview) return preview;
    const ready = await this.ensureIndex();
    if (ready.ok === false) return ready;
    const subject = clip(packet.subject || packet.s || "resolution", SUBJECT_CAP);
    const memory_id = packet.memory_id || this.index.bySubject(subject)?.memory_id;
    if (!memory_id || (packet.memory_id && !this.index.get(packet.memory_id) && !this.index.bySubject(subject))) {
      return refuse("AKM-NO-MEMORY", "Resolution requires memory_id or an observed subject.", memoryLedgerHonesty());
    }
    const id = this.index.get(memory_id) ? memory_id : this.index.bySubject(subject).memory_id;
    const label = String(packet.outcome_label || "").toUpperCase();
    const unknown = label === "UNKNOWN" || packet.outcome === "UNKNOWN" || packet.outcome == null;
    if (unknown && packet.treat_unknown_as_miss === true) {
      return refuse("AKM-UNKNOWN", "UNKNOWN does not count as failure or success.");
    }
    const fact = clip(packet.fact || `resolution ${unknown ? "UNKNOWN" : packet.outcome}`, FACT_CAP);
    const quality = [packet.completeness, packet.provenance, packet.source_quality, packet.chain_integrity].filter((v) => v != null);
    const weight = packet.weight != null ? packet.weight : evidenceWeight(quality);
    return this.forwardLearn({
      k: "memory_resolution",
      subject,
      fact,
      provenance_hash: packet.provenance_hash || packet.evidence_hash,
      capabilities: packet.capabilities,
      expected_rose_tip: packet.expected_rose_tip,
      memory: {
        memory_id: id,
        kind: "memory_resolution",
        outcome: unknown ? "UNKNOWN" : clip01(packet.outcome),
        outcome_label: unknown ? "UNKNOWN" : label || "GRADED",
        weight,
        evidence_hash: packet.evidence_hash || packet.provenance_hash,
        ai_generated: Boolean(packet.ai_generated),
        self_corroboration: Boolean(packet.self_corroboration),
      },
    });
  }

  async kindEvent(src, kind, factDefault) {
    const packet = src && typeof src === "object" ? src : {};
    const preview = this.dryGuard(kind, packet);
    if (preview) return preview;
    const ready = await this.ensureIndex();
    if (ready.ok === false) return ready;
    const subject = clip(packet.subject || packet.s || kind, SUBJECT_CAP);
    const memory_id = packet.memory_id || this.index.bySubject(subject)?.memory_id;
    if (!memory_id) return refuse("AKM-NO-MEMORY", `${kind} requires memory_id or an observed subject.`, memoryLedgerHonesty());
    return this.forwardLearn({
      k: kind,
      subject,
      fact: clip(packet.fact || factDefault, FACT_CAP),
      provenance_hash: packet.provenance_hash || packet.evidence_hash,
      capabilities: packet.capabilities,
      expected_rose_tip: packet.expected_rose_tip,
      memory: {
        memory_id,
        kind,
        supersedes: packet.supersedes || (kind === "memory_supersede" ? memory_id : null),
        useful: packet.useful,
        relevant: packet.relevant,
      },
    });
  }

  support(src) {
    return this.kindEvent(src, "memory_support", "support");
  }
  contradict(src) {
    return this.kindEvent(src, "memory_contradiction", "contradiction");
  }
  async supersede(src = {}) {
    const marked = await this.kindEvent(src, "memory_supersede", "supersede");
    if (!marked.ok) return marked;
    if (src.successor_fact || src.successor_subject) {
      const successor = await this.observe({
        subject: src.successor_subject || `${src.subject || "memory"}-successor`,
        fact: src.successor_fact || src.fact,
        use_case: src.use_case,
        capabilities: src.capabilities,
      });
      return { ...marked, successor: successor.ok ? successor : null, successor_error: successor.ok ? undefined : successor };
    }
    return marked;
  }
  revoke(src) {
    return this.kindEvent(src, "memory_revoke", "revoke");
  }
  feedback(src) {
    return this.kindEvent(src, "retrieval_feedback", "retrieval feedback");
  }

  async calibrate(src = {}) {
    const packet = src && typeof src === "object" ? src : {};
    const preview = this.dryGuard("calibrate", packet);
    if (preview) return preview;
    const caps = capabilitiesOf(packet);
    if (hasCap(caps, "MODEL_UPDATE")) {
      return refuse("AKM-NO-AUTO-MODEL", "No automatic model update without tests. Calibrators cannot self-grant MODEL_UPDATE.", {
        required: "CALIBRATE",
      });
    }
    const verified = await this.verify();
    if (!verified.ok) return refuse("CHAIN_VERIFY_FAIL", "ChainLock verify failed. Adaptive path is closed.", { verify: verified });
    await this.hydrate();
    const subject = clip(packet.subject || packet.s || "calibration", SUBJECT_CAP);
    const memory_id = packet.memory_id || this.index.bySubject(subject)?.memory_id || this.index.findOrCreateId(subject);
    const node = this.index.get(memory_id);
    const useCase = classifyUseCase(packet, packet.operation || "calibrate");
    const posterior = rebuildPosterior(node ? node.resolutions : [], emptyPrior());
    const packetForProviders = {
      ...packet,
      alpha: posterior.alpha,
      beta: posterior.beta,
      posterior_probability: posterior.probability,
      effective_observations: posterior.effective_observations,
      effective_n: posterior.effective_observations,
    };
    const features = await providersFor(useCase, packetForProviders);
    const availability = inspectAvailability(packetForProviders, useCase, features.invoked);
    const selection = selectThreeOfFour(useCase, availability, posterior.effective_observations);
    const channel_scores = { ...features.scores, B: posterior.reliability };
    const triad = assembleTriadDecision({
      use_case: useCase,
      packet: packetForProviders,
      availability,
      effective_observations: posterior.effective_observations,
      channel_scores,
      providers_invoked: features.invoked,
      evidence_refs: features.refs,
      chain_refs: node ? node.source_chain_hashes.slice(-4) : [],
    });
    const prior_hash = node ? node.index_hash : null;
    const posterior_hash = await hashMemoryDelta({
      alpha: posterior.alpha,
      beta: posterior.beta,
      probability: posterior.probability,
      triad: triad.triad_score,
    });
    const fact = clip(
      triad.ok
        ? `calibrate ${memory_id} triad=${triad.triad_score} B=${posterior.probability.toFixed(3)}`
        : `calibrate ${memory_id} TRIAD_INCOMPLETE`,
      FACT_CAP,
    );
    const out = await this.forwardLearn({
      k: "calibration_update",
      subject,
      fact,
      provenance_hash: packet.provenance_hash,
      capabilities: packet.capabilities || ["CALIBRATE"],
      expected_rose_tip: packet.expected_rose_tip,
      prior_hash,
      posterior_hash,
      memory: {
        memory_id,
        kind: "calibration_update",
        subject_key: node ? node.subject_key : subject,
        prior_hash,
        posterior_hash,
        channel_scores,
        latest_triad: triad,
        retrieval_weight: posterior.reliability,
        calibration_version: CALIBRATION_MANIFEST_VERSION,
        providers_invoked: features.invoked,
      },
    });
    if (!out.ok) return out;
    return { ...out, posterior, triad, providers_invoked: features.invoked, selection };
  }

  async recall(src = {}) {
    const verified = await this.verify();
    if (!verified.ok) {
      return refuse("CHAIN_VERIFY_FAIL", "ChainLock verify failed. Adaptive cards are not served from a broken ledger.", {
        verify: verified,
      });
    }
    await this.hydrate();
    const rows = await this.vault.load(LEARN_CHAIN);
    const q = String(src.q || src.query || "").toLowerCase();
    const depth = src.depth != null ? Math.max(0, Math.min(5, Number(src.depth))) : 5;
    const window = depth === 0 ? rows.slice(-1) : rows.slice(-Math.max(1, depth === 5 ? rows.length : depth));
    const facts = [];
    for (const stamp of window) {
      if (!stamp || stamp._broken) continue;
      const card = toCard(stamp);
      if (!card) continue;
      if (q && !String(card.s || "").toLowerCase().includes(q) && !String(card.f || "").toLowerCase().includes(q)) continue;
      facts.push(card);
    }
    if (!facts.length) {
      return { ok: false, refuse: "no-stamp", code: "AKM-NO-STAMP", spec: AKM_SPEC, belief_is_not_truth: true, authorizes_action: false };
    }
    const useCase = classifyUseCase(src, src.operation || "recall");
    const history = Boolean(src.history);
    const ranked = [];
    for (const card of facts) {
      const node = this.index.byChainHash(card.h) || this.index.bySubject(card.s);
      const scored = retrievalScore({
        relevance: lexicalRelevance(src.q || src.query, card.s, card.f),
        posterior: node ? node.channel_scores.B ?? node.posterior_probability : 0.5,
        evidence: node && node.channel_scores.E != null ? node.channel_scores.E : 0.5,
        recency: recencyScore(card.t),
        triad_fit: node && node.latest_triad ? (node.latest_triad.use_case === useCase.id ? 1 : 0.5) : 0.5,
        status: node ? node.status : "ACTIVE",
        history,
        weights: RETRIEVAL_WEIGHTS,
      });
      ranked.push({
        card,
        node: node
          ? {
              memory_id: node.memory_id,
              status: node.status,
              posterior_probability: node.posterior_probability,
              effective_observations: node.effective_observations,
              brier_score: node.brier_score,
              latest_triad: node.latest_triad,
              channel_scores: node.channel_scores,
              index_hash: node.index_hash,
            }
          : null,
        score: scored.score,
        retrieval: scored,
        belief_is_not_truth: true,
      });
    }
    ranked.sort((a, b) => b.score - a.score);
    const cap = Math.min(MEMORY_CONTEXT_CAP, Number(src.limit) || MEMORY_CONTEXT_CAP);
    return {
      ok: true,
      spec: AKM_SPEC,
      adaptive: true,
      software_tab: false,
      author: AKM_AUTHOR,
      belief_is_not_truth: true,
      authorizes_action: false,
      verified: true,
      use_case: useCase.id,
      count: Math.min(ranked.length, cap),
      facts: ranked.slice(0, cap),
      ...memoryLedgerHonesty({ rebuilt: true }),
    };
  }

  explain(memoryId, view = "get") {
    const node = this.index.get(memoryId);
    if (!node) {
      return refuse("AKM-NOT-FOUND", "Unknown memory id.", {
        memory_id: memoryId,
        ...memoryLedgerHonesty(),
      });
    }
    const base = {
      ok: true,
      spec: AKM_SPEC,
      author: AKM_AUTHOR,
      software_tab: false,
      ...memoryLedgerHonesty(),
      authorizes_action: false,
      belief_is_not_truth: true,
      memory_id: node.memory_id,
      status: node.status,
    };
    if (view === "history") {
      return { ...base, events: node.events, source_chain_hashes: node.source_chain_hashes, resolutions: node.resolutions };
    }
    if (view === "calibration") {
      return {
        ...base,
        alpha: node.alpha,
        beta: node.beta,
        posterior_probability: node.posterior_probability,
        posterior_variance: node.posterior_variance,
        effective_observations: node.effective_observations,
        brier_score: node.brier_score,
        channel_scores: node.channel_scores,
        latest_triad: node.latest_triad,
        index_hash: node.index_hash,
        retrieval_weight: node.retrieval_weight,
        calibration_version: node.retrieval_version,
        note: "posterior_probability is calibrated belief, not truth.",
      };
    }
    return { ...base, node };
  }

  async rebuildIndex() {
    const rebuilt = await this.hydrate();
    if (rebuilt.ok === false) return rebuilt;
    return {
      ok: true,
      spec: AKM_SPEC,
      author: AKM_AUTHOR,
      software_tab: false,
      local: true,
      operator_door: false,
      ...rebuilt,
    };
  }

  health() {
    return {
      ok: true,
      spec: AKM_SPEC,
      version: AKM_VERSION,
      author: AKM_AUTHOR,
      software_tab: false,
      name: MEMORY_NAME,
      slug: MEMORY_SLUG,
      nodes: this.index.all().length,
      manifest: manifestView(),
      learn_kinds: LEARN_KINDS.slice(),
      stub_ops: MEMORY_STUB_OPS.slice(),
      ...memoryLedgerHonesty(),
      note: "Posterior is calibrated belief, not truth. The learn ledger is append-only. Rewrite and delete stay refused.",
    };
  }

  skill() {
    return {
      ok: true,
      spec: AKM_SPEC,
      software_tab: false,
      markdown: `# Adaptive Knowledge Memory (AKM-TRIAD-1.0)

Local recollection over an append-only ChainLock learn ledger. The Bayesian posterior is calibrated belief, not truth. The Belief List is rebuilt from that ledger. History rewrite and delete stay refused.

This process is not a hosted FragGate door. software_tab is false.

Author: **Aziel Eliab** only. Apache-2.0. Forks are always allowed.
`,
    };
  }

  async run(op, payload = {}) {
    const src = payload && typeof payload === "object" ? payload : {};
    const action = String(op || "").trim().replace(/_/g, "-");
    const stubNames = new Set(MEMORY_STUB_OPS.flatMap((name) => [name, name.replace(/_/g, "-")]));
    if (stubNames.has(action) || stubNames.has(String(op || "").trim())) {
      return refuse("AKM-STUB", `${action} is refused. No rollback, no history rewrite, no automatic model update.`, {
        written: false,
        mutated: false,
      });
    }
    if (action === "lattice-learn") {
      return refuse(
        "AKM-SLOT",
        "lattice-learn (LATTICE-LEARN-1.0) needs the runtime dual hash lattice. This local JSONL ledger has no lattice block, so nothing was written.",
        { written: false, spec_edge: "LATTICE-LEARN-1.0", status: "SLOT" },
      );
    }
    if (MEMORY_WRITE_OPS.includes(action) && isTruthyFlag(src.dry_run)) {
      return {
        ok: true,
        dry_run: true,
        mutated: false,
        code: AKM_DRY_RUN,
        spec: AKM_SPEC,
        author: AKM_AUTHOR,
        software_tab: false,
        op: action,
        would: {
          op: action,
          subject: src.subject || src.s || null,
          fact: src.fact || src.f || src.claim || null,
          memory_id: src.memory_id || src.id || null,
        },
        ...memoryLedgerHonesty(),
        authorizes_action: false,
        belief_is_not_truth: true,
        note: "Preview only. dry_run does not write the learn ledger or the Belief List.",
      };
    }
    if (action === "health") return this.health();
    if (action === "skill") return this.skill();
    if (action === "verify") return this.verify();
    if (action === "observe") return this.observe(src);
    if (action === "resolve") return this.resolve(src);
    if (action === "calibrate") return this.calibrate(src);
    if (action === "recall") return this.recall(src);
    if (action === "support") return this.support(src);
    if (action === "contradict") return this.contradict(src);
    if (action === "supersede") return this.supersede(src);
    if (action === "revoke") return this.revoke(src);
    if (action === "feedback") return this.feedback(src);
    if (action === "get") return this.explain(src.memory_id || src.id, src.view || "get");
    if (action === "history") return this.explain(src.memory_id || src.id, "history");
    if (action === "calibration") return this.explain(src.memory_id || src.id, "calibration");
    if (action === "rebuild-index") return this.rebuildIndex();
    return refuse("AKM-UNKNOWN-OP", `Unknown memory op ${JSON.stringify(op || "")}.`, {
      ops: MEMORY_CANONICAL_OPS.slice(),
    });
  }
}

export async function openMemory(options = {}) {
  const dir = options.dataDir || options.dir;
  if (!dir) throw new Error("openMemory requires dataDir");
  const app = new MemoryApp(new Vault(dir));
  await app.hydrate();
  return app;
}

export {
  assembleTriadDecision,
  inspectAvailability,
  selectThreeOfFour,
  LEARN_KINDS,
  manifestView,
};
