# Round 1：边界 / 交叉 / 开关探针

模型：`gpt-5.6-sol-xhigh-fast`

## 范围

仅新增以下测试文件，未修改 `card-layout.ts`：

- `src/lib/card-layout.crossing.test.ts`
- `src/lib/card-layout.overlap-flags.test.ts`
- `src/lib/card-layout.adapt.test.ts`

覆盖交叉默认约束及未约束基线、近共享锚点花束、地图/元素遮挡开关、48 卡饱和、拖拽自适应与画布夹紧、`proximity`/`columns` 确定性。未落地能力均采用运行时行为探针配合 `it.skipIf`，避免旧 API 阶段误红或假绿。

## 最终结果

执行：

```text
npx vitest run src/lib/card-layout.crossing.test.ts src/lib/card-layout.overlap-flags.test.ts src/lib/card-layout.adapt.test.ts
```

结果：

```text
Test Files  3 passed (3)
Tests       4 passed | 5 skipped (9)
```

### 通过（4）

1. 近共享锚点的曲线花束只在锚点附近汇合，不计作中段交叉。
2. `allowMapOverlap: false` 时夹紧位置避开 `occupiedPolygons`，`true` 时允许保留地图内目标坐标。
3. `allowElementOverlap: false` 避开 `elementAreas`，`true` 可覆盖元素，但在 `allowMapOverlap: false` 时仍然避开地图。
4. 48 卡小画布饱和输入不抛异常，且始终返回与输入等长的 `placements`。

### 跳过（5）

1. `forbidConnectorCrossing`：运行时 getter 探针确认当前 `solveCardLayout` 尚未读取该选项；交叉配置、默认开启和相对未约束基线测试跳过。
2. `adaptCardLayout`：动态导出检测不到函数；“邻居让开”和“画布外目标夹紧”两项跳过。
3. `proximity` / `columns`：虽然类型和 `scene-document.ts` 的模式列表已出现名称，但求解结果仍与 `quadrant` 完全相同；行为探针判定求解器模式未落地，两项确定性测试跳过。

## failure → cause → fix → recheck

- failure：首次执行为 `1 failed | 3 passed | 5 skipped`；近共享锚点花束断言得到 1 次交叉。
- cause：测试用 `straight` 构造整条单段长线。现有共享锚点豁免只排除完整落在锚点半径内的短尾段，长直线起点远离锚点，因此该构造不代表可被识别的“仅锚点附近汇合”花束。
- fix：仅修改自有测试，把花束探针改为 `curve` 的确定性分段几何；交叉开关测试仍单独保持 `straight`，满足直线交叉边界要求。
- recheck：同一命令最终 `4 passed | 5 skipped`，无失败。

## 待实现合入后复验

- `forbidConnectorCrossing` 默认硬约束与 `false` 基线。
- `adaptCardLayout` 的 moved-card 坐标稳定性及同侧邻居推开。
- `proximity`、`columns` 真正进入求解分支后的重复求解深相等。
