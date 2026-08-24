# Round 19 结论简报

- **时间**: 2026-08-24
- **前置**: Round 18 BRIEF（210 files / 1846 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；`npx eslint . --max-warnings 0` 0 warning；全量 vitest **211 files / 1853 tests passed**（74.33s）

## 相对 Round 18

| 代理 | Round 18 | Round 19 |
| --- | --- | --- |
| R19-fable-arch | 5 条 react-refresh 警告 | 拆 theme/标签/返回钮；eslint 零警告 |
| R19-fable-sota | 设置 skip-link | 顶栏/经典皮装饰图标 `aria-hidden` |
| R19-opus-layout | space 可选 + 原点回落 | `orderResult` space 必填 |
| R19-opus-data | 有分隔符才丢序号列 | 空白粘贴前导数字 token 也丢 |
| R19-gpt-perf | — | 诚实跳过 |
| R19-gpt-server | gzip * | 可压缩静态资源始终 Vary；CI `--max-warnings 0`（主调度在拆分后加上） |

## 验证链

| failure | cause | fix | recheck |
| --- | --- | --- | --- |
| `1 林舟 北京大学 北京市` 姓名=1 | unlabeled 空白切分不走 Round 18 列过滤 | 前导 SERIAL_CELL 且剩余 ≥3 段则 slice | import 套件绿 |
| eslint 5 警告 | 组件文件导出非组件 | 抽模块 | `--max-warnings 0` 0 |
| `orderResult([], [])` 仍编译 | space 可选 | 改为必填 | tsc TS2554 探针后删除；tsc 绿 |

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作 flock 只保证单机。
- 饱和溢出仍堆在 `y = maxY`。浏览器 PNG 仍为 sRGB。
