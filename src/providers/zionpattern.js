/**
 * ZionPattern provider (channel P). Domain-gated. Hard 75% cap is binding.
 *
 * The full zsolver case engine is not vendored here (SLOT). This provider
 * caps a caller-supplied pattern confidence. It does not solve cases and
 * it does not invent a confidence the caller did not supply.
 * Author: Aziel Eliab. SPDX-License-Identifier: Apache-2.0
 */

import { clip01 } from "../adaptive.js";
import { canonicalize, sha256Hex } from "../canon.js";

export const PROVIDER_ID = "zionpattern";
export const PROVIDER_VERSION = "P-ZP-1.0";
export const CHANNELS_SUPPORTED = Object.freeze(["P"]);
export const DOMAIN_CAP = 0.75;
export const FULL_ZSOLVER = "SLOT";

export function canScore(packet, useCase) {
  const src = packet && typeof packet === "object" ? packet : {};
  const has =
    src.answers ||
    src.document ||
    src.zion ||
    src.pattern_id ||
    (src.domain && String(src.domain).toLowerCase().includes("zion"));
  if (!has) return 0;
  const allowed = !useCase || (useCase.providers || []).includes(PROVIDER_ID);
  if (!allowed) return 0;
  return 0.8;
}

function suppliedConfidence(packet) {
  const src = packet && typeof packet === "object" ? packet : {};
  const zion = src.zion && typeof src.zion === "object" ? src.zion : {};
  const candidates = [zion.capped_confidence, zion.confidence, zion.pattern_score, src.pattern_score, src.capped_confidence];
  for (const value of candidates) {
    const n = clip01(value);
    if (n != null) return n;
  }
  return null;
}

export async function score(packet = {}) {
  const supplied = suppliedConfidence(packet);
  const raw = supplied == null ? 0.5 : supplied;
  const capped = Math.min(raw, DOMAIN_CAP);
  const receipt = await sha256Hex(
    canonicalize({
      provider: PROVIDER_ID,
      v: PROVIDER_VERSION,
      capped,
      cap: DOMAIN_CAP,
      supplied: supplied != null,
      full_zsolver: FULL_ZSOLVER,
    }),
  );
  return {
    channel: "P",
    score: clip01(capped),
    evidence_refs: [],
    limitations: [
      "ZionPattern is provisional and assistive only. Does not solve cases.",
      "Hard confidence cap 75% / uncertainty floor 25% is domain-binding.",
      "The full zsolver engine is SLOT in this standalone. A missing numeric confidence stays 0.5 before the cap. Nothing is invented as a solved case.",
    ],
    uncertainty: clip01(1 - capped),
    domain_cap: DOMAIN_CAP,
    full_zsolver: FULL_ZSOLVER,
    supplied_confidence: supplied != null,
    provider_id: PROVIDER_ID,
    provider_receipt_hash: receipt,
    raw: { capped_confidence: capped, raw_confidence: raw },
  };
}
