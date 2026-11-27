/**
 * createMemory is the library entry used by applications that embed the ledger.
 * Author: Aziel Eliab. SPDX-License-Identifier: Apache-2.0
 */

import { openMemory } from "./memory.js";

export async function createMemory(options = {}) {
  return openMemory(options);
}
