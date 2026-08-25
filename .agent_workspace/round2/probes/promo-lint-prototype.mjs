#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const defaultInputs = [
  'docs',
  'scripts/宣发流程-内容生成.mjs',
  'README.md',
  'USER_GUIDE.md',
  'DEVELOPER.md',
  'function.md',
];
const policyMarker =
  /禁止|不写|不要写|不宣称|不得|不准|不接|不上|不在|不进|不做|直接拒绝|取代|删除话术|KPI/;
const policyFiles = new Set([
  'README.md',
  'docs/开源与收费边界.md',
  'docs/宣发/good-first-issues.md',
  'docs/宣发/国内互联网宣发总流程.md',
  'docs/宣发/投放文案-用户侧.md',
  'docs/宣发政策-小红书与社交平台.md',
]);

const rules = [
  {
    id: 'CONTENT-RATE',
    pattern: /升学率|就业率|录取率|本科率/,
  },
  {
    id: 'CAPABILITY-PDF',
    pattern:
      /(?:导出|输出|生成|支持|选项)[^\n]{0,32}PDF|PNG\s*(?:\/|\+|、|，|,)\s*PDF/i,
    allow: (line) => /导出\s*SVG[^。\n]*(?:转|转换)[^。\n]*PDF/i.test(line),
  },
  {
    id: 'CAPABILITY-WORLD-MAP',
    pattern: /世界地图|全球地图/,
    allow: (line) => /投票|需求|候选|规划|未支持/.test(line),
  },
  {
    id: 'BILLING-BOUNDARY',
    pattern: /会员|VIP|套餐|sku|微信支付/i,
  },
  {
    id: 'STAR-PROMISE',
    pattern: /(?:\+\s*500|500\s*\+?)\s*(?:GitHub\s*)?Star/i,
  },
  {
    id: 'EDU-TIERING',
    pattern: /#\s*985\b|985\s*(?:占比|去向分布)|985\s*(?:vs\.?|VS|对比)\s*(?:普本|双非)/i,
  },
];

async function listFiles(input) {
  const fullPath = resolve(root, input);
  const info = await stat(fullPath);
  if (info.isFile()) return [fullPath];

  const entries = await readdir(fullPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.isSymbolicLink())
      .map((entry) => listFiles(resolve(fullPath, entry.name))),
  );
  return nested.flat();
}

async function main() {
  const inputs = process.argv.slice(2);
  const files = (
    await Promise.all((inputs.length ? inputs : defaultInputs).map(listFiles))
  )
    .flat()
    .filter((file) => ['.md', '.mjs'].includes(extname(file)));

  let violations = 0;
  for (const file of files.sort()) {
    const projectPath = relative(root, file);
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of rules) {
        if (!rule.pattern.test(line)) continue;
        if (
          policyFiles.has(projectPath) ||
          policyMarker.test(line) ||
          rule.allow?.(line)
        ) {
          continue;
        }
        violations += 1;
        console.log(
          `${projectPath}:${index + 1}: ${rule.id}: ${line.trim()}`,
        );
      }
    });
  }

  if (violations > 0) {
    console.error(`promo-lint prototype: ${violations} violation(s)`);
    process.exitCode = 1;
  } else {
    console.log('promo-lint prototype: 0 violations');
  }
}

main().catch((error) => {
  console.error(`promo-lint prototype: ${error.message}`);
  process.exitCode = 2;
});
