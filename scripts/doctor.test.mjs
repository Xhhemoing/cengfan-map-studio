import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from './doctor.mjs';
const good = { nodeVersion: 'v22.13.0', npmVersion: '10.9.0', manifest: { name: 'cengfan-map-studio' }, lockfile: true, installed: true };
test('supported offline toolchain needs no provider key', () => {
  assert.equal(diagnose(good).ok, true);
  assert.equal(diagnose({ ...good, nodeVersion: 'v22.23.3', npmVersion: '11.0.0' }).ok, true);
});
test('unsupported runtimes and absent prerequisites provide recovery', () => {
  for (const input of [{ nodeVersion: 'v22.12.9' }, { nodeVersion: 'v24.0.0' }, { nodeVersion: 'invalid' },
    { npmVersion: '9.0.0' }, { npmVersion: '' }, { installed: false }, { lockfile: false }, { manifest: null }]) {
    const report = diagnose({ ...good, ...input });
    assert.equal(report.ok, false);
    assert.ok(report.checks.filter((check) => !check.ok).every((check) => check.fix));
  }
});
test('diagnostics do not leak unrelated input properties', () => {
  assert.ok(!JSON.stringify(diagnose({ ...good, apiKey: 'private-key-test' })).includes('private-key-test'));
});
