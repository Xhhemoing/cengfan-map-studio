#!/usr/bin/env node
/**
 * 蹭饭图宣发流程 — 素材检查脚本
 *
 * 用途：检查宣发所需的素材是否齐全，输出缺失项清单
 * 使用：node scripts/宣发流程-素材检查.mjs
 *
 * 检查项：
 *   - 品牌 VI（Logo、色板、字体）
 *   - 标准案例模板（5 种班级类型）
 *   - 短视频脚本库（痛点、成果、情感各 3 版）
 *   - KOL 合作话术与合同模板
 *   - 私域群运营手册
 *   - 脱敏示例数据
 *   - 二维码（GitHub、Demo、群聊）
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, 'docs');
const PUBLIC_DIR = join(ROOT, 'public');

const CHECKLIST = [
  {
    category: '品牌 VI',
    items: [
      { name: 'Logo（PNG/SVG）', path: join(PUBLIC_DIR, 'logo.png'), required: true },
      { name: '色板（品牌色定义）', path: join(DOCS_DIR, '品牌色板.md'), required: true },
      { name: '字体包（中文字体授权）', path: join(PUBLIC_DIR, 'fonts'), required: false }
    ]
  },
  {
    category: '标准案例模板',
    items: [
      { name: '985 高校附属中学（47 人）', path: join(DOCS_DIR, '案例模板/985-附属中学.md'), required: true },
      { name: '普通高中（68 人）', path: join(DOCS_DIR, '案例模板/普通高中-68人.md'), required: true },
      { name: '国际部（12 人小班）', path: join(DOCS_DIR, '案例模板/国际部-12人.md'), required: true },
      { name: '普高文科班（55 人）', path: join(DOCS_DIR, '案例模板/普高文科-55人.md'), required: false },
      { name: '职高/中专（80 人）', path: join(DOCS_DIR, '案例模板/职高-80人.md'), required: false }
    ]
  },
  {
    category: '短视频脚本库',
    items: [
      { name: '痛点脚本（3 版）', path: join(DOCS_DIR, '脚本库/痛点-3版.md'), required: true },
      { name: '成果脚本（3 版）', path: join(DOCS_DIR, '脚本库/成果-3版.md'), required: true },
      { name: '情感脚本（3 版）', path: join(DOCS_DIR, '脚本库/情感-3版.md'), required: true }
    ]
  },
  {
    category: 'KOL 合作',
    items: [
      { name: '合作话术模板', path: join(DOCS_DIR, 'KOL/合作话术.md'), required: true },
      { name: '内容授权协议', path: join(DOCS_DIR, 'KOL/内容授权协议.md'), required: true },
      { name: '合同模板', path: join(DOCS_DIR, 'KOL/合同模板.md'), required: false }
    ]
  },
  {
    category: '私域运营',
    items: [
      { name: '用户群运营手册', path: join(DOCS_DIR, '私域/用户群运营手册.md'), required: true },
      { name: '毕业季 checklist', path: join(DOCS_DIR, '私域/毕业季-checklist.md'), required: true },
      { name: '需求收集表', path: join(DOCS_DIR, '私域/需求收集表.md'), required: false }
    ]
  },
  {
    category: '脱敏示例数据',
    items: [
      { name: '示例 Excel（脱敏）', path: join(DOCS_DIR, '示例数据/毕业名单-脱敏.xlsx'), required: true },
      { name: '示例 CSV（脱敏）', path: join(DOCS_DIR, '示例数据/毕业名单-脱敏.csv'), required: true },
      { name: '示例项目包（.cengfan）', path: join(DOCS_DIR, '示例数据/示例项目.cengfan'), required: false }
    ]
  },
  {
    category: '二维码与链接',
    items: [
      { name: 'GitHub 二维码', path: join(PUBLIC_DIR, 'qrcode-github.png'), required: true },
      { name: 'Demo 站点二维码', path: join(PUBLIC_DIR, 'qrcode-demo.png'), required: false },
      { name: '用户群二维码', path: join(PUBLIC_DIR, 'qrcode-group.png'), required: false }
    ]
  }
];

function checkItem(item) {
  const exists = existsSync(item.path);
  const status = exists ? '✓' : (item.required ? '✗ 缺失（必需）' : '○ 缺失（可选）');
  const size = exists ? ` (${(statSync(item.path).size / 1024).toFixed(1)} KB)` : '';
  return { ...item, exists, status, size };
}

function runCheck() {
  console.log('蹭饭图宣发素材检查\n');
  console.log('=' .repeat(60));

  let totalRequired = 0;
  let missingRequired = 0;
  let missingOptional = 0;

  CHECKLIST.forEach(group => {
    console.log(`\n【${group.category}】`);
    group.items.forEach(item => {
      const result = checkItem(item);
      console.log(`  ${result.status} ${result.name}${result.size}`);
      if (result.required) {
        totalRequired++;
        if (!result.exists) missingRequired++;
      } else if (!result.exists) {
        missingOptional++;
      }
    });
  });

  console.log('\n' + '='.repeat(60));
  console.log(`\n总结：`);
  console.log(`  必需素材：${totalRequired} 项，已完成 ${totalRequired - missingRequired} 项，缺失 ${missingRequired} 项`);
  console.log(`  可选素材：缺失 ${missingOptional} 项（不影响核心流程）`);

  if (missingRequired > 0) {
    console.log(`\n⚠️  警告：有 ${missingRequired} 项必需素材缺失，建议优先补齐！`);
    console.log(`\n补齐建议：`);
    console.log(`  1. 品牌 VI：联系设计团队或使用 tools/brand-kit-generator`);
    console.log(`  2. 案例模板：使用「宣发流程-内容生成.mjs」生成草稿后手动完善`);
    console.log(`  3. 脚本库：参考 docs/宣发政策-小红书与社交平台.md 的「内容策略」章节`);
    console.log(`  4. KOL/私域：参考 docs/宣发政策-小红书与社交平台.md 的「KOL 策略」与「UGC 裂变」章节`);
  } else {
    console.log(`\n✅ 所有必需素材已齐全，可以开始宣发！`);
  }

  console.log(`\n下次检查：首月复盘后更新此脚本的 CHECKLIST`);
}

runCheck();