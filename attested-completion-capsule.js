import { fingerprint } from './artifact-freshness-guard.js';
import { createCompletionReceipt } from './completion-receipt.js';
import { validateEvidence } from './evidence-ledger.js';

const copy = value => JSON.parse(JSON.stringify(value));
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const required = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required`); };
async function hashes(artifacts) {
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) throw new TypeError('Artifact map is required');
  return Object.fromEntries(await Promise.all(Object.keys(artifacts).sort().map(async name => [name, await fingerprint(artifacts[name])])));
}
function validateRecords({ contract, evidence, runId, runnerId }) {
  if (!Array.isArray(evidence)) throw new TypeError('Evidence array is required');
  const ids = new Set(), criteria = new Set();
  for (const entry of evidence) {
    validateEvidence(entry);
    if (ids.has(entry.id) || criteria.has(entry.criterionId)) throw new Error('Duplicate evidence id or criterion result');
    ids.add(entry.id); criteria.add(entry.criterionId);
    if (!contract.criteria.some(c => c.id === entry.criterionId)) throw new Error('Unknown evidence criterion');
    if (entry.contractId !== contract.id || entry.runId !== runId || entry.runnerId !== runnerId) throw new Error('Evidence contract, run or runner identity mismatch');
  }
}
/** Portable JSON integrity manifest, NOT authenticated attestation or SLSA compliance.
 * Evidence must be the current recorded result per criterion from a trusted verifier;
 * this module checks consistency and freshness, it does not rerun the underlying tests.
 */
export async function createCompletionCapsule({ contract, contractVersion = '1', runId, runnerId, evidence, artifacts, metadata = {} }) {
  required(contractVersion, 'contractVersion'); required(runId, 'runId'); required(runnerId, 'runnerId');
  const snapshot = copy({ contract, evidence, metadata });
  const delivered = copy(artifacts);
  validateRecords({ ...snapshot, runId, runnerId });
  const receipt = await createCompletionReceipt({ contract: snapshot.contract, evidence: snapshot.evidence, artifacts: delivered });
  if (receipt.status !== 'FINISH') throw new Error(`Cannot seal unverified completion: ${receipt.failures.join(', ')}`);
  const payload = { format: 'done-means-done/capsule', version: 1, contractVersion, runId, runnerId, contract: snapshot.contract, evidence: snapshot.evidence, artifactHashes: await hashes(delivered), receipt, metadata: snapshot.metadata, assurance: 'Integrity only. Unsigned; runner identity is asserted, not authenticated. Evidence records passing checks, not universal correctness.' };
  return { ...payload, integrity: { algorithm: 'SHA-256', digest: await fingerprint(canonical(payload)) } };
}
/** Supply independently trusted expectations, never derive them from the capsule.
 * A party able to rewrite the manifest can recompute its checksum. Authenticate the
 * transport/runner separately when authenticity is required.
 */
export async function verifyCompletionCapsule({ capsule, expectedContract, expectedContractVersion = '1', expectedRunId, expectedRunnerId, artifacts }) {
  const errors = []; let receipt = null;
  try {
    required(expectedRunId, 'expectedRunId'); required(expectedRunnerId, 'expectedRunnerId'); required(expectedContractVersion, 'expectedContractVersion');
    if (!expectedContract) throw new Error('Independently expected contract is required');
    const { integrity, ...payload } = copy(capsule);
    const delivered = copy(artifacts);
    if (payload.format !== 'done-means-done/capsule' || payload.version !== 1) errors.push('Unsupported capsule format/version');
    if (integrity?.algorithm !== 'SHA-256' || integrity.digest !== await fingerprint(canonical(payload))) errors.push('Manifest integrity mismatch');
    if (payload.contractVersion !== expectedContractVersion || canonical(payload.contract) !== canonical(expectedContract)) errors.push('Expected contract mismatch');
    if (payload.runId !== expectedRunId || payload.runnerId !== expectedRunnerId) errors.push('Expected run/runner identity mismatch');
    validateRecords({ contract: expectedContract, evidence: payload.evidence, runId: expectedRunId, runnerId: expectedRunnerId });
    if (canonical(payload.artifactHashes) !== canonical(await hashes(delivered))) errors.push('Delivered artifact hashes mismatch');
    receipt = await createCompletionReceipt({ contract: expectedContract, evidence: payload.evidence, artifacts: delivered });
    if (receipt.status !== 'FINISH') errors.push('Mandatory evidence is missing, failing or stale');
    if (canonical(payload.receipt) !== canonical(receipt)) errors.push('Completion receipt mismatch');
  } catch (error) { errors.push(error.message); }
  return { valid: errors.length === 0, errors, receipt, authenticated: false, assurance: 'Unsigned integrity verification only' };
}
