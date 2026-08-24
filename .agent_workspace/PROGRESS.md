# 功能拓展调研与落地 — 进度

分支：`cursor/feature-expansion-research-c710`  
目标：两轮调研可拓展功能（社区 / 宣发 / 会员等），第三轮落地本仓允许的完善。  
硬边界：支付、套餐、订单、兑换码、模板手续费结算 **不得进入本仓库**（见 `docs/开源与收费边界.md`）。

## Cycle 3 状态

| 轮次 | 主题 | 状态 |
|------|------|------|
| C3-R1 | 收口项初始落地 | completed |
| C3-R2 | 靶向修复与测试 | completed |
| C3-R3 | SOTA 打磨与验收 | in_progress |

## Cycle 3 Round 1 子代理

| ID | 模型 | 主攻 |
|----|------|------|
| C3R1-F1 | claude-fable-5-thinking-xhigh | D3 导入失败 alert |
| C3R1-F2 | claude-fable-5-thinking-xhigh | CHANGELOG 昵称 20 + 进行中记录 |
| C3R1-O1 | claude-opus-5-thinking-high-fast | F3 工程包文件名 |
| C3R1-O2 | claude-opus-5-thinking-high-fast | A3 帮助 Changelog/版本 |
| C3R1-G1 | gpt-5.6-sol-xhigh-fast | 删除 `.template-workspace*` 死 CSS |
| C3R1-G2 | gpt-5.6-sol-xhigh-fast | P3 PNG 任意导出禁用 |

## Cycle 2 状态

| 轮次 | 主题 | 状态 |
|------|------|------|
| C2-R1 | 补齐推迟项初始落地 | completed |
| C2-R2 | 靶向修复与测试补齐 | completed |
| C2-R3 | SOTA 打磨与浏览器验收 | completed |

## Cycle 2 Round 1 子代理

| ID | 模型 | 主攻 |
|----|------|------|
| C2R1-F1 | claude-fable-5-thinking-xhigh | H2 空名单健康 |
| C2R1-F2 | claude-fable-5-thinking-xhigh | 文档漂移 |
| C2R1-O1 | claude-opus-5-thinking-high-fast | D2 aria-live |
| C2R1-O2 | claude-opus-5-thinking-high-fast | F2 导出结果条 |
| C2R1-G1 | gpt-5.6-sol-xhigh-fast | B2 主路径模板交换 |
| C2R1-G2 | gpt-5.6-sol-xhigh-fast | P2 协作入口可发现 |

## 循环状态

| 轮次 | 主题 | 状态 |
|------|------|------|
| Round 1 | 初始调研与基线探索 | completed |
| Round 2 | 靶向深化与优先级收敛 | completed |
| Round 3 | SOTA 打磨与可合入落地 | completed |

## Round 3 子代理

| ID | 模型 | 主攻 | 文件所有权 |
|----|------|------|------------|
| R3-F1 | claude-fable-5-thinking-xhigh | E 协作昵称+角色标签 | identity lib / ProjectMenu，禁 App.tsx |
| R3-F2 | claude-fable-5-thinking-xhigh | G CHANGELOG+致谢+存活合规 | 纯文档新增/案例模板/USER_GUIDE |
| R3-O1 | claude-opus-5-thinking-high-fast | B 社区模板交换格式 | template-package + TemplateExchange，禁 App.tsx |
| R3-O2 | claude-opus-5-thinking-high-fast | A 提意见入口 + D 恢复模板下载 | HelpFeedbackMenu + hideTemplateDownload |
| R3-G1 | gpt-5.6-sol-xhigh-fast | F 导出文件名 | export-filename + usePosterExport |
| R3-G2 | gpt-5.6-sol-xhigh-fast | H 工作台重载示例 | ProjectGrid 空态按钮 |

## Round 2 子代理

| ID | 模型 | 主攻 | 产出文件 |
|----|------|------|----------|
| R2-F1 | claude-fable-5-thinking-xhigh | 候选包 A–H 交叉审计与冲突分析 | `round2/fable-1-plan-audit.md` |
| R2-F2 | claude-fable-5-thinking-xhigh | SOTA 验收规格与回滚方案 | `round2/fable-2-acceptance.md` |
| R2-O1 | claude-opus-5-thinking-high-fast | A/B/E 文件级设计（反馈、模板格式、协作昵称） | `round2/opus-1-community-spec.md` |
| R2-O2 | claude-opus-5-thinking-high-fast | D/F/H 文件级设计（导入、导出、空态） | `round2/opus-2-editor-spec.md` |
| R2-G1 | gpt-5.6-sol-xhigh-fast | 失败测试/探针骨架与基线命令 | `round2/gpt-1-test-plan.md` |
| R2-G2 | gpt-5.6-sol-xhigh-fast | 合规残留扫描 + 边界复检 | `round2/gpt-2-compliance.md` |

## Round 1 子代理

| ID | 模型 | 主攻 | 产出文件 |
|----|------|------|----------|
| R1-F1 | claude-fable-5-thinking-xhigh | 产品架构 / 社区·宣发·会员边界审计 | `round1/fable-1-architecture.md` |
| R1-F2 | claude-fable-5-thinking-xhigh | SOTA 对照与验收标准 | `round1/fable-2-sota.md` |
| R1-O1 | claude-opus-5-thinking-high-fast | 代码面功能盘点（社区/宣发/协作/模板） | `round1/opus-1-code-inventory.md` |
| R1-O2 | claude-opus-5-thinking-high-fast | 编辑器「其他部分」可落地缺口 | `round1/opus-2-editor-gaps.md` |
| R1-G1 | gpt-5.6-sol-xhigh-fast | 脚本/API/宣发工具探针 | `round1/gpt-1-probe.md` |
| R1-G2 | gpt-5.6-sol-xhigh-fast | 收费边界与 GitHub 现状探针 | `round1/gpt-2-boundary.md` |

## 结论简报

- Round 1：见 `ROUND1-BRIEF.md`（文档层完整、产品层无钩子；Round 3 候选 A–H）
- Round 2：见 `ROUND2-BRIEF.md`（keep A/B/E/G，slim D/F/H，drop C；#8/#11 为冲突约束）
- Round 3：见 `ROUND3-BRIEF.md`（A/B/D/E/F/G/H 已落地；C 放弃；266 项目标测试通过）
