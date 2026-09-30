import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkManifests, checkWorkflow, localLinkTargets, resolveLocalLink, checkRepository } from './check-repository.mjs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const pkg = { name: 'cengfan-map-studio', version: '0.1.3', license: 'AGPL-3.0-only', engines: { node: '>=22.13.0 <23', npm: '>=10' }, devDependencies: { vitest: '^4.1.11' } };
const lock = { name: pkg.name, version: pkg.version, packages: { '': { ...pkg } } };
test('manifest checks reject version, dependency, license and runtime drift', () => {
  assert.deepEqual(checkManifests(pkg, lock, '22\n'), []);
  for (const update of [{ version: '0.2.0' }, { license: 'MIT' }, { devDependencies: {} }, { engines: {} }]) assert.ok(checkManifests({ ...pkg, ...update }, lock, '22').length);
  assert.ok(checkManifests(null, null, '24').length);
});
test('all external actions require a full SHA and trusted PR event', () => {
  assert.deepEqual(checkWorkflow(`  - uses: actions/checkout@${'a'.repeat(40)} # v6\n  - uses: ./local\n`), []);
  assert.equal(checkWorkflow('  - uses: actions/checkout@v6\n  pull_request_target:\n').length, 2);
  assert.equal(checkWorkflow('  - uses: "actions/checkout@main"').length, 1);
});
test('extracts local Markdown and HTML destinations, excluding examples and external links', () => {
  const input = '[A](docs/a.md#part) [web](https://example.org) [anchor](#id)\n<img src="docs/a.png">\n```bash\n[x](not-real)\n```';
  assert.deepEqual(localLinkTargets(input), ['docs/a.md#part', 'docs/a.png']);
});
test('URL decoding and repository-relative paths cannot escape the root', () => {
  const root = join(tmpdir(), 'repository');
  assert.equal(resolveLocalLink(root, 'docs/README.md', '../README.md'), join(root, 'README.md'));
  assert.equal(resolveLocalLink(root, 'README.md', 'docs/a%20b.md'), join(root, 'docs', 'a b.md'));
  assert.throws(() => resolveLocalLink(root, 'README.md', '../outside.md'));
  assert.throws(() => resolveLocalLink(root, 'README.md', '%FF'));
});
test('missing governance and tracked sensitive filenames are actionable errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cengfan-check-'));
  try {
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    await writeFile(join(root, '.env'), 'DO_NOT_PRINT_THIS=value');
    await writeFile(join(root, 'README.md'), '[broken](missing.md)');
    const report = await checkRepository(root);
    assert.equal(report.ok, false);
    assert.ok(report.errors.some((error) => error.includes('GOVERNANCE.md')));
    assert.ok(report.errors.some((error) => error.includes('missing.md')));
    assert.ok(report.errors.some((error) => error.includes('.env:')));
    assert.ok(!JSON.stringify(report).includes('DO_NOT_PRINT_THIS'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
