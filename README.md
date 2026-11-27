# memory

Standalone **AKM-TRIAD-1.0** adaptive knowledge memory by Aziel Eliab.

The learn ledger is an append-only ChainLock hash chain on disk (`vault/chains/learn.jsonl`). The Belief List is a cache rebuilt from that ledger (`rebuild-index`). A 3-of-4 triad (channels E, C, P, B) scores a belief only after suitability selects three adequate channels. Fewer than three adequate channels returns `TRIAD_INCOMPLETE` and does not fabricate a score.

**The Bayesian posterior is calibrated belief, not truth.** Every write and read carries `belief_is_not_truth: true` and `authorizes_action: false`. A high posterior with a small sample stays in confidence class `LOW`.

History is not rewritten. `rewrite`, `delete`, `rollback`, `model_update`, and `auto_update` return `AKM-STUB` and leave the ledger bytes unchanged. Verify fails closed on an unreadable row, a broken `prev` link, or a hash mismatch, and then refuses to append.

This repository is a local library, CLI, and loopback HTTP server. It is not a Softwares-tab product and it does not open a second FragGate door. `software_tab` stays false. The local Rose tip is a hash chain in this process's vault. Hosted RoseClock, TemporalLock receipts, and the dual hash lattice stay SLOT here. The full ZionPattern case solver stays SLOT; channel P from that provider is capped at 0.75 and does not solve a case.

Neighbor: [aziel-runtime](https://github.com/AzielEliab/aziel-runtime) fabric `memory` (`AKM-TRIAD-1.0`). Author: Aziel Eliab only.

## License

Apache-2.0. **Forks are always allowed.**

## Download tracker

Counted archive (HTTP 200, active upon Cloudflare deploy):

https://memory-download-tracker.vibelock.workers.dev/download

Stats (active upon Cloudflare deploy):

https://memory-download-tracker.vibelock.workers.dev/stats

Worker name: `memory-download-tracker`. KV namespace title to provision at deploy: `MEMORY_DOWNLOADS` (new namespace; do not reuse another product's id). This tree does not deploy the Worker.

## Install

Node.js 20 or newer.

```bash
npm install
node src/cli.js --data ./vault health
```

From the counted archive, after deploy:

```bash
curl -fsSL -A 'Mozilla/5.0' https://memory-download-tracker.vibelock.workers.dev/install.sh | bash
```

Rebuild the archive this Worker serves:

```bash
npm run pack
```

That writes `workers/download-tracker/public/memory-0.1.0.tar.gz` from package.json version **0.1.0**.

## Library

```js
import { createMemory } from "./src/index.js";

const memory = await createMemory({ dataDir: "./vault" });
const observed = await memory.observe({
  subject: "harbor",
  fact: "the tide table matched the log",
});
await memory.resolve({
  memory_id: observed.memory_id,
  outcome: 1,
  evidence_hash: "a".repeat(64),
});
const calibrated = await memory.calibrate({
  memory_id: observed.memory_id,
  use_case: "forensic_evidence",
  completeness: 0.8,
});
// calibrated.posterior.probability is belief, not truth
// calibrated.triad is null-scored when the triad is incomplete
```

`dry_run: true` on a write returns `AKM-DRY-RUN` and does not append.

## CLI

```bash
node src/cli.js --data ./vault observe --subject harbor --fact "the tide table matched the log"
node src/cli.js --data ./vault resolve --subject harbor --outcome 1 --evidence-hash aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
node src/cli.js --data ./vault calibrate --subject harbor --use-case forensic_evidence
node src/cli.js --data ./vault recall --q tide
node src/cli.js --data ./vault get --id akm_...
node src/cli.js --data ./vault history --id akm_...
node src/cli.js --data ./vault calibration --id akm_...
node src/cli.js --data ./vault rebuild-index
node src/cli.js --data ./vault verify
node src/cli.js --data ./vault serve --port 8788
```

`serve` listens on `127.0.0.1:8788`.

## HTTP

| Method | Path | Effect |
|--------|------|--------|
| GET | `/v1/memory` | Health: spec, node count, manifest, ledger honesty |
| POST | `/v1/memory/observe` | Append `memory_observation` |
| POST | `/v1/memory/resolve` | Append `memory_resolution` and rebuild the posterior |
| POST | `/v1/memory/calibrate` | Append `calibration_update` with a 3-of-4 triad |
| POST | `/v1/memory/recall` | Rank stamped cards after verify |
| POST | `/v1/memory/rebuild-index` | Rebuild the Belief List from the learn ledger |
| GET | `/v1/memory/:id` | Node |
| GET | `/v1/memory/:id/history` | Events and resolutions |
| GET | `/v1/memory/:id/calibration` | Posterior, variance, triad |
| POST | `/v1/memory/delete` `/update` `/rewrite` `/rollback` `/model_update` | `AKM-STUB` (400). Ledger unchanged |

```bash
curl -s http://127.0.0.1:8788/v1/memory
curl -s -X POST http://127.0.0.1:8788/v1/memory/observe \
  -H 'content-type: application/json' \
  -d '{"subject":"harbor","fact":"the tide table matched the log"}'
```

## Tests

```bash
npm test
```
