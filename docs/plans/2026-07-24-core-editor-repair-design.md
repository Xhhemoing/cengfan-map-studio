# 蹭饭图编辑器核心修复设计（方案 B，批注版）

**状态：** 已批准  
**日期：** 2026-07-24  
**范围：** 人员编辑、专业属性检查器、地域素材真实应用  
**基线：** `8355ac5`，18 个测试文件 / 47 项测试通过

## 1. 目标

修复当前版本中三条断裂链路：

1. 人员信息只能新增三字段候选，不能完整编辑、删除和控制显示。
2. 右侧栏只是项目摘要，不能编辑画布、地图、卡片和特殊备注。
3. 素材虽然能上传和绑定，但缺少明确选区、实例变换、裁剪、层级、删除以及完整渲染/导出闭环。

采用“精简人员模型 + 参数化场景文档”的方案 B。继续使用 React、TypeScript 和 SVG，不迁移 Fabric.js/Konva，不引入重量级画布引擎。

## 2. 已确认产品约束

### 2.1 人员模型

人员正式数据只保留：

```ts
interface Student {
  id: string;
  name: string;
  university: string;
  city: string;
  visibility: boolean;
}
```

- `id` 由系统生成并保持稳定，不在普通表单中修改。
- `name` 可自由输入和修改。
- `university` 可自由输入，同时提供本地自动搜索匹配。
- `city` 可自由输入，同时提供本地自动搜索匹配和省份派生。
- `visibility=false` 的人员仍保存在项目中，但不参与地图统计、布局、卡片、图钉、热力和导出。
- 不实现任意自定义字段，不保留 `province`、`major`、`locationStatus`、`raw` 为正式项目字段。
- 省份与定位状态通过城市目录派生，不冗余写入 `Student`。

### 2.2 属性检查器

采用专业设计器模式：

- 点击画布空白：右栏显示画布属性。
- 点击地图：显示地图位置、大小、缩放及地图样式。
- 点击卡片区域：显示卡片布局与样式。
- 点击任意文本：显示内容、位置、字号、颜色、字重、对齐、宽度、显隐。
- 点击素材实例：显示绑定地区、模式、位置、大小、旋转、透明度、层级等。
- 属性修改走项目事务，支持撤销、重做、自动保存和最终导出。
- 当前选择属于 UI 状态，不写入项目快照和自定义模板，也不进入历史。

### 2.3 文本范围

全部文本可编辑：

- 主标题
- 副标题
- 眉题
- 统计文案
- 页脚水印
- 特殊备注
- 用户新增文本

每个文本元素支持内容、`x/y`、字号、颜色、字重、对齐、最大宽度和显隐。内置文本使用稳定 `role`，但与普通文本共享渲染和检查器。

### 2.4 素材范围

采用地域强化方案：

- 背景：应用为画布背景，可调填充模式、透明度并可清除。
- 省份纹理：按省份路径裁剪到地图内部。
- 地域地标：绑定省份，默认位于该省质心附近，可移动、缩放、旋转、调透明度和层级。
- 普通装饰：可添加到画布，支持移动、缩放和删除；不实现复杂滤镜。
- 同一省份可有多个实例；用户必须明确选择省份，不再默认绑定“人数最多省份”。
- 素材库记录与画布素材实例分离：删除实例不删除素材源，删除用户素材源时处理已有实例引用。

## 3. 架构

```text
数据录入 / Excel / OCR / AI
  -> 候选确认
  -> Student[]（精简正式模型）
  -> 城市目录派生省份和定位信息
  -> 仅筛选 visibility=true
  -> 地图统计 / 布局 / 图钉 / 热力

ProjectDocument v2
  -> Canvas / Map / Cards / Text / Asset Instances
  -> SVG Scene Renderer
  -> 页面预览
  -> SVG / PNG 导出

画布点击
  -> Selection（仅 UI）
  -> Context Inspector
  -> Transaction
  -> ProjectDocument v2
  -> 重新渲染 + 历史 + 自动保存
```

## 4. 项目文档 v2

### 4.1 场景状态

```ts
type SceneSelection =
  | { type: "canvas" }
  | { type: "map" }
  | { type: "cards" }
  | { type: "text"; id: string }
  | { type: "asset"; id: string };

interface CanvasSettings {
  width: number;
  height: number;
  safeMargin: number;
  backgroundColor: string;
  backgroundImageSrc?: string;
  backgroundFit: "cover" | "contain" | "stretch";
  backgroundOpacity: number;
}

interface MapSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  landColor: string;
  activeColor: string;
  edgeColor: string;
  showProvinceLabels: boolean;
}

interface CardSettings {
  preset: CardPreset;
  grouping: CardGrouping;
  x: number;
  y: number;
  maxWidth: number;
  padding: number;
  gap: number;
  columns: number | "auto";
  background: string;
  textColor: string;
  visibleFields: Array<"name" | "university" | "city">;
}

interface CanvasText {
  id: string;
  role: "eyebrow" | "title" | "subtitle" | "stats" | "watermark" | "note" | "custom";
  content: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: number;
  textAlign: "left" | "center" | "right";
  maxWidth: number;
  visibility: boolean;
}

interface AssetElement {
  id: string;
  assetId: string;
  label: string;
  src: string;
  kind: "province-texture" | "landmark" | "decoration";
  province?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visibility: boolean;
}
```

`ProjectDocument` 保存 `students`、`canvas`、`map`、`cards`、`textElements`、`assetElements`、模板/视图、版本和历史。现有 `style.regionalAssets` 迁移后停止作为主状态。

### 4.2 单一事实来源

- 页面预览、模板保存、SVG 和 PNG 导出全部读取项目文档。
- 不允许 UI 控件维护一份未落入文档的视觉参数。
- 所有项目写操作通过事务 helper；连续滑杆拖动在 UI 侧合并，避免每个像素生成一条历史。
- 自定义模板保存视觉场景，不保存 `students`。

## 5. 人员编辑与自动匹配

### 5.1 数据工作台

人员列表提供：

- 新增
- 行内编辑名称、院校、城市
- 保存/取消
- 删除（明确确认）
- 单行 visibility 开关
- 全部显示 / 全部隐藏
- 搜索和按城市筛选

更新院校或城市时展示组合框：

- 支持键盘上下键、Enter、Escape。
- 输入仍允许保留自定义值。
- 匹配按标准化文本、别名、前缀和包含关系排序。
- 城市选择项显示“城市 · 省份”。
- 院校选择项显示“院校 · 城市”（目录存在城市时）。

### 5.2 本地目录

建立独立目录模块：

- `src/data/china-cities.ts`：城市标准名、别名、省份。
- `src/data/china-universities.ts`：院校标准名、别名、所在城市。
- `src/lib/search-catalog.ts`：标准化、查询、排名和精确解析。

不要求联网。目录未覆盖的值可以保存；无法派生省份时归入“未知”，并在编辑器中提示，但不删除记录。

## 6. SVG 场景渲染

将当前巨型 `MapCanvas` 拆为：

- `PosterCanvas`：SVG 根节点、背景、选择分发。
- `MapLayer`：地图框、投影、路径、标签和点击选择。
- `RegionalAssetLayer`：省份纹理裁剪与地标。
- `MapDataLayer`：卡片、图钉、热力。
- `TextLayer`：所有内置和用户文本。
- `DecorationLayer`：普通装饰。

投影使用 `map.x/y/width/height/scale` 计算，不再依赖固定 `canvas` 和 `mapFrame` 常量。省份纹理通过每个省份路径对应的 `clipPath` 或 SVG `pattern` 应用；地标默认使用省份质心定位，但实例坐标可覆盖。

图层按稳定顺序渲染，并在同类素材内按 `zIndex` 排序：

1. 画布背景
2. 背景图片
3. 地图底色与省份纹理
4. 地图边界、热力和图钉
5. 地域地标
6. 卡片与连接线
7. 普通装饰
8. 文本
9. 编辑态选框（导出时不包含）

## 7. 专业属性检查器

新建 `InspectorPanel`，按选择类型组合子面板：

- `CanvasInspector`
- `MapInspector`
- `CardsInspector`
- `TextInspector`
- `AssetInspector`

通用控件：数字输入 + 滑杆、颜色、分段按钮、开关、层级按钮、删除、重置。所有输入设置合理边界，例如画布 `320–6000`、字号 `8–240`、透明度 `0–1`。无效值不写入项目。

选中对象删除后自动退回画布选择；撤销恢复对象时不自动恢复旧选择。

## 8. 迁移与兼容

载入旧草稿时执行 v1 -> v2：

- `Student` 取 `id/name/university/city`，添加 `visibility=true`；丢弃 `province/major` 等派生或无范围字段。
- 旧 `style.mapScale/backgroundColor/backgroundImageSrc/cardPreset/visibleFields` 写入新场景对象。
- 固定画布 `1500×1000` 和地图框 `350,120,800,690` 作为默认值。
- 旧特殊备注迁移为 `role="note"`；缺失的标题、眉题、统计、水印生成默认文本元素。
- 旧 `regionalAssets` 每项转换为 `AssetElement`，按省份质心给初始坐标。
- 保存时写 `schemaVersion: 2`；恢复仍兼容旧 JSON。
- 模板存储也做版本容错；模板永远不得保存人员数据。

## 9. AI 与命令边界

本轮不扩展自然语言能力范围，但要让现有命令适配 v2：

- `setMapScale` 写 `project.map.scale`。
- `setCardPreset` 和 `setVisibleFields` 写 `project.cards`。
- `setBackgroundColor` 写 `project.canvas`。
- `moveText` 更新完整文本元素。

后续 AI 可基于同一目标对象扩展画布、地图、文本和素材命令，不允许直接改 SVG。

## 10. 错误处理

- 自动匹配失败：保留用户原值并提示，不阻止保存。
- 城市无法定位：展示“未匹配城市”，该人员可用于列表，但地图统计归入未知。
- 图片加载失败：素材实例显示错误占位和“替换/删除”，导出前给出警告。
- 数字越界：控件显示校验信息，项目不写入非法值。
- 旧草稿迁移异常：回落到安全默认场景，同时保留可解析的人员记录。
- 本地存储配额不足：页面提示素材过大，项目内存状态保持可用。

## 11. 测试策略

- 纯函数单元测试：人员模型、搜索排名、城市派生、可见性筛选、场景更新、迁移、资产实例、图层排序。
- 组件测试：可搜索组合框、人员编辑、检查器切换与事务回调、素材省份选择和应用。
- SVG 渲染测试：动态 viewBox、地图 frame、文本属性、纹理 clipPath、素材层级。
- 持久化测试：v1 草稿迁移、v2 往返、模板剔除人员。
- 集成验证：人员编辑 -> 地图更新；右栏修改 -> 画布/导出更新；素材应用 -> 预览/保存/恢复/导出一致。
- 全量门禁：`npm test`、`npm run lint`、`npm run build`。

## 12. 非目标

本轮不实现：

- 任意人员字段定义。
- 实时联网院校/城市 API。
- 多人协作和云端项目。
- 自由贝塞尔连线编辑。
- 复杂图片滤镜、蒙版绘制工具或类似 Photoshop 的操作。
- 更换 SVG 地图引擎。
