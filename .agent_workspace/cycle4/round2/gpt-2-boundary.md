# Round 2 — gpt-sol-2 点亮边界测试与交叉回归

模型：`gpt-5.6-sol-xhigh-fast`

## 改动

- 删除三份测试中的能力探针、动态导入与全部 `skipIf`；改为静态导入，使导出缺失直接在收集阶段失败。
- `forbidConnectorCrossing`：对角线两卡、`straight` 连接线和已占用地图场景下，默认约束在 `solved` 时必须为 0 交叉；仅 `fallback` 可退化，且交叉数不得高于显式关闭约束的基线。
- `columns`：补充 24 卡密集场景交叉回归，默认约束的交叉数不得高于未约束基线。
- `adaptCardLayout`：实跑“拖动卡压住邻居后邻居让开”和“画布外拖动被夹紧”。
- `proximity` / `columns`：相同输入重复求解必须返回完全相同结果。
- 双遮挡开关测试同样去除能力跳过，直接验证地图与元素障碍独立生效。

## 验证

指定命令：

```text
npx vitest run src/lib/card-layout.crossing.test.ts src/lib/card-layout.overlap-flags.test.ts src/lib/card-layout.adapt.test.ts
```

结果：3 个测试文件通过，10 个测试通过，0 个跳过。

附加探针：

```text
npx vitest run src/lib/card-layout.perf.probe.test.ts -t "columns.*counts straight-connector crossings" --reporter=verbose
```

结果：探针通过；当前 `columns` 的 24 卡 seeded `straight` 场景仍有 39 次交叉。

## D2 残留

D2 尚未消除：`columns` 密集场景仍会返回带交叉的退化布局。本轮按职责只收紧测试，没有修改 `card-layout.ts`；因此 `columns` 使用“默认约束不劣于未约束基线”，严格 0 交叉断言放在有空白的 `proximity` 对角线场景。

## failure → cause → fix → recheck

- Failure：本轮指定测试未出现运行失败；Round 1 的风险是已落地能力仍可被运行时能力探针条件跳过。
- Cause：测试使用动态导入、属性读取探针和 `skipIf`，导出或 mode 回归时可能静默跳过。
- Fix：改成静态导入和无条件断言，并加入默认约束与未约束交叉基线比较。
- Recheck：指定测试 3/3 文件、10/10 用例通过且 0 skip；附加探针确认 D2 当前残留为 39 次交叉。
