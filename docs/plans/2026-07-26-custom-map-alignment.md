# 自定义覆盖地图适配实现计划

**日期：** 2026-07-26  
**状态：** 执行中  
**目标：** 自定义图片/覆盖地图与原 SVG 省份几何、命中、数据定位统一适配

## 决策

1. 原 SVG GeoJSON 始终是几何与交互基准。
2. 图片地图扩展 `alignment / composition / clipToMap`，不再只靠 `fit`。
3. 第一版：自动边界适配 + 手工 x/y/宽高/旋转 + 覆盖/替换 + 裁剪到全国轮廓。
4. 仿射控制点求解作为纯函数落地，为后续三点校准 UI 预留。

## 任务

1. `map-alignment` 纯函数 + 测试
2. `MapRenderSource` 合同、normalize、migration
3. `MapLayer` 渲染变换与图层策略
4. `MapInspector` 适配控件
5. 回归测试与构建

## 验收

- 旧项目只有 `fit/opacity` 时行为不变（默认 replace + 无 alignment 走 fit）
- 有 alignment 时图片按 x/y/width/height/rotation 放置，`pointer-events=none`
- overlay 模式保留矢量填充；replace 隐藏填充
- clipToMap 时图片裁剪到省份路径并集
- 检查器可改 composition/clip/对齐参数，可触发自动适配
