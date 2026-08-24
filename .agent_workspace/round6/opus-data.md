# R6-opus-data — AssetPanel 与 image-color 拆分

分支:`cursor/r6-split-asset-panel-1929`(未提交,按任务要求)

## 1. AssetPanel.tsx 754 → 180 行

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `src/components/AssetPanel.tsx` | 180 | 公共 props + 素材派生列表 + 组合各分区 |
| `src/components/asset-panel-uploads.tsx` | 255 | `useAssetPanelUploads`:FileReader 上传、抠图、贴图底色推断(upload) |
| `src/components/asset-panel-province-appearance.tsx` | 346 | 省份外观工作区:省份选择、贴图上传、纯色、智能匹配、高级贴图布局(usage) |
| `src/components/asset-panel-library.tsx` | 136 | 已保存省份贴图 + 已上传通用素材两个清单与删除/抠图入口(list) |
| `src/components/asset-panel-upload-sections.tsx` | 73 | 画板图片上传、SVG 导入、本地资源包导入导出 |

- `AssetPanel` 的公共 props 与 DOM/aria 结构、消息文案完全未变,仅把局部 UI 状态(`provinceFilter`、`provinceColor`)下沉到省份分区组件。
- 无新增产品功能。

## 2. image-color.ts 555 → 112 行(颜色提取 vs 配色)

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `src/lib/image-color.ts` | 112 | `inferImageTheme` 编排 + DOM 取像素(`extractImageTheme`/`extractImageColor`)+ 公共导出 |
| `src/lib/image-color-space.ts` | 126 | Oklab/Oklch 色彩空间、hex 转换、混色、对比度 |
| `src/lib/image-color-clusters.ts` | 207 | 像素采样/前景提取/加权 k-means/簇合并 + `representativeImageColor`(提取) |
| `src/lib/image-color-palette.ts` | 124 | 背景候选生成、背景挑选、兜底主题、相邻省份去撞色(配色) |
| `src/lib/image-color-types.ts` | 27 | `ImageThemeResult` 等共享类型 |

对外 API 不变:`inferImageTheme`、`representativeImageColor`、`optimizeNeighborThemeColors`、`extractImageTheme`、`extractImageColor` 及类型仍从 `src/lib/image-color` 导出。

## 3. 验证(failure → cause → fix → recheck)

1. **基线**:`npx vitest run src/components/AssetPanel.test.tsx src/lib/image-color.test.ts` → 26 passed(拆分前)。
2. **拆分后同一命令** → 26 passed;附带 `AssetPanel.appearance`、`AssetPanel.live-preview`、`ProvinceTextureSizeControls`、`inspector/ProvinceInspector` 共 6 文件 35 passed。
3. **数值一致性**:临时对拍脚本把 `git show HEAD:src/lib/image-color.ts` 拷到 `/tmp`,对 40 组伪随机图片比对 `inferImageTheme`(默认与自定义底色两种参数)、`representativeImageColor`,以及 20 组 `optimizeNeighborThemeColors` 结果 → 全部 `toEqual` 通过。
   - 变异校验:把 `/tmp` 副本里 `0.28 * subjectContrast` 改成 `0.29` 后对拍立即失败,证明对拍确实在比对旧实现;随后还原并复跑通过,对拍脚本已删除(依赖 `/tmp` 路径,不入库)。
4. **静态检查**:`npx eslint`(本次涉及文件)0 error 0 warning;`npx tsc -p tsconfig.app.json --noEmit` 中仅剩 `src/lib/useCollaborationRoom.test.ts` 的既有报错(他人未跟踪文件,非本次改动)。

## 4. 交付与回滚

- 未提交、未推送(任务要求)。改动为纯结构拆分:回滚只需 `git checkout HEAD -- src/components/AssetPanel.tsx src/lib/image-color.ts` 并删除新增的 `asset-panel-*.tsx` / `image-color-*.ts`。
- 无数据、导出格式或 API 形状变更。
