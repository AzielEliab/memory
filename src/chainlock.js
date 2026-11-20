/**
 * Local ChainLock learn ledger (CL-WP-0.4 hash rules, JSONL on disk).
 *
 * Append-only. There is no delete and no in-place rewrite.
 * Verify fails closed on an unreadable row, a broken prev link,
 * a stamp-hash miss, or a fact-hash miss.
 *
 * This file is the durable source for one local process. It is not a
 * Cloudflare Durable Object and it does not pretend isolate memory is durable.
 * Dual lattice / LOCKSET stay SLOT in this standalone.
 * Author: Aziel Eliab. SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { canonicalize, sha256Hex } from "./canon.js";
import { boundMemoryMeta } from "./meta.js";

export const CL_VERSION = "CL-0.4";
export const CL_SPEC = "CL-WP-0.4";
export const CL_AUTHOR = "Aziel Eliab";
export const CL_NAMESPACE = "chainlock@aziel";
export const GENESIS = "GENESIS";
export const SUBJECT_CAP = 80;
export const FACT_CAP = 160;
export const LEARN_CHAIN = "learn";
export const REFUSALS_CHAIN = "refusals";
export const ROSE_CHAIN = "rose";

export function clip(text, cap) {
  const s = text == null ? "" : String(text);
  if (s.length <= cap) return s;
  return s.slice(0, cap);
}

export function hashFieldsOf(obj) {
  const skip = new Set(["stamp_sha256", "hash", "h", "lockset_sha256"]);
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (skip.has(k) || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export async function stampSha256(stamp) {
  return sha256Hex(canonicalize(hashFieldsOf(stamp)));
}

export async function factHash(fact) {
  return sha256Hex(clip(fact, FACT_CAP));
}

function newId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return prefix + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseJsonl(raw) {
  const text = raw == null ? "" : String(raw);
  if (!text.trim()) return [];
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try {
      rows.push(JSON.parse(s));
    } catch {
      rows.push({ _broken: true, raw: s });
    }
  }
  return rows;
}

function withLock(locks, key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(key, run.then(() => {}, () => {}));
  return run;
}

export class Vault {
  constructor(dir) {
    this.dir = path.resolve(dir);
    this.locks = new Map();
  }

  chainPath(name) {
    const safe = String(name || "").replace(/[^a-z0-9_-]/gi, "");
    if (!safe) throw new Error("chain name required");
    return path.join(this.dir, "chains", `${safe}.jsonl`);
  }

  async load(name) {
    try {
      const raw = await readFile(this.chainPath(name), "utf8");
      return parseJsonl(raw);
    } catch (err) {
      if (err && err.code === "ENOENT") return [];
      throw err;
    }
  }

  async readBytes(name) {
    try {
      return await readFile(this.chainPath(name));
    } catch (err) {
      if (err && err.code === "ENOENT") return Buffer.alloc(0);
      throw err;
    }
  }

  async _appendUnlocked(name, record) {
    const file = this.chainPath(name);
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify(record) + "\n", "utf8");
    return record;
  }

  /**
   * Append rose then learn under one lock, after the caller has read the
   * current tips. There is no method that rewrites or deletes a line.
   */
  async commitLearnAndRose(build) {
    return withLock(this.locks, "learn+rose", async () => {
      const learnRows = await this.load(LEARN_CHAIN);
      const roseRows = await this.load(ROSE_CHAIN);
      const built = await build({ learnRows, roseRows });
      if (!built || built.ok === false) return built || { ok: false, refuse: "no-record" };
      await this._appendUnlocked(ROSE_CHAIN, built.rose);
      await this._appendUnlocked(LEARN_CHAIN, built.stamp);
      return { ok: true, rose: built.rose, stamp: built.stamp, seq: learnRows.length + 1 };
    });
  }
}

/**
 * Walk a chain. The first break closes the walk: ok is false and later
 * rows are not treated as a new valid tip.
 */
export async function verifyRows(rows, { chain = LEARN_CHAIN } = {}) {
  let prev = GENESIS;
  const breaks = [];
  const list = Array.isArray(rows) ? rows : [];
  for (let i = 0; i < list.length; i++) {
    const stamp = list[i];
    if (!stamp || stamp._broken) {
      breaks.push({ chain, seq: i, reason: "unreadable" });
      break;
    }
    const expectedPrev = stamp.prev || GENESIS;
    if (expectedPrev !== prev) {
      breaks.push({ chain, seq: i, id: stamp.id, reason: "broken-prev", expected: prev, got: expectedPrev });
      break;
    }
    const recomputed = await stampSha256(stamp);
    if (recomputed !== stamp.stamp_sha256) {
      breaks.push({ chain, seq: i, id: stamp.id, reason: "stamp-hash-miss" });
      break;
    }
    if (chain !== ROSE_CHAIN) {
      const fh = await factHash(stamp.fact);
      if (fh !== stamp.fh) {
        breaks.push({ chain, seq: i, id: stamp.id, reason: "body-hash-miss" });
        break;
      }
    }
    prev = chain === ROSE_CHAIN ? stamp.transition_hash : stamp.stamp_sha256;
  }
  return {
    ok: breaks.length === 0,
    v: CL_VERSION,
    spec: CL_SPEC,
    chain,
    count: list.length,
    tip: list.length && breaks.length === 0 ? prev : null,
    breaks,
    fail_closed: true,
  };
}

export async function verifyRoseRows(rows) {
  let prev = GENESIS;
  const breaks = [];
  const list = Array.isArray(rows) ? rows : [];
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || row._broken) {
      breaks.push({ chain: ROSE_CHAIN, seq: i, reason: "unreadable" });
      break;
    }
    if ((row.prev || GENESIS) !== prev) {
      breaks.push({ chain: ROSE_CHAIN, seq: i, reason: "broken-prev", expected: prev, got: row.prev || null });
      break;
    }
    const unsigned = { ...row };
    delete unsigned.transition_hash;
    const recomputed = await sha256Hex(canonicalize(unsigned));
    if (recomputed !== row.transition_hash) {
      breaks.push({ chain: ROSE_CHAIN, seq: i, reason: "stamp-hash-miss" });
      break;
    }
    prev = row.transition_hash;
  }
  return { ok: breaks.length === 0, chain: ROSE_CHAIN, count: list.length, tip: breaks.length === 0 ? prev : null, breaks, fail_closed: true };
}

export async function composeLearnStamp(src, { prev }) {
  const subject = clip(src && (src.subject || src.s), SUBJECT_CAP);
  const fact = clip(src && (src.fact || src.f), FACT_CAP);
  const unsigned = {
    v: CL_VERSION,
    spec: CL_SPEC,
    local: "jsonl",
    hosted_durable_object: false,
    dual_lattice: "SLOT",
    id: (src && src.id) || newId("cl_"),
    c: LEARN_CHAIN,
    k: (src && src.k) || "stamp",
    t: (src && src.t) || new Date().toISOString(),
    prev: prev || GENESIS,
    subject,
    fact,
    ns: CL_NAMESPACE,
    author: CL_AUTHOR,
  };
  if (src && src.rose_transition_hash) unsigned.rose_transition_hash = String(src.rose_transition_hash);
  if (src && src.provenance_hash) unsigned.provenance_hash = String(src.provenance_hash);
  if (src && src.temporal_hash) unsigned.temporal_hash = String(src.temporal_hash);
  if (src && src.memory != null) {
    const memory = boundMemoryMeta(src.memory);
    if (memory) unsigned.memory = memory;
  }
  unsigned.fh = await factHash(fact);
  unsigned.stamp_sha256 = await stampSha256(unsigned);
  return unsigned;
}

export async function composeRose(src, { prev, seq }) {
  const unsigned = {
    v: "ROSE-LOCAL-0.1",
    spec: "ROSE-LOCAL",
    hosted_roseclock: false,
    rollback: false,
    seq,
    prev: prev || GENESIS,
    action: String(src.action || "learn"),
    action_class: "LEARN",
    result_hash: String(src.result_hash || ""),
  };
  unsigned.transition_hash = await sha256Hex(canonicalize(unsigned));
  return unsigned;
}

export function toCard(stamp) {
  if (!stamp || stamp._broken) return null;
  const fact = clip(stamp.fact, FACT_CAP);
  if (!fact || !stamp.stamp_sha256 || !stamp.fh) return null;
  return {
    id: stamp.id,
    c: stamp.c,
    k: stamp.k || "stamp",
    t: stamp.t,
    h: stamp.stamp_sha256,
    fh: stamp.fh,
    s: clip(stamp.subject, SUBJECT_CAP),
    f: fact,
    g: "h+fh",
  };
}
