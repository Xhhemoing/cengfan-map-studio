# 功能拓展调研与落地 — 进度

分支：`cursor/feature-expansion-research-c710`  
目标：两轮调研可拓展功能（社区 / 宣发 / 会员等），第三轮落地本仓允许的完善。  
硬边界：支付、套餐、订单、兑换码、模板手续费结算 **不得进入本仓库**（见 `docs/开源与收费边界.md`）。

## 循环状态

| 轮次 | 主题 | 状态 |
|------|------|------|
| Round 1 | 初始调研与基线探索 | completed |
| Round 2 | 靶向深化与优先级收敛 | pending |
| Round 3 | SOTA 打磨与可合入落地 | pending |

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
- Round 2：待汇总
- Round 3：待汇总
