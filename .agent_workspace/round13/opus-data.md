# Round 13 — R13-opus-data

MODEL_SLUG: claude-opus-5-thinking-high-fast
分支：`cursor/agent-sota-polish-cbcd`（未 commit、未 stash、未新建分支、未 push）

找到并修掉一处**静默错**：导入时的重复判定折叠规则弱于名单体检的折叠规则，
于是「导入评审说名单干净 → 体检面板说这两条是重复记录」。
这正是 Round 12 opus-data 遗留清单第 4 条的**静默那一半**（当时 `data-duplicate.ts` 不在 allowlist，
本轮我也没碰它，只把 `student-data.ts` 的口径对齐过去）。

---

## 改动文件

| 文件 | 行数 | 改动 |
| --- | --- | --- |
| `src/lib/student-data.ts` | 184 | 新增私有 `duplicateValue`；`duplicateKey` 改为逐字段折叠（`normalizeStudentName` → NFKC → 小写 → 去空白） |
| `src/lib/student-data.test.ts` | 309 | 新增 5 条：全角院校 1、中点院校 1、全角姓名 1、与体检口径一致性 1、反向负例 1 |
| `src/lib/data-health.test.ts` | 260 | 新增 2 条 near-miss 回归：省份覆盖下的空城市、海外记录残留省份 |

`src/lib/data-health.ts` 在 allowlist 内但**一字未动**——缺陷不在那里，
它读的 `duplicateStudentIds` 折叠规则本来就是对的（`data-duplicate.ts` 已有 NFKC）。
未碰 `import-data.ts` / `binary-import.ts`（R13-fable-arch 在改）。
夹具只用 林舟 / 苏禾。

---

## 缺陷：全角/中点写法的重复记录在导入时不报，进项目后才被体检翻出来

### failure（复现）

在 `student-data.test.ts` 里临时打了一段 probe（跑完即删），旧代码实测输出：

```
fullWidth      []                      ← Harvard University vs Ｈａｒｖａｒｄ　Ｕｎｉｖｅｒｓｉｔｙ
dotted         []                      ← 圣彼得堡·国立大学 vs 圣彼得堡・国立大学
fullWidthName  []  ["Ｌｉｎ Ｚｈｏｕ","Lin Zhou"]
```

三对都是同一个人被录了两遍，`buildStudentRecords().issues` 里**一条 `duplicate_name` 都没有**。

而同一批数据进了项目之后，`data-health.ts` 用的 `duplicateStudentIds` **认得出来**——
`data-health.test.ts:70`「groups records that differ only in punctuation width or middle dot」
这条既有断言就是拿 `Ｈａｒｖａｒｄ　Ｕｎｉｖｅｒｓｉｔｙ` 写的，期望 `duplicate: 2`。

所以用户看到的顺序是：导入评审「无重复」→ 确认导入 → 体检面板「2 条重复记录」。
**导入那一步是静默错的**，不是延后提示：`confirmImportCandidates` 把 `built.issues`
原样交给导入评审 UI，那里没有可显示的东西。

### cause

两处判定用了两套折叠规则：

| | 分组字段 | 折叠 |
| --- | --- | --- |
| `data-duplicate.ts::normalizeDuplicateValue`（体检） | 姓名+院校+城市+去向类型 | `normalizeStudentName` → **`NFKC`** → 小写 → 去空白 |
| `student-data.ts::duplicateKey`（导入，旧） | 姓名+院校 | 小写 → 去空白 |

旧的 `duplicateKey` 是 `` `${name}\u001f${university}`.toLocaleLowerCase("zh-CN").replace(/\s+/g,"") ``：

- **没有 NFKC**，`Ｈａｒｖａｒｄ` 小写成 `ｈａｒｖａｒｄ`（全角字母有大小写映射），和 `harvard` 仍然不等；
- **院校从没过 `normalizeStudentName`**，只被 `trimImportCell` 处理过，所以 `·` / `・` 中点变体不统一
  （姓名过了 `normalizeStudentName`，院校没过，这个不对称是旧代码里最容易漏看的一处）。

`\s` 能吃掉全角空格 U+3000，`trimImportCell` 能吃掉零宽字符，所以「补位空格」「零宽」这两类
之前就已经防住了——**只剩全角字母数字和中点这一档没折**，也正因为只剩这一档，一直没人发现。

### fix

`student-data.ts`，把折叠规则抄成和 `data-duplicate.ts` 同一套，逐字段做而不是拼完再做：

```ts
function duplicateValue(value: string): string {
  return normalizeStudentName(value).normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
}

function duplicateKey(name: string, university: string): string {
  return `${duplicateValue(name)}\u001f${duplicateValue(university)}`;
}
```

三点边界：

- **只折 key，不折落库值。** `students[].name` 仍是 `normalizeStudentName(input.name)` 的结果，
  全角姓名原样保留（新增断言 `["Ｌｉｎ Ｚｈｏｕ","Lin Zhou"]` 就是钉这个）。
  提示文案取组里第一条的原拼写，和 `data-duplicate.ts` 的行为一致。
- **分组字段仍是 姓名+院校，没跟着体检加城市/去向类型。**
  `student-data.test.ts:139`「keys duplicate warnings on name and university, not on the name alone」
  是刻意的：导入阶段判的是「同一个人录了两遍」，同一人不同城市也该提醒；
  体检判的是「整行一模一样」。字段口径的差异是有意的，折叠口径的差异才是 bug。
- 逐字段折叠后 `\u001f` 分隔符不再被 `\s` 规则波及，`("林","舟北大")` 与 `("林舟","北大")` 依旧分得开。

修完两侧构成单向包含：体检 key ⊃ 导入 key 的字段集，折叠相同，
所以**体检能报的重复，导入一定先报过**。新增的一致性断言就是钉这个方向。

### recheck

```
npx vitest run src/lib/student-data.test.ts src/lib/data-health.test.ts   → 2 files / 35 tests passed
```

分支有效性（把 `duplicateKey` 临时改回旧实现，同一条命令重跑）：

```
4 failed:
  flags a duplicate whose school differs only in full-width letters
  flags a duplicate whose school differs only in middle-dot variant
  flags a duplicate whose name differs only in full-width letters
  agrees with the roster health grouping on which records are duplicates
```

四条都红，改回来四条都绿；第 5 条负例（北京大学 vs 北京师范大学）两个方向都绿，
说明新折叠没有折过头。

---

## 两条 near-miss 回归（`data-health.test.ts`，行为本来就是对的，只是没被钉住）

按任务要求，把两个「差一点就是静默错」的路径钉成断言。这两条**修前修后都绿**，
是防回归用的，不是本轮修复的证据。

1. **省份覆盖下的空城市**（`still reports the missing city of a row placed by a province override`）。
   `resolveStudentLocation` 一旦看到省份覆盖就返回 `status: "resolved"`，
   哪怕 `city` 是全角空格 `\u3000`——也就是「trim 后空城市仍算已定位」。
   这本身是设计（省份卡片视图要收得下它），但只要 `missingFields` 有一处漏了城市，
   这一行就会既不报「缺失必要字段」也不报「城市未匹配」，彻底消失。
   断言钉的是：`unresolved: 0` 的同时 `missingRequired: 1`、`detail: "缺少城市"`。

2. **海外记录残留中国省份**（`keeps an overseas record out of the unresolved count when a stale province survives`）。
   `resolveStudentLocation` 不看 `locationScope`：给一条 `locationScope: "international"`
   且 `province: "浙江省"` 的记录，它返回 `{ province: "浙江省", status: "resolved" }`。
   `buildStudentRecords` 会剥掉海外记录的省份，但手改的工程文件 / 早期存档可能带着。
   目前**所有**调用方都在调用前先判了 `locationScope === "international"`
   （`project-data.ts:47`、`layout.ts:59-60`、`poster-canvas-geometry.ts:20`、
   `DataUploadWorkspace.tsx:198`、`data-workspace-student-table.tsx:157`、
   `data-health.ts:115/149`、`workflow-progress.ts:47/64`），所以它今天进不了地图和卡片。
   断言钉的是体检这一层：海外记录只进 `international`，永不进 `unresolved`。

---

## 排查过但**不是**缺陷的（据实记录）

- `resolveCity("")` 显式返回 `{ city:"", province:"", status:"unresolved" }`，
  `trimImportCell` 会去掉 BOM/零宽再 `trim()`（全角空格 U+3000 归 `trim()` 管）。
  「空城市被当成已定位」在**没有省份覆盖**的路径上不成立。
- `resolveProvinceName` 对非空输入永不返回空串（兜底 `?? normalizedInput`），
  所以 `province || override` 那个兜底是死分支，但不是错的，没动。
- **空姓名行的重复**：体检会把两条全空行判成重复，导入的 `if (name && count > 1)` 不会。
  看着像反向不一致，实际不可达——`confirmImportCandidates` 的 `validStudents` 会先按
  `!hasError && student.name && student.university && student.city` 把空姓名行滤掉，
  它们根本进不了项目，体检看不到。没加测试（钉一个不可达路径不划算）。
- `buildDataHealthSummary` 里 `missingRequired` 与 `unresolved` 对同一条空城市记录**双计**，
  这是两个独立指标，既有断言（第一条 summary 测试期望 `unresolved: 2`）已经钉过，是有意的。

---

## 验证

```
npx vitest run src/lib/student-data.test.ts src/lib/data-health.test.ts        → 35 passed
npx vitest run src/lib/data-duplicate.test.ts src/lib/data-workspace.test.ts \
  src/lib/workflow-progress.test.ts src/lib/project-data.test.ts \
  src/lib/layout.test.ts src/lib/import-data.test.ts \
  src/components/workspaces/DataUploadWorkspace.test.tsx                       → 7 files / 82 passed
npx vitest run（全量）                                                          → 202 files / 1755 tests passed
npx tsc --noEmit -p tsconfig.app.json                                          → 0 error（include: ["src"]，测试文件一并检查）
npx eslint src/lib/{student-data,data-health}.ts + 对应测试                      → 0 error / 0 warning
```

全量这一跑是在本轮改动之上跑的，没有失败用例，也就没有需要归因给他人在途改动的红。
（`Not implemented: navigation to another Document` 是 jsdom 的既有噪声，非失败。）

四个文件行数：184 / 309 / 168 / 260，均 ≤400，无需压行。

---

## 交付与回滚

**验收方式.** CI 跑上面两个测试文件 + `tsc` + `eslint`。
人工验收：数据工作台 → 导入 → 粘贴两行同一个人，其中一行的院校用中文输入法全角敲
（`Ｈａｒｖａｒｄ　Ｕｎｉｖｅｒｓｉｔｙ`），另一行半角。
要看的是**导入评审那一步**就出现「存在重复学生记录：… · …」的警告，
而不是确认导入之后才在体检面板看到「重复记录 ×2」。

**破坏性变更.** 无。`StudentIssue`、`StudentBuildResult`、`buildStudentRecords` 的签名与字段全不变，
`duplicateKey` / `duplicateValue` 是模块私有；落库的 `Student` 字段一个没改，
导出格式、API 形状、IndexedDB 结构均无变化。
唯一可观察的行为变化是**原本静默通过的全角/中点重复行，现在在导入评审里多一条 warning**
（`level: "warning"`，不拦截导入，`confirmImportCandidates` 只按 `level === "error"` 过滤，
所以导入人数不变）。风险面：名单里本就存在大量全角院校写法的用户，会看到警告条数上升。

**回滚.** 改动集中在 `student-data.ts` 的 `duplicateValue` / `duplicateKey` 两个私有函数：
`git checkout HEAD -- src/lib/student-data.ts src/lib/student-data.test.ts src/lib/data-health.test.ts`
即回到 Round 12 状态。只想退掉折叠而保留测试，把 `duplicateValue` 里的 `.normalize("NFKC")`
和 `normalizeStudentName(...)` 去掉即可（届时上面那 4 条会红，属预期）。

---

## 已知遗留（未修）

1. **`resolveStudentLocation` 仍不看 `locationScope`。** 今天靠 8 个调用方各自先判海外挡住，
   属于「每个调用方都得记得判」的约定，而不是函数自身的保证。
   要收口就是在函数开头加 `if (student.locationScope === "international") return { city: trimImportCell(student.city), province: "", status: "unresolved" }`，
   但这会改变 `status` 语义（海外记录从「已定位」变「未定位」），
   得连同 `data-workspace-student-table.tsx:157` 的 `is-unresolved` 样式一起复核，
   超出「修一个静默错」的范围，本轮只加了体检层的回归断言。
2. **重复判定的字段口径仍是两套**（导入 姓名+院校 / 体检 姓名+院校+城市+去向类型）。
   如上所述这是有意的，本轮只统一了折叠口径。若将来要合并，
   得先决定「同一人不同城市」算不算重复——那是产品判断，不是代码缺陷。
3. **`duplicate_name` 问题没有 `studentIndex`**（一组只报一条，不带行号），
   导入评审 UI 无法把这条警告定位到具体哪两行。属可用性缺口，不是错数据，没动。
4. **折叠规则被抄了两份**（`student-data.ts::duplicateValue` 与
   `data-duplicate.ts::normalizeDuplicateValue`），靠注释互指保持同步。
   要真正共用得从 `data-duplicate.ts` 导出该函数，那个文件不在本轮 allowlist。
