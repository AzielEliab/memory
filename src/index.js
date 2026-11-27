/**
 * Public library surface for the standalone memory app (AKM-TRIAD-1.0).
 * Author: Aziel Eliab. SPDX-License-Identifier: Apache-2.0. Forks always allowed.
 */

export {
  AKM_SPEC,
  AKM_AUTHOR,
  AKM_VERSION,
  MEMORY_NAME,
  MEMORY_SLUG,
  MEMORY_CANONICAL_OPS,
  MEMORY_STUB_OPS,
  MemoryApp,
  openMemory,
  refuse,
  memoryLedgerHonesty,
  assembleTriadDecision,
  selectThreeOfFour,
  inspectAvailability,
} from "./memory.js";

export { createMemory } from "./create.js";
export { startServer, dispatchMemoryHttp } from "./http.js";
export { Vault, verifyRows, verifyRoseRows, GENESIS } from "./chainlock.js";
export { rebuildPosterior, confidenceClass, computeTriadScore } from "./adaptive.js";
export { manifestView, classifyUseCase } from "./calibration-manifest.js";
