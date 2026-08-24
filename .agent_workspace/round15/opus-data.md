# R15-opus-data — 迁移层认下 `overseas` / `abroad` / `海外` 三种别名

- **模型**: claude-opus-5-thinking-high-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（未 commit / stash / 建分支 / push）
- **允许改动**: `src/lib/project-migration-students.ts`、`src/lib/project-migration.ts`（若有 re-export）、
  对应测试。实际改了 `src/lib/project-migration-students.ts` 与新增
  `src/lib/project-migration-students.test.ts`。`project-migration.ts` 没有 re-export
  `migrateStudents`（只是内部 import），所以没动。

---

## 1. 修的洞

Round 14 报告结尾第 180 行留下的那条：手写 `locationScope: "overseas"` 的工程文件
会被迁移成中国去向，再带上省份就还是会上中国地图。

修前的判定是一个字面量等号：

```ts
// project-migration-students.ts:44（修前）
const locationScope = record.locationScope === "international" ? "international" : undefined;
const manualProvince = locationScope ? "" : asString(record.province);
```

`"international"` 之外的一切——包括导入解析器自己认识的 `overseas` / `abroad` / `海外` /
`出国` / `境外`——全部落到 `undefined` 分支，于是同一条记录连着三件事一起走偏：

1. `locationScope` 丢了，海外身份消失；
2. `manualProvince` 不再被清空，遗留的 `浙江省` 原样留在记录里；
3. `city` 被送进 `resolveCity()`，外国地名去撞中国城市目录。

一条 `{ city: "美国·波士顿", province: "浙江省", locationScope: "海外" }` 迁移完就是一个
挂在浙江省的中国学生。这不是理论构造：`INTERNATIONAL_TOKENS` 一直接受这些写法，
用户照着文档手写工程 JSON、或早期存档用了别的拼法，落盘的就是这些值。

## 2. 修法

判定改成复用导入侧那一个读取器，别名词表只此一份：

```ts
import { parseLocationScopeValue } from "./import-data";

// Hand-written and pre-canonical payloads spell the overseas scope the way the
// import parser accepts it ("overseas", "abroad", "海外"), so the same reader
// decides here: anything else stays a China destination.
const locationScope = parseLocationScopeValue(asString(record.locationScope));
```

三点说明：

- **只改判定，不改后续。** 省份清空、跳过 `resolveCity` 的分支本来就写在
  `locationScope` truthy 上（第 49、54 行），别名一旦归一成 `"international"`，
  「丢掉残留省份」就自动跟着 international 路径走，不需要额外代码。
- **没给 `Student` 加新的 scope 字面量。** `parseLocationScopeValue` 的返回类型就是
  `"international" | undefined`，别名只活在输入侧，落盘形状仍是 `"china" | "international"`。
- **`asString` 兜住非字符串。** `record.locationScope` 可能是 `true` / `null` / 对象，
  `asString` 统一返回 `""`，`parseLocationScopeValue("")` → `undefined`，仍是中国去向。

顺带白拿的两件事：大小写与空白不敏感（`" Abroad "` 认），以及否定式不误判
（存了 `"未出国"` 不会被当成海外——`stripNegatedMarkers` 已经处理）。

## 3. 测试

新建 `src/lib/project-migration-students.test.ts`（此前只有 `project-migration.test.ts`
从 `migrateProjectPayload` 顶层间接覆盖），直接测 `migrateStudents`：

| 用例 | 钉住的行为 |
| --- | --- |
| `normalizes every stored overseas spelling onto the canonical international scope` | `international` / `overseas` / `" Abroad "` / `海外` / `出国` 五种写法全部产出 `international`，且 `city` 不过中国城市目录 |
| `drops the stale China province stored next to an aliased overseas record` | `locationScope: "海外"` + `province: "浙江省"` → 整条记录深比较，`province` 必须不存在 |
| `keeps a China destination for every value that is not an overseas marker` | `china` / `未出国` / `国内` / `true` / 缺省五种取值都不带 `locationScope`、保留 `浙江省`、`杭州` 仍归一成 `杭州市` |

第三条是回归护栏——它在修前修后都绿，作用是确保这次放宽判定没有把中国行也卷进海外分支。

## 4. 验证链（failure → cause → fix → recheck）

1. **failure**：先写测试，把改动临时退回旧的字面量等号跑一遍
   （`npx vitest run src/lib/project-migration-students.test.ts`）——
   2 failed / 1 passed。失败输出正是预期的两处：`locationScope` 一列出来
   `[international, undefined, undefined, undefined, undefined]`，
   深比较那条 `- "locationScope": "international"` / `+ "province": "浙江省"`。
2. **cause**：`record.locationScope === "international"` 是字面量比较，别名一律落到
   `undefined` 分支，连带跳过省份清空与城市保护。
3. **fix**：判定换成 `parseLocationScopeValue(asString(record.locationScope))`，
   其余分支不动（改动 = 1 行判定 + 3 行注释 + 1 行 import）。
4. **recheck**：同一条命令重跑 → 3 passed。
   - `npx vitest run src/lib/project-migration-students.test.ts src/lib/project-migration.test.ts` → 22 passed
   - `npx vitest run`（全量）→ **204 files / 1786 tests passed**
   - `npm run lint` → 0 errors（5 个 `react-refresh` warning 全在 `StudioMuiProvider.tsx`、
     `GlobalDataNavigation.tsx`、`app-initialization.tsx`，与本次改动无关，改前就在）
   - `npx tsc --noEmit` → 无输出

## 5. 交付与回滚

- **验收方式**：`npx vitest run src/lib/project-migration-students.test.ts`（3 条用例即为验收标准）；
  手动验证可造一份 `{"students":[{"id":"s1","name":"苏禾","university":"哈佛大学",
  "city":"美国·波士顿","province":"浙江省","locationScope":"overseas"}]}` 的工程文件导入，
  该学生应出现在海外分组、不落在浙江省。
- **数据格式**：`Student` 类型、导出格式、API 形状均未变。落盘值仍只有
  `"china" | "international"`，别名只在读取时归一。
- **迁移方向单向**：这是一次「读旧写新」的收敛——旧文件里的 `overseas` 读进来会写回
  `international`。反向影响：改前被误判成中国去向的记录如果**已经存过盘**，
  盘上就只剩 `undefined` 了，本次改动救不回来（信息已丢），只能靠用户在数据工作台改回海外。
- **回滚方案**：把 `project-migration-students.ts` 第 45-48 行恢复成
  `const locationScope = record.locationScope === "international" ? "international" : undefined;`
  并删掉第 2 行 import 与新增测试文件即可；无数据迁移需要撤销（磁盘格式没变）。

## 6. 依赖方向说明

`project-migration-students.ts` → `import-data.ts` 是新增的一条依赖。检查过没有环：
`import-data.ts` 只 import `./import-headers`，而 `import-headers.ts` 是叶子模块（无 import），
两者都不引用任何 `project-*`。选复用而不是在迁移文件里再抄一份词表，是因为
「什么算海外」出现两份词表迟早会漂移——round 14 的报告已经在靠
「`INTERNATIONAL_TOKENS` 和迁移层判定一致」来论证磁盘上不存在 `"overseas"`，
现在这个前提由代码本身保证。

## 7. 留给下一轮

- `import-data.ts` 里的 `ImportCandidate.locationScope` 与 `student-data.ts` 的
  `Student.locationScope` 都声明成 `"china" | "international"`，但 `"china"` 从没被真正写入过
  （所有写入点都是 `undefined` 或 `"international"`）。`data-workspace.ts:14`、
  `import-data.ts:12` 三处各自声明了一遍同样的联合类型。要收口就是提一个共享的
  `LocationScope` 类型别名，但那要动 `student-data.ts` 等本轮范围外的文件。
- `"china"` 这个字面量在写入侧其实是死值：`DataWorkspace.tsx:149` 只是拿它做 select
  的显示值，保存时第 160 行又折回 `undefined`；导入侧 `buildStudentRecords`
  （`student-data.ts:190`）只在海外时写字段。唯一能把 `"china"` 落盘的是直接给
  `createStudentUpdateTransaction` 传 `{ locationScope: "china" }`
  （`studio-editor-helpers.test.ts:86` 钉住了这个行为），今天没有 UI 路径这么做。
  本次改动对 `"china"` 的处理与改前一致（→ 中国去向），新增用例已覆盖。
