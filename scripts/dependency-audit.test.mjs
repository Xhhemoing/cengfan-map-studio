import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAudit } from './dependency-audit.mjs';
const report = (high = 0) => ({ auditReportVersion: 2, vulnerabilities: {}, metadata: {
  vulnerabilities: { info: 0, low: 0, moderate: 1, high, critical: 0, total: high + 1 },
} });
test('high findings block while moderate findings remain visible', () => {
  assert.equal(summarizeAudit(report(1)).blocking, true);
  assert.equal(summarizeAudit(report()).blocking, false);
  assert.equal(summarizeAudit(report()).counts.moderate, 1);
});
test('unavailable, malformed and negative counts never pass', () => {
  for (const value of [{}, null, { error: { code: 'ENOAUDIT' } }, report(-1)]) {
    assert.throws(() => summarizeAudit(value));
  }
});
