---
name: cengfan-promo
description: 蹭饭图国内宣发与社区意见收集。用户提到宣发、小红书、掘金、V2EX、Gitee、用户群、征求意见、promo、投放文案时使用。
---

# 蹭饭图宣发

先读 `docs/宣发/国内互联网宣发总流程.md`。不要按「正在毕业高峰」执行，除非当前日期在当年 5–7 月。

## 硬规则

- 用户主 CTA 不是 `git clone`。没有 HTTPS Demo 时，用户侧用「评论扣 1 / 用户群示例包」。
- 开发者主 CTA 是具体 Issue，不是「欢迎 Star」。
- 禁止对外宣称升学率、就业率、录取率。
- 禁止把真实姓名 + 去向用于文案或截图。
- 用户群与开发者群文案分开。
- 许可证是 AGPL-3.0-only。不要写「MIT / 可闭源商用 SaaS」。收费只谈班级自愿的社区模板手续费；支付代码不进开源仓。见 `docs/开源与收费边界.md`。

## 按任务做

| 用户意图 | 动作 |
|----------|------|
| 写总策略 / 改流程 | 改 `docs/宣发/国内互联网宣发总流程.md`，不要再复制一份互相打架的计划 |
| 发开发者社区 | 复制 `docs/宣发/投放文案-开发者社区.md`，替换占位符 |
| 发小红书/视频号/知乎 | 用 `docs/宣发/投放文案-用户侧.md`；高峰季再叠加 `docs/脚本库/` |
| 检查能不能发 | `npm run promo:check` |
| 生成草稿 | `npm run promo:content -- --type=xhs --theme=painpoint`（支持 xhs / bilibili / douyin / juejin / v2ex / zhihu） |
| 复盘 | `npm run promo:report`，对照总流程里的现实 KPI |
| 收集意见 | 按 `docs/宣发/反馈收集SOP.md`，48h 回复 |

毕业季 5–7 月的周节奏才使用 `docs/宣发执行流程-4周启动计划.md`。
