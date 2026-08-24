# Round 21 任务简报（代码已落地，待全量验证）

- **前置**: Round 20 已验证：tsc 绿、eslint --max-warnings 0、212 files / 1866 tests
- **分支**: `cursor/agent-sota-polish-cbcd`
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 落地

| 代理 | 改动 |
| --- | --- |
| R21-fable-arch | Legacy 侧栏 / 新增学生 / 资源包导出按钮装饰图标 `aria-hidden` |
| R21-fable-sota | `ProjectCard` 菜单五枚 Lucide 图标 `aria-hidden` |
| R21-opus-layout | `sweepPack` 剩余卡走 `marginSeat`，不再写死 `side: "left"`；pack.ts **398** 行 |
| R21-opus-data | `LIST_MARKER` 标点含 `．。）`；import-data.ts **400** 行 |
| R21-gpt-perf | `sweepPack` first-fit vs leftovers 形态 bench（无 CI 时限） |
| R21-gpt-server | `trustProxy` 时 `X-Forwarded-For` 取最右跳；index.ts **398** 行 |

## 约束

禁止 Playwright、支付、CMYK、拆 china-universities。实现文件 ≤400。未改 `stackAtMargin` clamp 堆底。
