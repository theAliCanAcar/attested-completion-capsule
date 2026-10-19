# Attested Completion Capsule

Portable unsigned integrity manifest for verified deliveries.

Standalone ES module. No npm install required. Works in **Node.js 20+** and modern browsers (serve over HTTP for browser demos).

## Included files

This repository vendors local dependencies needed by the module:

- `attested-completion-capsule.js` (main)
- `artifact-freshness-guard.js`
- `completion-receipt.js`
- `evidence-ledger.js`

## Install / import

Copy the files into your project, or clone this repository:

```js
import { createCompletionCapsule, verifyCompletionCapsule } from './attested-completion-capsule.js';
import { createContract } from './dod-contract.js';
import { fingerprint } from './artifact-freshness-guard.js';

const contract = createContract({ id: 'invoice', task: 'Deliver invoice', criteria: [{ id: 'total', description: 'Total must be 42' }] });
const artifacts = { 'invoice.json': '{"total":42}' };
const runId = 'run-1', runnerId = 'local-checker';
const evidence = [{ id: 'result-1', criterionId: 'total', contractId: 'invoice', runId, runnerId,
  artifactId: 'invoice.json', fingerprint: await fingerprint(artifacts['invoice.json']),
  passed: JSON.parse(artifacts['invoice.json']).total === 42, createdAt: new Date().toISOString(),
  command: 'JSON.parse(invoice).total === 42' }];
const capsule = await createCompletionCapsule({ contract, runId, runnerId, evidence, artifacts });
const result = await verifyCompletionCapsule({ capsule, expectedContract: contract,
  expectedRunId: runId, expectedRunnerId: runnerId, artifacts });
console.log(result.valid, result.authenticated); // true, false: unsigned integrity only
console.log(JSON.stringify(capsule, null, 2));
```

## Use cases

### 1. Deliver a portable completion manifest

- **Scenario:** Another program needs to validate the exact artifact being handed over.
- **Outcome:** Verify contract, run, evidence, and delivered artifact hashes from an unsigned JSON capsule.

### 2. Reject a tampered handoff

- **Scenario:** A delivered artifact or mandatory criterion differs from the expected contract.
- **Outcome:** Independently reject the capsule; an unsigned runner label does not authenticate origin.

## Exports

- `createCompletionCapsule`
- `verifyCompletionCapsule`

## Notes

- Keep API keys and secrets out of this module and out of browser storage.
- Treat verification callbacks, ledger writers, and permission checks as trusted application code.
- This library is intentional local reliability plumbing, not a claim of cryptographic attestation unless stated in the source comments.

## License

MIT
