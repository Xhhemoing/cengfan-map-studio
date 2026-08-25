# Cycle 2 · 剩余建议修改（用户已批准）

前置：PR #12 已落地 A/B/D前半/E/F前半/G/H前半。本循环补齐 Round 2 推迟项与文档漂移。仍禁止支付。

## 锁定实现包

| ID | 项 | 说明 |
|----|----|------|
| D2 | 导入消息常驻 aria-live | `DataWorkspace.tsx` `{message && <p>}` 改为常驻 `role="status" aria-live="polite"` 容器 |
| F2 | 导出成功结果条 | `DeliveryRail` 在 `exportState==="success"` 显示已导出文件名 + 再次导出；不碰印刷尺寸 |
| H2 | 空名单不判健康 | `stage-overview.ts` `dataCards` **开头** `total===0` 用 warning「还没有名单」，勿塞进 `cards.length===0` |
| B2 | 模板交换出现在六阶段主路径 | `ContentLayoutRail` 挂 TemplatePicker+TemplateExchange；App 只加该 rail 的 props |
| P2 | 协作入口可发现 | `ProjectMenu` 触发器 aria-label 含「协作」；不改 API |
| Doc | 文档漂移 | `AGENTS.md`/`SKILL.md`/`DEVELOPER.md` 的 `src/server`→`server/`；模板由前端生成；`function.md` React 19、删除已不存在的 `/admin` |

仍不做：promo:lint（#8）、公开 Demo（#7）、CI（#5）、印刷尺寸（#3）、支付、房间协议改 displayName。
