import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** An unavailable registry or malformed report is an error, never a clean audit. */
export function summarizeAudit(report) {
  if (!report || report.error || report.auditReportVersion !== 2 || !report.vulnerabilities
      || !report.metadata?.vulnerabilities) throw new Error('Invalid or unavailable npm audit report');
  const counts = report.metadata.vulnerabilities;
  for (const level of ['info', 'low', 'moderate', 'high', 'critical', 'total']) {
    if (!Number.isSafeInteger(counts[level]) || counts[level] < 0) throw new Error('Invalid vulnerability count');
  }
  return { counts, blocking: counts.high + counts.critical > 0,
    packages: Object.entries(report.vulnerabilities).map(([name, value]) => ({
      name, severity: value.severity, direct: value.isDirect, range: value.range,
      fixAvailable: value.fixAvailable, via: value.via,
    })) };
}

export async function collectAudits(directory = 'artifacts/dependency-audit') {
  await mkdir(directory, { recursive: true });
  const summary = { generatedAt: new Date().toISOString(), node: process.version,
    lockfileSha256: createHash('sha256').update(await readFile('package-lock.json')).digest('hex'),
    policy: 'Fail on high/critical in either scope; retain all severities. Registry failure fails closed.', scopes: {} };
  let failed = false;
  for (const scope of ['all', 'production']) {
    const args = ['audit', '--package-lock-only', '--json', '--registry=https://registry.npmjs.org'];
    if (scope === 'production') args.push('--omit=dev');
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args,
      { encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024, shell: process.platform === 'win32' });
    await writeFile(`${directory}/${scope}.json`, result.stdout || '{}');
    try {
      if (result.error || result.signal || ![0, 1].includes(result.status)) throw new Error('npm audit process did not complete');
      const value = summarizeAudit(JSON.parse(result.stdout));
      summary.scopes[scope] = value;
      failed ||= value.blocking;
      console.log(`${scope}: ${JSON.stringify(value.counts)}`);
      for (const item of value.packages) console.log(`  ${item.name}: ${item.severity}, range=${item.range}, fix=${JSON.stringify(item.fixAvailable)}`);
    } catch (error) {
      failed = true;
      summary.scopes[scope] = { error: error instanceof Error ? error.message : String(error) };
      console.error(`${scope}: audit unavailable or invalid`);
    }
  }
  await writeFile(`${directory}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
  return !failed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  collectAudits().then((ok) => { if (!ok) process.exitCode = 1; }).catch((error) => {
    console.error(error.message); process.exitCode = 1;
  });
}
