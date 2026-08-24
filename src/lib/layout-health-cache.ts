/**
 * 排版健康检查 · 输入签名缓存。
 *
 * `checkLayoutHealth(buildHealthInput(project))` 要先跑一次完整排版求解，再对所有可见对象
 * 做两两遮挡与连线相交比对；而编辑器每提交一次事务都会深拷贝出新的 project 引用
 * （version、history、style 都会跟着变），所以只靠 `useDeferredValue` + `useMemo` 的引用
 * 比较，几何完全没动的编辑也会重算一遍。这里按「真正进入 buildHealthInput 的输入」
 * 算一份稳定签名：签名相同就复用上一次的 issues（同一数组引用），签名变了才重算。
 *
 * 回滚：把 App 里的调用改回 `checkLayoutHealth(buildHealthInput(healthProject))`，
 * 再删掉本模块与其测试即可。缓存只在内存里、不改结果形状、不落盘。
 */
import { checkLayoutHealth, type LayoutHealthIssue } from "./layout-health";
import { getVisibleStudents, type Student } from "./project-data";
import type { ProjectDocument } from "./project-document";
import { buildHealthInput } from "./render-health";

/**
 * 图片二进制字段：签名里只保留「有/无」。
 * 排版只关心它们存不存在（avatarSrc 决定嘉宾行高、renderSource.src 决定地图是否走图片底图），
 * 内容本身不进入任何几何；把 data URL 整段拼进 key 反而会把省下的时间还回去。
 */
const IMAGE_PAYLOAD_KEYS = new Set(["src", "backgroundImageSrc", "avatarSrc", "textureSrc"]);

/**
 * 每个可见学生进签名的字段。
 * 姓名必须纳入：`cardRowsForGroup` → `rowFragments` → `wrapCardText` 会按真实文案逐字测宽，
 * 行数直接决定卡高（`render-facts.ts` 的 `destinationHeight`），改名就是改卡片几何。
 * 学生 id 不纳入——它只做行 key，不参与分组 key、测高与锚点。
 */
function studentSignatureFields(student: Student): unknown[] {
  return [student.name, student.university, student.city, student.province ?? "", student.locationScope ?? "china"];
}

/**
 * 签名取值范围：整块收下 buildHealthInput 会读到的场景对象，
 * 新增字段自动进签名（宁可多算一次，也不能漏算导致 issues 过期）；
 * history / version / style / templateId 不纳入，健康检查从不读它们。
 */
function signatureSource(project: ProjectDocument): unknown {
  return {
    dataView: project.dataView,
    canvas: project.canvas,
    map: project.map,
    cards: project.cards,
    guests: project.guests,
    textElements: project.textElements,
    assetElements: project.assetElements,
    // 隐藏学生会被 getVisibleStudents 过滤掉，改他们的任何字段都不影响版面。
    students: getVisibleStudents(project.students).map(studentSignatureFields),
  };
}

export function createLayoutHealthSignature(project: ProjectDocument): string {
  return JSON.stringify(signatureSource(project), (key, value) =>
    IMAGE_PAYLOAD_KEYS.has(key) && typeof value === "string" ? (value ? "#" : "") : value);
}

export type LayoutHealthCompute = (project: ProjectDocument) => LayoutHealthIssue[];

const computeLayoutHealth: LayoutHealthCompute = (project) => checkLayoutHealth(buildHealthInput(project));

/** 极小的 LRU：UI 只有一份当前工程，留两条就能覆盖「撤销 / 重做来回切」。 */
export class LayoutHealthCache {
  private readonly entries = new Map<string, LayoutHealthIssue[]>();

  private readonly capacity: number;

  private readonly compute: LayoutHealthCompute;

  constructor(capacity = 2, compute: LayoutHealthCompute = computeLayoutHealth) {
    this.capacity = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : 1;
    this.compute = compute;
  }

  get size(): number {
    return this.entries.size;
  }

  /** 命中时返回上一次的同一份数组引用；调用方只读，不要就地排序或修改。 */
  issuesFor(project: ProjectDocument): LayoutHealthIssue[] {
    const key = createLayoutHealthSignature(project);
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }
    const issues = this.compute(project);
    this.entries.set(key, issues);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return issues;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const layoutHealthCache = new LayoutHealthCache();

/** App 的排版健康检查入口：等价于 `checkLayoutHealth(buildHealthInput(project))`，只是跳过重复求解。 */
export function layoutHealthIssues(project: ProjectDocument): LayoutHealthIssue[] {
  return layoutHealthCache.issuesFor(project);
}
