/** Validate evidence at the storage boundary; a builder's completion claim is insufficient. */
export function validateEvidence(entry) {
  if (!entry || typeof entry !== 'object') throw new TypeError('Evidence must be an object');
  for (const key of ['id', 'criterionId', 'artifactId', 'fingerprint', 'createdAt']) {
    if (typeof entry[key] !== 'string' || !entry[key].trim()) throw new TypeError(`Evidence ${key} must be a nonempty string`);
  }
  if (!/^[a-f0-9]{64}$/i.test(entry.fingerprint)) throw new TypeError('Evidence fingerprint must be a SHA-256 hex digest');
  if (!Number.isFinite(Date.parse(entry.createdAt))) throw new TypeError('Evidence createdAt must be a valid date');
  if (typeof entry.passed !== 'boolean') throw new TypeError('Evidence passed must be boolean');
  return entry;
}

/** Append-only result ledger with optional localStorage-compatible persistence. */
export function createEvidenceLedger({ storage, storageKey = 'done-means-done:evidence' } = {}) {
  const stored = storage?.getItem(storageKey);
  let entries = stored ? JSON.parse(stored) : [];
  if (!Array.isArray(entries)) throw new TypeError('Stored evidence must be an array');
  entries.forEach(validateEvidence);
  const clone = value => JSON.parse(JSON.stringify(value));
  return {
    append(entry) {
      validateEvidence(entry);
      if (entries.some(existing => existing.id === entry.id)) throw new Error(`Duplicate evidence id: ${entry.id}`);
      const next = [...entries, clone(entry)];
      storage?.setItem(storageKey, JSON.stringify(next));
      entries = next;
      return clone(entry);
    },
    list({ criterionId, artifactId } = {}) {
      return clone(entries.filter(entry => (!criterionId || entry.criterionId === criterionId) && (!artifactId || entry.artifactId === artifactId)));
    },
    clear() { storage?.setItem(storageKey, '[]'); entries = []; },
  };
}
