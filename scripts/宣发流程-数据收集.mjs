#!/usr/bin/env node
/**
 * 蹭饭图宣发流程 — 数据收集与复盘脚本
 *
 * 用途：收集宣发数据、生成复盘报告
 * 使用：
 *   node scripts/宣发流程-数据收集.mjs --collect          # 收集当前数据
 *   node scripts/宣发流程-数据收集.mjs --report            # 生成复盘报告
 *   node scripts/宣发流程-数据收集.mjs --update-kpi        # 更新 KPI 目标
 *
 * 数据来源（需手动维护或对接 API）：
 *   - GitHub API（Star、Fork、Issue、PR）
 *   - 小红书/抖音/B站 后台（粉丝、阅读、点赞、收藏）
 *   - 私域群（成员数、活跃度）
 *   - 案例作品（数量、质量评分）
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const mode = args[0]?.replace('--', '') || 'collect';

const ROOT = process.cwd();
const DATA_DIR = join(ROOT, 'docs', '宣发数据');
const REPORT_DIR = join(ROOT, 'docs', '宣发复盘');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });

const KPI_TARGETS = {
  '8周淡季': { githubStar: 80, xhsFans: 400, cases: 5, issues: 15, contributors: 3 },
  '2027预热前': { githubStar: 300, xhsFans: 1000, cases: 20, issues: 40, contributors: 8 },
  '2027毕业季': { githubStar: 1000, xhsFans: 3000, cases: 80, issues: 100, contributors: 20 }
};

const CURRENT_DATA_FILE = join(DATA_DIR, 'current.json');
const HISTORY_FILE = join(DATA_DIR, 'history.json');

function loadCurrentData() {
  if (existsSync(CURRENT_DATA_FILE)) {
    return JSON.parse(readFileSync(CURRENT_DATA_FILE, 'utf8'));
  }
  return {
    date: new Date().toISOString().slice(0, 10),
    github: { star: 0, fork: 0, issue: 0, pr: 0, discussion: 0 },
    gitee: { star: 0 },
    xhs: { fans: 0, note: 0, read: 0, like: 0, collect: 0 },
    douyin: { fans: 0, video: 0, play: 0, like: 0 },
    bilibili: { fans: 0, video: 0, play: 0, like: 0 },
    juejin: { articles: 0, read: 0 },
    v2ex: { posts: 0, replies: 0 },
    cases: { total: 0, quality: { high: 0, medium: 0, low: 0 } },
    seeds: { total: 0, active: 0 },
    kol: { tier1: 0, tier2: 0, tier3: 0 },
    private: { userGroup: 0, devGroup: 0, activeRate: 0 },
    demo: { weeklyOpens: 0, exports: 0 }
  };
}

function saveCurrentData(data) {
  writeFileSync(CURRENT_DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✓ 当前数据已保存: ${CURRENT_DATA_FILE}`);
}

function appendHistory(data) {
  let history = [];
  if (existsSync(HISTORY_FILE)) {
    history = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
  }
  history.push({ ...data, timestamp: new Date().toISOString() });
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  console.log(`✓ 历史数据已更新: ${HISTORY_FILE}`);
}

function collectData() {
  console.log('蹭饭图宣发数据收集\n');
  console.log('请输入当前数据（直接回车跳过）：\n');

  // 这里简化处理，实际应使用 readline 交互式输入
  // 为演示，生成示例数据结构
  const data = loadCurrentData();
  data.date = new Date().toISOString().slice(0, 10);

  console.log('当前数据结构已加载，示例数据：');
  console.log(JSON.stringify(data, null, 2));
  console.log('\n提示：实际使用时请手动更新 docs/宣发数据/current.json');
  console.log('或对接 GitHub API / 平台后台 API 自动拉取');

  saveCurrentData(data);
  appendHistory(data);
}

function generateReport() {
  console.log('生成宣发复盘报告...\n');

  if (!existsSync(CURRENT_DATA_FILE)) {
    console.error('✗ 未找到当前数据文件，请先运行 --collect');
    return;
  }

  const current = JSON.parse(readFileSync(CURRENT_DATA_FILE, 'utf8'));
  const history = existsSync(HISTORY_FILE)
    ? JSON.parse(readFileSync(HISTORY_FILE, 'utf8'))
    : [];

  const reportDate = new Date().toISOString().slice(0, 10);
  const reportFile = join(REPORT_DIR, `复盘报告-${reportDate}.md`);

  let report = `# 蹭饭图宣发复盘报告\n\n`;
  report += `**日期**：${reportDate}\n`;
  report += `**复盘周期**：${history.length > 1 ? '周/月' : '首次'}\n\n`;
  report += '---\n\n';

  // KPI 对比
  report += '## 一、KPI 完成情况\n\n';
  report += '| 指标 | 当前值 | 8周淡季 | 完成率 | 2027预热前 | 2027毕业季 |\n';
  report += '|------|--------|---------|--------|------------|------------|\n';

  const t0 = KPI_TARGETS['8周淡季'];
  const t1 = KPI_TARGETS['2027预热前'];
  const t2 = KPI_TARGETS['2027毕业季'];
  const starNow = (current.github?.star || 0) + (current.gitee?.star || 0);
  const issueNow = current.github?.issue || 0;
  const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '0.0');

  report += `| Star（GitHub+Gitee） | ${starNow} | ${t0.githubStar} | ${pct(starNow, t0.githubStar)}% | ${t1.githubStar} | ${t2.githubStar} |\n`;
  report += `| 小红书粉丝 | ${current.xhs.fans} | ${t0.xhsFans} | ${pct(current.xhs.fans, t0.xhsFans)}% | ${t1.xhsFans} | ${t2.xhsFans} |\n`;
  report += `| 真实案例 | ${current.cases.total} | ${t0.cases} | ${pct(current.cases.total, t0.cases)}% | ${t1.cases} | ${t2.cases} |\n`;
  report += `| 外部 Issue | ${issueNow} | ${t0.issues} | ${pct(issueNow, t0.issues)}% | ${t1.issues} | ${t2.issues} |\n`;
  report += `| Demo 周打开 / 导出 | ${current.demo?.weeklyOpens || 0} / ${current.demo?.exports || 0} | 有数据即可 | — | 200 打开 | 1000 打开 |\n`;
  report += '\n';
  report += '对照总流程：阅读高试用低 → 查 Demo；试用高意见少 → 查反馈入口；意见多回复慢 → 先停投放。\n\n';

  // 内容表现
  report += '## 二、内容表现分析\n\n';
  report += `### 小红书\n`;
  report += `- 笔记数：${current.xhs.note}\n`;
  report += `- 阅读量：${current.xhs.read}\n`;
  report += `- 点赞/收藏：${current.xhs.like} / ${current.xhs.collect}\n`;
  report += `- 平均互动率：${current.xhs.read > 0 ? ((current.xhs.like + current.xhs.collect) / current.xhs.read * 100).toFixed(2) : 0}%\n\n`;

  report += `### 抖音\n`;
  report += `- 视频数：${current.douyin.video}\n`;
  report += `- 播放量：${current.douyin.play}\n`;
  report += `- 点赞：${current.douyin.like}\n\n`;

  report += `### B站\n`;
  report += `- 视频数：${current.bilibili.video}\n`;
  report += `- 播放量：${current.bilibili.play}\n`;
  report += `- 点赞：${current.bilibili.like}\n\n`;

  // 案例质量
  report += '## 三、案例作品质量\n\n';
  report += `- 高质量案例：${current.cases.quality.high}（可作为 KOL 素材）\n`;
  report += `- 中等质量案例：${current.cases.quality.medium}（适合普通展示）\n`;
  report += `- 低质量案例：${current.cases.quality.low}（需改进或下架）\n\n`;

  // 私域健康度
  report += '## 四、私域健康度\n\n';
  report += `- 用户群：${current.private.userGroup ?? current.private.group ?? 0}\n`;
  report += `- 开发者群：${current.private.devGroup ?? 0}\n`;
  report += `- 活跃率：${current.private.activeRate}%\n`;
  report += `- 种子用户活跃：${current.seeds.active} / ${current.seeds.total}\n`;
  report += `- 掘金阅读：${current.juejin?.read || 0} · V2EX 回复：${current.v2ex?.replies || 0}\n\n`;

  // 问题与改进
  report += '## 五、本周期问题与改进\n\n';
  report += '### 问题\n';
  report += '1. [待填写]\n';
  report += '2. [待填写]\n\n';
  report += '### 改进措施\n';
  report += '1. [待填写]\n';
  report += '2. [待填写]\n\n';

  // 下周期计划
  report += '## 六、下周期计划\n\n';
  report += '- [ ] 内容主题：\n';
  report += '- [ ] KOL 合作：\n';
  report += '- [ ] UGC 征集：\n';
  report += '- [ ] 功能迭代：\n\n';

  report += '---\n\n';
  report += `**下次复盘**：${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}\n`;
  report += `**复盘节奏**：每周一小结、每月一大复盘\n`;

  writeFileSync(reportFile, report, 'utf8');
  console.log(`✓ 复盘报告已生成: ${reportFile}`);
}

function updateKPI() {
  console.log('更新 KPI 目标...\n');
  console.log('当前 KPI 目标：');
  console.log(JSON.stringify(KPI_TARGETS, null, 2));
  console.log('\n提示：编辑 scripts/宣发流程-数据收集.mjs 中的 KPI_TARGETS 对象');
}

if (mode === 'collect') {
  collectData();
} else if (mode === 'report') {
  generateReport();
} else if (mode === 'update-kpi') {
  updateKPI();
} else {
  console.log('用法：');
  console.log('  node scripts/宣发流程-数据收集.mjs --collect');
  console.log('  node scripts/宣发流程-数据收集.mjs --report');
  console.log('  node scripts/宣发流程-数据收集.mjs --update-kpi');
}