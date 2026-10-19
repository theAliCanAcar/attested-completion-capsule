import { checkFreshness } from './artifact-freshness-guard.js';
import { validateEvidence } from './evidence-ledger.js';

/**
 * Completion is determined by the latest recorded result for every criterion.
 * Evidence order is append order; timestamps cannot override a later failing result.
 * Use trusted verifier evidence: this is an integrity mechanism, not an authentication boundary.
 */
export async function createCompletionReceipt({ contract, evidence, artifacts, runHistory = [] }) {
  if (!contract?.id || !Array.isArray(contract.criteria) || !contract.criteria.length) throw new TypeError('A contract with criteria is required');
  const ids = contract.criteria.map(criterion => criterion.id);
  if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length || contract.criteria.some(criterion => typeof criterion.mandatory !== 'boolean')) throw new TypeError('Criteria need unique ids and explicit mandatory flags');
  if (!Array.isArray(evidence)) throw new TypeError('Evidence must be an array');
  evidence.forEach(validateEvidence);
  const criteria = await Promise.all(contract.criteria.map(async criterion => {
    const latest = evidence.filter(entry => entry.criterionId === criterion.id && (!entry.contractId || entry.contractId === contract.id)).at(-1);
    const freshness = latest ? await checkFreshness(latest, artifacts) : { fresh: false, reason: 'No recorded evidence' };
    const passed = Boolean(latest?.passed && freshness.fresh);
    return { id: criterion.id, description: criterion.description, mandatory: criterion.mandatory, passed, fresh: freshness.fresh, evidenceId: latest?.id ?? null, artifactId: latest?.artifactId ?? null, reason: !latest ? 'No recorded evidence' : !freshness.fresh ? freshness.reason : latest.passed ? 'Verified with current evidence' : 'Latest verification failed' };
  }));
  const failures = criteria.filter(criterion => criterion.mandatory && !criterion.passed);
  return { contractId: contract.id, status: failures.length ? 'ESCALATE' : 'FINISH', criteria, failures: failures.map(criterion => criterion.id), artifacts: [...new Set(criteria.map(criterion => criterion.artifactId).filter(Boolean))], retries: runHistory.filter(event => event.type === 'retry' || event.state === 'RETRY' || (event.type === 'transition' && event.payload?.state === 'RETRY')).length, runHistory: JSON.parse(JSON.stringify(runHistory)) };
}
