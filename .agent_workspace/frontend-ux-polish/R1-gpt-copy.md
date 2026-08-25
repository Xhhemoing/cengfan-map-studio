[Model: gpt-5.6-sol-xhigh-fast]
round: R1
role: probe
scope: DESIGN-CONTRACT vs 实现、文案一致性（只读；styles / ProjectWorkbench / inspector / StudioUi / 前端接线）
done:
- D1【宣发文档一致，不是 bug】工作台空态已写“毕业去向、开学合影或校庆班级图”（`src/components/workbench/ProjectGrid.tsx:33-38`），与“已覆盖开学/校庆”（`docs/产品/市场化与实用化优化.md:86,128`）一致；“仍只讲毕业季”未复现。
- D2【合规文案通过】`rg '升学率|就业率|录取率' src` 为 0；仓库文档里的命中均是“不写/禁止”等政策说明，不是页面宣称。默认阶段壳也未发现两个同权重主按钮：交付栏仅 PNG 为 `primary-button`，顶栏导出藏在次级“项目”菜单。
open:
- E1【真实 bug / P0】顶栏项目菜单在所有默认阶段都可直接“导出 PNG/SVG”（`App.tsx:565-608`; `ProjectMenu.tsx:165-185`），但默认阶段只有交付页把共享 `posterRef` 交给 `PosterCanvas`（`StageLayoutScreen.tsx:285-314`）；名单/地图/版式/内容页自己的画布均未绑定该 ref，故这些页面点顶栏导出会落到“海报预览尚未准备好”（`usePosterExport.ts:91-100,181-195`）。这是全局快速入口与实际画布断线。
- E2【真实 bug / P0】AI 待确认方案进入 `renderProject`（`App.tsx:249-257`; `AgentAssistant.tsx:537-540,553-558`），交付预览/ref 也渲染该对象（`StageLayoutScreen.tsx:287-313`），但 `usePosterExport` 同时持有已提交的 `project`。结果 PNG/SVG 会序列化未确认预览 DOM，而 PNG 像素尺寸/工程包仍取已提交工程（`usePosterExport.ts:98-103,126-140,193-202`），既绕过“确认后应用”，又会在预览改画布尺寸时产生预览、PNG、工程包三方不一致。
- E3【真实 bug / P1】规范固定默认“导出 2× PNG”（`frontUI2.md:602-616,993`），实现却以 `pngScale = 1` 初始化（`src/lib/usePosterExport.ts:86`），交付主按钮还只写“PNG”（`src/components/workspaces/DeliveryWorkspace.tsx:131-141`），首次导出行为与文案均漂移。
- E4【真实 contract drift / P1】Atelier token 并非“完全未用”：`--atelier-space-*`/`--atelier-radius-*` 有消费；但权威契约的 `--radius-sm/md/lg`、`--shadow-popover/dialog` 在 `src/` 为 0 命中，实际另建 7px/10px 半径（`src/styles.css:2909-2954`），且 light/dark 色值也未采用契约表（`src/styles.css:2318-2347` vs `docs/design/DESIGN-CONTRACT.md:32-52,70-78`）。这是语义词表分叉，不是 classic 海报色应被 token 化。
- E5【真实 bug / P1】Atelier 专属规则仍硬编码浅色并位于通用 dark 规则之后：表头/行 hover 的 `#f5f5f1/#f7faf7`（`src/styles.css:2501-2505`）覆盖 dark 表格规则（`:1379-1383`）；高级标题的 `#1c4d43/#c6d8ce`（`:2962-2968`）也无 dark token 分支。此项会在 atelier-dark 直接泄漏浅色，不应归为 classic 皮肤残留。
- E6【legacy/classic 兼容残留 / P2，非默认路径 bug】右侧检查器仍显示“全局设置（画布·地图·字体排版）”，整屏再次复用 Canvas/Map/Cards inspector（`InspectorPanel.tsx:101-107`; `GlobalSettingsScreen.tsx:261-359`），与 `frontUI2.md:51-52,891-902` 的唯一归属相反；但它只在 `cengfan-legacy-editor=1` 兼容路径可达（`App.tsx:196-199,728-730`），默认 stage-nav 明确不暴露该入口。旧路径另有顶栏 + 左栏两个导出入口，但权重不同；不要误报为默认 atelier 的双主按钮。
tests: 只读静态核验；使用 `rg` 检查禁词、token 定义/引用、全局设置可达性、按钮与 `posterRef`/`renderProject` 接线；未运行 Vitest（未改业务文件）。
p0/p1/p2: P0=E1,E2；P1=E3,E4,E5；P2=E6；D1/D2 不立项。
assumptions: “classic 皮肤残留”仅指保留的兼容视觉/路径；海报项目色（如 `InspectorPanel.DEFAULT_GUESTS`）受契约要求必须独立于 UI skin，不能当作组件硬编码色 bug。
do_not_touch: 本轮不改业务文件、权威文档、工程/导出格式或支付/套餐边界。
next: 先让全局导出读取稳定且唯一的已提交海报节点，并在存在 AI preview 时禁用导出或显式要求确认；随后统一 2× 默认值与按钮文案，再补齐契约 token 和 atelier-dark 覆盖。
