/** SHA-256 fingerprints bind verification to the exact UTF-8 artifact content. */
export async function fingerprint(content) {
  if (typeof content !== 'string') throw new TypeError('Artifact content must be a string');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Check a recorded result against current artifacts. Missing artifacts are stale. */
export async function checkFreshness(evidence, artifacts) {
  if (!evidence || !Object.hasOwn(artifacts, evidence.artifactId)) {
    return { fresh: false, reason: 'Artifact is missing', artifactId: evidence?.artifactId };
  }
  const currentFingerprint = await fingerprint(artifacts[evidence.artifactId]);
  const fresh = currentFingerprint === evidence.fingerprint;
  return { fresh, reason: fresh ? 'Artifact matches verified content' : 'Artifact changed after verification', artifactId: evidence.artifactId, currentFingerprint };
}

/** Convenience wrapper for applications that keep a mutable artifact map. */
export function createArtifactFreshnessGuard(artifacts) {
  return { fingerprint, check: evidence => checkFreshness(evidence, artifacts) };
}
