import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Pure diagnostics: never print environment variables, credentials or project data. */
export function diagnose({ nodeVersion, npmVersion, manifest, lockfile, installed }) {
  const checks = [];
  const add = (id, ok, message, fix) => checks.push({ id, ok, message, ...(ok ? {} : { fix }) });
  const node = /^v?(\d+)\.(\d+)\.(\d+)/.exec(nodeVersion ?? '');
  add('node', Boolean(node && Number(node[1]) === 22 && Number(node[2]) >= 13),
    `Node ${nodeVersion || 'unavailable'}; supported: 22.13+ within 22.x`, 'Use the Node version in .nvmrc, then reopen your terminal.');
  const npm = /^(\d+)\./.exec(npmVersion ?? '');
  add('npm', Boolean(npm && Number(npm[1]) >= 10), `npm ${npmVersion || 'unavailable'}; required: 10+`, 'Install npm 10+ alongside the supported Node version.');
  add('manifest', Boolean(manifest?.name === 'cengfan-map-studio'), 'Repository package.json', 'Run this command from the repository root.');
  add('lockfile', Boolean(lockfile), 'package-lock.json is available', 'Restore the committed lockfile; do not generate a replacement just to start the app.');
  add('installed', Boolean(installed), 'Local toolchain is installed', 'Run npm ci, then npm run doctor again.');
  return { ok: checks.every((check) => check.ok), checks,
    notes: ['No model API key is needed for local import, editing and export.',
      'This checks prerequisites, not an application smoke test or a security audit.',
      'Next: npm run dev. Before a PR: npm run check.'] };
}

export function inspectEnvironment(root = process.cwd()) {
  let manifest;
  try { manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')); } catch { /* diagnostics below */ }
  const npm = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'],
    { encoding: 'utf8', timeout: 10_000, shell: process.platform === 'win32' });
  return diagnose({ nodeVersion: process.version, npmVersion: npm.status === 0 ? npm.stdout.trim() : '', manifest,
    lockfile: existsSync(resolve(root, 'package-lock.json')),
    installed: ['typescript', 'vite', 'vitest'].every((name) => existsSync(resolve(root, 'node_modules', name, 'package.json'))) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = inspectEnvironment();
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const check of report.checks) console.log(`${check.ok ? 'OK' : 'FIX'} ${check.id}: ${check.message}${check.fix ? `\n    ${check.fix}` : ''}`);
    for (const note of report.notes) console.log(note);
  }
  process.exitCode = report.ok ? 0 : 1;
}
