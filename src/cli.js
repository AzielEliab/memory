#!/usr/bin/env node
/**
 * memory CLI. Local AKM-TRIAD-1.0 ledger. Not a hosted FragGate door.
 * Author: Aziel Eliab. SPDX-License-Identifier: Apache-2.0
 */

import { openMemory } from "./memory.js";
import { startServer } from "./http.js";

function usage() {
  return `memory — AKM-TRIAD-1.0 local adaptive knowledge memory

Posterior is calibrated belief, not truth. The learn ledger is append-only.
Rewrite and delete stay refused. Forks are always allowed (Apache-2.0).

Usage:
  memory --data <dir> serve [--port 8788] [--host 127.0.0.1]
  memory --data <dir> health
  memory --data <dir> verify
  memory --data <dir> observe --subject <s> --fact <f>
  memory --data <dir> resolve --subject <s> --outcome <0..1> [--evidence-hash <hex>]
  memory --data <dir> resolve --subject <s> --unknown
  memory --data <dir> calibrate --subject <s> [--use-case <id>]
  memory --data <dir> recall [--q <text>]
  memory --data <dir> get --id <memory_id>
  memory --data <dir> history --id <memory_id>
  memory --data <dir> calibration --id <memory_id>
  memory --data <dir> contradict --subject <s>
  memory --data <dir> rebuild-index

Default data dir: ./vault or MEMORY_DATA.
`;
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  return argv[i + 1] ?? null;
}

function has(argv, name) {
  return argv.includes(name);
}

async function main(argv) {
  if (has(argv, "--help") || has(argv, "-h") || argv.length === 0) {
    process.stdout.write(usage());
    return 0;
  }
  const dataDir = arg(argv, "--data") || process.env.MEMORY_DATA || "vault";
  const cmd = argv.find((token) => !token.startsWith("-") && token !== arg(argv, "--data") && token !== arg(argv, "--port") && token !== arg(argv, "--host") && token !== arg(argv, "--subject") && token !== arg(argv, "--fact") && token !== arg(argv, "--outcome") && token !== arg(argv, "--id") && token !== arg(argv, "--q") && token !== arg(argv, "--use-case") && token !== arg(argv, "--evidence-hash"));
  const app = await openMemory({ dataDir });
  if (cmd === "serve") {
    const started = await startServer(app, { port: arg(argv, "--port") || 8788, host: arg(argv, "--host") || "127.0.0.1" });
    process.stdout.write(`memory listening on ${started.url}\nledger ${dataDir}\n`);
    return null;
  }
  let result;
  if (cmd === "health") result = app.health();
  else if (cmd === "verify") result = await app.verify();
  else if (cmd === "rebuild-index") result = await app.rebuildIndex();
  else if (cmd === "observe") {
    result = await app.observe({ subject: arg(argv, "--subject"), fact: arg(argv, "--fact"), use_case: arg(argv, "--use-case") });
  } else if (cmd === "resolve") {
    result = await app.resolve({
      subject: arg(argv, "--subject"),
      memory_id: arg(argv, "--id"),
      outcome: has(argv, "--unknown") ? "UNKNOWN" : arg(argv, "--outcome") != null ? Number(arg(argv, "--outcome")) : undefined,
      outcome_label: has(argv, "--unknown") ? "UNKNOWN" : undefined,
      evidence_hash: arg(argv, "--evidence-hash"),
    });
  } else if (cmd === "calibrate") {
    result = await app.calibrate({ subject: arg(argv, "--subject"), memory_id: arg(argv, "--id"), use_case: arg(argv, "--use-case"), fact: arg(argv, "--fact") });
  } else if (cmd === "recall") result = await app.recall({ q: arg(argv, "--q") });
  else if (cmd === "get") result = app.explain(arg(argv, "--id"), "get");
  else if (cmd === "history") result = app.explain(arg(argv, "--id"), "history");
  else if (cmd === "calibration") result = app.explain(arg(argv, "--id"), "calibration");
  else if (cmd === "contradict") result = await app.contradict({ subject: arg(argv, "--subject"), memory_id: arg(argv, "--id") });
  else {
    process.stderr.write(usage());
    return 2;
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result && result.ok === false ? 1 : 0;
}

const invoked = process.argv[1] && (process.argv[1].endsWith("/cli.js") || process.argv[1].endsWith("\\cli.js"));
if (invoked) {
  main(process.argv.slice(2)).then((code) => {
    if (code != null) process.exit(code);
  }).catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + "\n");
    process.exit(1);
  });
}

export { main };
