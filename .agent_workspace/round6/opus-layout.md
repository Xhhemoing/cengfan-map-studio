# R6-opus-layout — MapLayer / MapDataLayer 拆分（493 + 508 → 全部 ≤400）

## 结果

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `src/components/canvas/MapLayer.tsx` | 218 | 只做组合:分层顺序、图片 z 平面、交互开关；公共导出 `MapLayer` / `MapLayerProps` / `MapLayerThemeColors` / `StudentPin` 不变 |
| `src/components/canvas/MapDataLayer.tsx` | 113 | 只做组合:贴图预览状态、描边解析、fills → textures → editors → borders 的渲染顺序；公共导出 `MapDataLayer` / `MapDataLayerProps` 不变 |
| `map-data-projection.ts`(新) | 59 | `getFeatureSplit`(南海分割 WeakMap 缓存) + `fitFeatureProjection`(mercator fitExtent，返回 `path/bounds/center/centroid/project`) |
| `map-layer-image.tsx`(新) | 77 | `renderMapImage` 与 `BORDER_Z` / `LABEL_Z` 平面常量 |
| `map-layer-image-handles.tsx`(新) | 22 | `MapImageResizeHandles`(单独成文件以满足 react-refresh/only-export-components) |
| `map-layer-south-sea.tsx`(新) | 80 | `SouthSeaInset` 插图框 |
| `map-layer-marks.tsx`(新) | 149 | `StudentPins` / `ProvinceLabels` / `ProvinceHitAreas` |
| `map-data-province-style.ts`(新) | 33 | `provinceVisible` / `textureSource` / `textureLayout` / `isOverflowTexture` / `hasTexture` |
| `map-data-fills.ts`(新) | 81 | 海报调色板、热力色、`provinceFillReference` |
| `map-data-textures.ts`(新) | 118 | `resolveBounds` / `resolveCenter` / `provinceTextureRecords` 与 `TexturePreview`、`ProvinceTextureRecord` 类型 |
| `map-layer-texture-nodes.tsx`(新) | 102 | `textureClipDefs` / `provinceTextureNodes` / `edgeFilterDefs` / `strokePath` |
| `map-layer-texture-editor.tsx`(新) | 128 | `ProvinceTextureEditors`(含 `eventPoint` 与拖拽 ref) |
| `map-data-projection.test.ts`(新) | 69 | 投影模块单测 + 两个实现文件 ≤400 行的预算守卫 |

依赖方向单向无环:`province-style ← fills / textures ← texture-nodes / texture-editor ← MapDataLayer ← south-sea ← MapLayer`;
`map-layer-south-sea.tsx` 与 `map-layer-marks.tsx` 对 `MapLayer` 只有 `import type`(编译期擦除，无运行时循环)。

## 投影 / 命中测试保持不变

- 之前 `MapLayer` 与 `SouthSeaInset` 各自写了一份 `geoMercator().fitExtent(...)` + `featureBounds` / `featureCenter`，逐字相同;
  现在两者都调用 `fitFeatureProjection`，函数体逐字搬运:`fitExtent` 的 extent 参数、`bounds` 的 `Number.isFinite(box[0][0]) && Number.isFinite(box[1][0])` 判空、`center` 的双轴有限性判空全部保持原样。
- 省份标签仍是"行政中心优先、退化到几何 centroid"(`project(feature.center)` → `centroid(feature)`)，`data-label-anchor` 取值逻辑未动。
- `ProvinceHitAreas` 的 `d` / `strokeWidth={8}` / `role="button"` / `tabIndex={0}` / `stopPropagation` 与原实现逐字相同，命中区依旧渲染在 `data-map-content` 之外、resize handles 之前。
- 贴图溢出排布仍走同一个 `resolveProvinceTexturePlacements`，`unadjustedRect` / `placement.adjusted` 语义未变。

## R5 键盘可访问性保持

`data-map-layer` 仍是 `role="group"`(无 tabindex)，"选择地图"按钮仍挂在 `data-map-frame` 上，省份/学生 pin 的 `Enter`/`Space` 仍 `stopPropagation`，因此省份激活不会被地图吞掉。
`MapLayer.test.tsx` 中的两条相关用例(frame 按钮、键盘选省不被地图抢走)保持通过。

贴图编辑器的状态切分:`texturePreview` 仍留在 `MapDataLayer`(它会回灌 `provinceTextureRecords` 的布局)，只把拖拽 ref 与指针换算下沉到 `ProvinceTextureEditors`;`onSelectProvince` 稳定，拖拽期间该组件不会卸载。

## 验证（failure → cause → fix → recheck）

1. 基线:改动前 `npx vitest run MapLayer / MapDataLayer / MapInspector / ProvinceTextureOverlap / ProvinceTexturePositioning` → 5 files / 47 tests passed(先取基线，避免把既有失败算到本次拆分头上)。
2. **failure**:拆分后 `npx eslint src/components/canvas/` 报 3 条 `react-refresh/only-export-components` 警告(`map-layer-image.tsx:11,12,14`)。
   **cause**:该文件同时导出组件 `MapImageResizeHandles` 与常量/函数 `BORDER_Z` / `LABEL_Z` / `renderMapImage`。
   **fix**:把组件单独拆到 `map-layer-image-handles.tsx`。
   **recheck**:重跑同一条 `npx eslint src/components/canvas/` → 无输出，0 errors 0 warnings。
3. 指定验证命令 `npx vitest run src/components/canvas/MapLayer.test.tsx src/components/canvas/MapDataLayer.test.tsx src/components/inspector/MapInspector.test.tsx` → 3 files / 42 tests passed。
4. 扩展回归:加上 `ProvinceTextureOverlap` / `ProvinceTexturePositioning` / `PosterCanvas` → 6 files / 97 tests passed;新增 `map-data-projection.test.ts` → 5 tests passed。
5. 全量 `npm test` → 180 files / 1564 tests passed。
6. `npx tsc --noEmit -p tsconfig.app.json`:`src/components/canvas` 相关报错 0 条。
   仅剩 2 条来自**其他 agent 本轮新增**的 `src/lib/useCollaborationRoom.test.ts`(22 行 `globalThis` 索引签名、132 行 `(() => void) | undefined`)，与本次拆分无关，属其属主 ownership。

## 交付与回滚

未提交(按要求 do not commit)。验收方式:上述 vitest / eslint / tsc 命令可复跑;新增的 `map-data-projection.test.ts` 预算守卫会在两个实现文件再次超过 400 行时直接失败。

回滚:删除本轮新增的 `map-layer-{image,image-handles,south-sea,marks,texture-editor,texture-nodes}.tsx`、`map-data-{projection,province-style,fills,textures}.ts` 与 `map-data-projection.test.ts`，再 `git checkout -- src/components/canvas/MapLayer.tsx src/components/canvas/MapDataLayer.tsx` 即可回到拆分前的 493 / 508 行版本。
纯前端组件拆分，无数据结构、导出格式或 API 形状变更，因此无数据迁移风险。

（沿用 R5 结论:本 checkout 有多 agent 并发写入，**未使用** `git stash` / `git checkout -- .` 等全局操作;基线对比只用了"改动前先跑一遍测试"的方式。）
