import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, dirname, basename, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Historical design/QA archives are deliberately not represented as maintained instructions.
export const MAINTAINED_DOCS = ['README.md', 'USER_GUIDE.md', 'CONTRIBUTING.md', 'DEVELOPER.md', 'SECURITY.md',
  'SUPPORT.md', 'CODE_OF_CONDUCT.md', 'GOVERNANCE.md', 'THIRD_PARTY_NOTICES.md', 'docs/README.md',
  'docs/MAINTAINERS.md', 'docs/ARCHITECTURE.md', 'docs/ROADMAP.md', 'docs/PROJECT_STATUS.md'];
const REQUIRED = [...MAINTAINED_DOCS, 'LICENSE', '.github/CODEOWNERS', '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/feature.yml', '.github/PULL_REQUEST_TEMPLATE.md', '.github/dependabot.yml'];

export function checkManifests(pkg, lock, nodeMajor) {
  const errors = [];
  if (!pkg || !lock || pkg.name !== lock.name || pkg.version !== lock.version || pkg.version !== lock.packages?.['']?.version) errors.push('Package name/version drift in lockfile');
  if (pkg?.license !== 'AGPL-3.0-only') errors.push('Unexpected package license; a license change requires separate review');
  if (String(nodeMajor).trim() !== '22' || pkg?.engines?.node !== '>=22.13.0 <23' || pkg?.engines?.npm !== '>=10') errors.push('Runtime contract drift: update doctor, documentation and CI together');
  for (const field of ['dependencies', 'devDependencies']) {
    const expected = pkg?.[field] ?? {};
    const actual = lock?.packages?.['']?.[field] ?? {};
    if (Object.keys(expected).length !== Object.keys(actual).length || Object.entries(expected).some(([key, value]) => actual[key] !== value)) errors.push(`Root lockfile ${field} drift`);
  }
  return errors;
}

export function checkWorkflow(source) {
  const errors = [];
  if (/^\s*pull_request_target\s*:/m.test(source)) errors.push('pull_request_target requires a separately reviewed trust model');
  for (const match of source.matchAll(/^\s*(?:-\s*)?uses:\s*["']?([^\s"'#]+)["']?/gm)) {
    const action = match[1];
    if (!action.startsWith('./') && !/^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/.test(action)) errors.push(`Unpinned external action: ${action}`);
  }
  return errors;
}

/** Check file/directory destinations only, not anchors, web availability or Markdown correctness. */
export function localLinkTargets(markdown) {
  const prose = markdown.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '');
  const matches = [...prose.matchAll(/\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1].replace(/^<|>$/g, ''));
  matches.push(...[...prose.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]));
  return matches.filter((target) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target));
}
export function resolveLocalLink(root, file, target) {
  const path = decodeURIComponent(target.split(/[?#]/)[0]);
  if (!path) return null;
  const location = resolve(path.startsWith('/') ? root : dirname(resolve(root, file)), path.startsWith('/') ? `.${path}` : path);
  const child = relative(root, location);
  if (child === '..' || child.startsWith(`..${sep}`)) throw new Error('Link escapes the repository');
  return location;
}

async function sourcePaths(root) {
  const git = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (git.status === 0) return git.stdout.split('\0').filter(Boolean);
  // Release/source archives have no .git. Never inspect runtime data or dependencies.
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'dist', 'artifacts', 'data', '.cache'].includes(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
    }
  }
  await walk(root);
  return files;
}

export async function checkRepository(directory = process.cwd()) {
  const root = resolve(directory);
  const errors = [];
  for (const path of REQUIRED) {
    try { if (!(await readFile(resolve(root, path), 'utf8')).trim()) errors.push(`${path}: empty required file`); }
    catch { errors.push(`${path}: missing required file`); }
  }
  try {
    const load = async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
    errors.push(...checkManifests(await load('package.json'), await load('package-lock.json'), await readFile(resolve(root, '.nvmrc'), 'utf8')));
    if (!(await readFile(resolve(root, 'LICENSE'), 'utf8')).includes('GNU AFFERO GENERAL PUBLIC LICENSE')) errors.push('LICENSE does not contain the expected license text');
  } catch { errors.push('Unable to read package/runtime/license metadata'); }
  for (const file of MAINTAINED_DOCS) {
    let text;
    try { text = await readFile(resolve(root, file), 'utf8'); } catch { continue; }
    for (const target of localLinkTargets(text)) {
      try { const destination = resolveLocalLink(root, file, target); if (destination) await stat(destination); }
      catch { errors.push(`${file}: invalid or missing local link ${target}`); }
    }
  }
  const paths = await sourcePaths(root);
  for (const path of paths) {
    const name = basename(path);
    if ((name.startsWith('.env') && !name.endsWith('.example')) || ['id_rsa', 'id_ed25519', 'credentials.json'].includes(name)) errors.push(`${path}: sensitive filename must not be tracked`);
    if (path === '.github/workflows/reviewed-dependency-repair.yml') errors.push('Remove temporary write-enabled dependency repair workflow');
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)) {
      errors.push(...checkWorkflow(await readFile(resolve(root, path), 'utf8')).map((error) => `${path}: ${error}`));
    }
  }
  return { ok: errors.length === 0, errors, maintainedDocuments: MAINTAINED_DOCS.length,
    limits: ['Checks maintained local destinations, not anchors or external links.',
      'Sensitive-filename checks are not a complete secret scan or a safety certification.',
      'Repository settings, review quality and external resource rights require human verification.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkRepository().then((report) => {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
