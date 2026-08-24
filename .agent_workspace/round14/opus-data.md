# R14-opus-data — `resolveStudentLocation` 尊重 `locationScope`

- **模型**: claude-opus-5-thinking-high-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（未 commit / stash / 建分支 / push）
- **允许改动**: `src/lib/student-data.ts`、`src/lib/student-data.test.ts`、`src/lib/data-health.ts`、`src/lib/data-health.test.ts`（只改了这四个）

---

## 1. 修的洞

Round 13 记下的遗留项：`resolveStudentLocation` 不看 `locationScope`。

```ts
// 修前
{ id: "stale", name: "苏禾", university: "哈佛大学", city: "美国·波士顿",
  province: "浙江省", locationScope: "international", visibility: true }
// resolveStudentLocation → { city: "美国·波士顿", province: "浙江省", status: "resolved" }
```

一条海外记录被报成「已定位在浙江省」。导入链路会剥掉海外行的省份（`buildStudentRecords`
第 137 行），所以这条数据只可能来自**手改的工程文件或早期存档**——而这正是它危险的地方：
剥离逻辑不会再跑第二遍，省份就一直躺在那儿。

第二条更隐蔽：**省份格根本不用有东西**。海外行只要城市名字撞上中国城市目录
（`{ city: "杭州市", locationScope: "international" }`），`resolveCityLocation` 就直接
反查出 `浙江省 / resolved`。这条不需要任何历史存档就能构造出来——名单里填了个中国城市
名再把去向类型改成海外即可。原来的省份剥离逻辑对它完全无效。

**为什么今天没炸**：8 个调用方**全部**在调用前先判了 `locationScope === "international"`
（`project-data.ts:47`、`layout.ts:59-60`、`poster-canvas-geometry.ts:20`、
`data-health.ts:115/149`、`workflow-progress.ts:47/64`、`DataWorkspace.tsx:93`、
`data-workspace-student-table.tsx:157/182`、`DataUploadWorkspace.tsx:198`）。
这是「每个调用方都得记得判」的口头约定，不是函数自身的保证。

### 修法

```ts
export function isOverseasStudent(student: Pick<Student, "locationScope">): boolean {
  return student.locationScope === "international";
}

export function resolveStudentLocation(student: Student) {
  const city = trimImportCell(student.city);
  if (isOverseasStudent(student)) {
    return { city, province: "", status: "unresolved" };   // 新增，在省份覆盖之前
  }
  ...
}
```

返回形状**刻意**和 `buildStudentRecords` 给新导入海外行的那一份完全一致
（`{ city, province: "", status: "unresolved" }`，第 139-141 行），所以「刚导入的海外行」
与「存盘再读回来的海外行」现在读起来一模一样（有断言钉住）。

关于 `"overseas"` 这个字面量：磁盘上不存在。导入解析器
（`import-data.ts` 的 `INTERNATIONAL_TOKENS`）把 海外/境外/出国/overseas/abroad 一律
归一成 `locationScope: "international"`，`project-migration-students.ts:44` 也把任何
非 `"international"` 的值归到中国去向。所以「disk equivalent」就是 `"international"`，
判断收进 `isOverseasStudent` 一处，不再让字面量散落各文件。

### `status` 语义与调用方

R13 提出的顾虑是「海外记录从已定位变未定位」会不会误伤 UI。逐个核过：

| 调用方 | 用法 | 结论 |
| --- | --- | --- |
| `data-health.ts:115/149`、`workflow-progress.ts:47/64`、`DataWorkspace.tsx:93` | 先判海外再看 `status` | 不变 |
| `data-workspace-student-table.tsx:157` | `isInternational ? "" : location.status === "unresolved" ? "is-unresolved" : ""` | 海外行走前一分支，拿不到 `is-unresolved` 样式，不变 |
| `project-data.ts:48`、`layout.ts:69/84`、`poster-canvas-geometry.ts:21`、`DataUploadWorkspace.tsx:199` | 先滤掉海外，只取 `.province` | 不变 |
| `poster-card-rows.ts:227/243` | **没判海外**，取 `.province` 填卡片表达式变量 | 残留省份 → `""`，是修正 |

`status` 现在的含义是「在不在中国地图上」，不是「数据有没有错」。这句话写进了函数
文档注释，同时明确要求上报 `城市未匹配` 的调用方仍需先问 `isOverseasStudent`——
`data-health.ts` 和 `workflow-progress.ts` 里那两处 `!== "international"` 判断
**不是冗余，是必需**，删掉就会把每条海外记录报成城市未匹配。已在 `data-health.ts`
的两处加注释说明，避免后人当成死代码清掉。

## 2. 顺带修的第二个洞：海外记录被塞进「指定省份」修复流程

`listDataIssues` 见到非空 `student.province` 就发一条 `manual-province`
（文案「使用省份覆盖：浙江省」）。而 `DataUploadWorkspace.tsx:192-194` 把
`unresolved-location` + `manual-province` 两类问题喂进「地图映射」面板，每行配一个
**「指定省份」按钮**（`:59-65`），点下去 `onUpdateStudent(id, { province })`。

于是修完第 1 条后，海外残留省份会变成一个纯粹的死循环 UI：面板说「使用省份覆盖：浙江省」，
用户按提示指定一个省份，写进数据，`resolveStudentLocation` 照旧忽略，地图上什么也不会发生。
`stage-overview.ts:124-126` 还会把它算进「N 人使用手动省份覆盖（优先于自动定位）」——
对海外记录这句话是假的。

改法：海外记录不发 `manual-province`，把残留省份写进它本来就会有的 `international` 条目里：

```
海外去向：美国·波士顿（省份 浙江省 不参与中国地图，已忽略）
```

信息不丢（用户仍看得到这个残留值、能从数据质量面板「定位」到行去清理），但不再伪装成
一个点了有用的修复动作。中国去向记录的 `manual-province` 行为一字未改。

## 3. 验证（failure → cause → fix → recheck）

**failure**：新加的 3 条 `student-data.test.ts` 用例在旧实现下红：

```
× ignores a province left behind on an overseas destination
    expected { city: '美国·波士顿', province: '浙江省', status: 'resolved' } to deeply equal { province: '', status: 'unresolved' }
× ignores a Chinese city on an overseas record instead of deriving its province
    expected { city: '杭州市', province: '浙江省', … } to deeply equal { city: '杭州市', province: '', … }
× reads a stored overseas record exactly as the importer built it
```

新加的 2 条 `data-health.test.ts` 用例在旧 `listDataIssues` 下红：

```
× keeps an overseas record out of the unresolved count when a stale province survives
    + "detail": "使用省份覆盖：浙江省"   ← 多出来的 manual-province 条目
× does not offer a province override as the fix for an overseas record
    expected [ 'manual-province:overseas', 'manual-province:china' ] to deeply equal [ 'manual-province:china' ]
```

（红色状态是把 `isOverseasStudent(student)` 短路成 `false && …`、把 `province && !overseas`
短路成 `province && !false` 临时制造出来的，两处随后原样改回。）

**cause**：`resolveStudentLocation` 的分支顺序里没有 scope 这一层，省份覆盖分支和城市反查
分支对海外行一视同仁；`listDataIssues` 的 `manual-province` 判定同样只看省份格非空。

**fix**：函数开头加 scope 短路 + 抽出 `isOverseasStudent`；`listDataIssues` 的
`manual-province` 加 `!overseas`，残留省份改由 `internationalDetail` 表述。

**recheck**：

| 检查 | 结果 |
| --- | --- |
| `npx vitest run src/lib/student-data.test.ts src/lib/data-health.test.ts` | 2 files / **40 tests 全绿** |
| `npx tsc -b --force` | 绿（app + node 两个 project） |
| `npx eslint`（四个文件） | 无输出 |
| `npm test` 全量 | **204 files / 1779 tests 全绿** |

首次全量跑出现过 3 条红（`layout-health.test.ts` 的 `targets` 断言），是并发的
R14-fable-arch 正在同一 worktree 里改 `layout-health.ts`/其测试造成的瞬时不一致；
与本轮四个文件无交集，隔一会儿重跑即全绿（用例数 1771 → 1779 也说明期间有别的代理在写入）。

行数：`student-data.ts` 207、`student-data.test.ts` 377、`data-health.ts` 184、
`data-health.test.ts` 286，均 ≤400。

## 4. 新增/改动的用例

`src/lib/student-data.test.ts`（+4）

| 用例 | 钉住的行为 |
| --- | --- |
| `ignores a province left behind on an overseas destination` | 残留 `浙江省` → `{ province: "", status: "unresolved" }` |
| `ignores a Chinese city on an overseas record instead of deriving its province` | 海外行城市撞中国目录也不反查省份（同时断言 `resolveCityLocation("杭州市").province === "浙江省"`，证明差别来自 scope 而非城市不认识） |
| `keeps resolving a record that is explicitly a China destination` | `locationScope: "china"` / `undefined` 照常解析；`isOverseasStudent` 三种取值 |
| `reads a stored overseas record exactly as the importer built it` | 导入产出的海外记录，手工补回省份后读数与原来相同 |

`src/lib/data-health.test.ts`（改 1 + 新 1）

| 用例 | 钉住的行为 |
| --- | --- |
| `keeps an overseas record out of the unresolved count when a stale province survives`（R13 留下，本轮更新断言） | 仍是 `unresolved: 0 / international: 1`；问题清单从 `[manual-province, international]` 变成只有 `international`，并断言新文案 |
| `does not offer a province override as the fix for an overseas record` | 海外 + 中国两条都带 `浙江省`，地图映射面板的筛选口径下只剩 `manual-province:china` |

## 5. 交付与回滚

- **验收方式**：`npm test`（含上述 6 条用例）+ `npx tsc -b`。手动验收路径：在名单里建一条海外记录，
  用「省份 ✎」给它写一个省份 → 省份地图/省份卡片不应出现该省，数据质量面板只出现一条
  「海外去向：…（省份 … 不参与中国地图，已忽略）」，地图映射面板不再出现这条记录。
- **数据格式**：未改。`Student` 结构、`locationScope` 取值、导出格式、API 形状均无变化，
  纯读取侧行为。工程文件里的残留省份**保留不动**（不静默改写用户数据），只是不再被读。
- **回滚**：`git checkout -- src/lib/student-data.ts src/lib/data-health.ts src/lib/student-data.test.ts src/lib/data-health.test.ts`。
  单点回滚可只删 `resolveStudentLocation` 里那 3 行 scope 短路（其余改动不依赖它），
  或只把 `listDataIssues` 的 `province && !overseas` 改回 `province`。
- **面向用户的可见变化**：数据质量面板里，带残留省份的海外记录少一条 info 条目、
  `海外去向` 条目文案变长；「地图映射 · 省份管理」列表不再收录这类记录。
  没有告警被降级或消失——`manual-province` 本来就是 info，且它描述的动作对海外记录无效。

## 6. 已知遗留（未修，均在允许范围外）

1. **`project-migration-students.ts:44` 把非 `"international"` 的 scope 一律归到中国去向。**
   手写 `locationScope: "overseas"` 的工程文件会被迁移成中国去向，再带上省份就还是会上中国地图。
   本轮改不到那个文件；`resolveStudentLocation` 拿到的 `Student` 一定是迁移后的，所以在函数里
   兼容 `"overseas"` 字面量对生产路径没有增量收益，没有加。要收口应当在迁移层把未知 scope 值
   记为 warning 或保守地按海外处理。
2. **`poster-card-rows.ts:227/243` 仍在没判海外的情况下调 `resolveStudentLocation`。**
   现在拿到 `""` 已经是对的，但那两处的 `group.students[0]!` 假设组内同质，和 `:210`
   的 `every(...)` 口径并不一致（混合组会取首个学生）。属于卡片表达式的问题，不在本轮路径内。
3. **海外残留省份没有一键清理入口。** 用户只能「定位到名单」后手工清空省份格。
   加清理动作要动 `DataUploadWorkspace.tsx` / 事务层，超出本轮文件范围。
