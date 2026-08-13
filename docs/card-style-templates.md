# 蹭饭图 · 展示框样式模板库（v0.2 已实现）

> **更新日期**：2026-08-13（模板库已落地）
> **基于代码**：src/lib/card-templates.ts + src/components/BlockStylePanel.tsx + src/components/inspector/CardsInspector.tsx + src/lib/scene-document.ts
> **目的**：让用户和开发者清楚「当前版本能做出哪些样式」，以及如何扩展官方模板。

---

## 一、核心预设（Preset）—— 5 种基础视觉

| ID | 名称 | 视觉特征 | 典型使用场景 | 当前实现方式 |
|----|------|----------|--------------|--------------|
| `standard` | 标准卡片 | 白色背景 + 浅灰细边框 + 8px 圆角，字段垂直堆叠 | 常规毕业去向表 | 默认值 |
| `ticket` | 票券风格 | 白色背景 + 较粗虚线边框 + 左右大留白 + 撕票感 | 电影票、车票、邀请函风格 | `preset: "ticket"` |
| `photo` | 照片卡片 | 左侧小缩略图位（可放省份贴图）+ 右侧文字区 | 想在卡片内展示地域特色的场景 | `preset: "photo"` + `showProvinceTexture: true` |
| `borderless` | 无边框极简 | 纯背景色、无边框、极简留白 | 杂志风、现代简约、深色背景 | `preset: "borderless"` |
| `compact` | 紧凑卡片 | 标准样式但行间距大幅压缩 | 学生数量多（60+）需要更紧凑的场景 | `preset: "compact"` 或 `compactLayout: true` |

---

## 二、推荐组合样式样板（可直接在 UI 复现）

### 1. 经典毕业去向表（最常用）
- preset: `standard`
- compactLayout: false
- showCount: true
- showProvinceTexture: false
- grouping: `province`
- connectorStyle: `curve` + 柔光纹理
- 推荐色：背景 `#ffffff`，文字 `#1c3154`

### 2. 地域特色票券风
- preset: `ticket`
- showProvinceTexture: true（卡片内显示小地图）
- grouping: `province`
- connectorDash: `dashed`
- 适合「高考去向」强调地域感的宣传

### 3. 杂志极简风（深色/浅色均可）
- preset: `borderless`
- background: `#f8f9fa` 或 `#1a1f2e`（深色）
- textColor: 对应高对比色
- compactLayout: true
- showCount: false（干净）
- 连接线用 `curve` + 极细

### 4. 照片+贴图混合风
- preset: `photo`
- showProvinceTexture: true
- grouping: `city`
- 每张卡片左侧显示对应省份/城市贴图，右侧显示姓名+院校

### 5. 超紧凑名单风（60+ 学生）
- preset: `compact`
- maxWidth: 180~220
- gap: 4~6
- padding: 6
- fontSize: 11~12
- showCount: true（小字）

### 6. 城市分组 + 连接线强调
- grouping: `city`
- connectorStyle: `elbow`
- connectorDash: `rail` 或 `wave`
- 适合「按录取城市」做故事线展示

### 7. 院校分组专业风
- grouping: `university`
- preset: `standard`
- showProvinceTexture: false（避免干扰）
- 字段字体使用不同字体区分「院校名」与「学生名」

---

## 三、官方模板库（10 个，src/lib/card-templates.ts）

模板选择器位于「卡片属性」面板（视觉样式下拉）与 BlockStylePanel「展示框模板」区；选择模板即应用整组样式组合，选择「✨ 自定义展示框」进入可视化编辑器（展示框 stage）。

| ID | 名称 | 核心参数 |
|----|------|----------|
| `standard` | 标准毕业去向表 | preset: standard · showCount · curve 连接线 |
| `ticket` | 票券风格 | preset: ticket · dashed 连接线 |
| `photo` | 照片卡片 | preset: photo · showProvinceTexture |
| `borderless` | 无边框极简 | preset: borderless · compactLayout · 无人数 |
| `compact` | 超紧凑名单 | standard + compactLayout + 小字号/窄间距 |
| `ticket-with-texture` | 地域特色票券 | ticket + showProvinceTexture |
| `academic` | 院校分组专业风 | grouping: university · 无贴图 |
| `city-story` | 城市分组连接线强调 | grouping: city · elbow · rail 纹理 |
| `three-line` | 姓名+大学+城市三行紧凑 | flow 模式（姓名 · 大学 · 城市 + 分隔符） |
| `flow-custom` | Flow 模式自定义样板 | flow 模式（姓名 去往 大学 · 城市） |

> 扩展方式：在 `src/lib/card-templates.ts` 的 `BUILTIN_TEMPLATES` 追加条目即可；`applyCardTemplate` 会自动合并到卡片设置，`displayFrame` 模板会自动应用 flow/fixed 排版。

---

## 四、剩余限制（后续迭代）

| 限制 | 说明 | 计划 |
|------|------|------|
| 无「用户自定义模板」持久化 | 模板库目前为内置 10 个；自定义展示框需在编辑器内手动调 | 未来支持保存当前设置为项目内模板（cards.displayFrameTemplates） |
| 模板选择器为下拉而非缩略图画廊 | 文字描述代替视觉预览 | 未来在 BlockStylePanel 提供缩略图网格 |

---

## 四、下一步建议（已完成 ✅）

1. ✅ 把 `DisplayFrame` 做成可视化「卡片模板编辑器」——复用展示框 stage（flow 拖拽/字段顺序 + fixed 绝对定位），通过「✨ 自定义展示框」入口直达。
2. ✅ 把 preset 从 4 个硬编码选项变成「可扩展模板库」——`src/lib/card-templates.ts`（10 个内置模板 + legacy preset 映射 + applyCardTemplate 纯函数）。
3. ✅ 在 BlockStylePanel / CardsInspector 增加「从模板库选择」入口——下拉选择即应用；「自定义展示框」按钮/选项切换到 frame stage。
4. ✅ 提供 10 个开箱即用的官方样板（本文件「三、官方模板库」）。

---

**本文档将随代码演进持续更新**。如需新增样板，请在此文件中补充并更新对应 UI 组件。

---
*由 Hermes Agent 基于实际代码结构生成*