/**
 * Collaboration document diff micro-benchmark.
 *
 * Run this command five times before and after changing the diff implementation:
 *   npx tsx scripts/perf-collab-diff-bench.ts
 *
 * Each reported duration is the average cost of one diff call. Scenario (a)
 * uses more iterations because the reference-equality fast path is very short.
 */
import { diffCollaborationDocument } from "../src/lib/collaboration-operations";

const STUDENT_COUNT = 300;
const ASSET_COUNT = 5;
const ASSET_BYTES = 1024 * 1024;

type BenchmarkPackage = ReturnType<typeof createPackage>;

function createPackage() {
  const students = Array.from({ length: STUDENT_COUNT }, (_, index) => ({
    id: `student-${index}`,
    name: `同学 ${index}`,
    university: `大学 ${index % 60}`,
    city: `城市 ${index % 34}`,
    province: `省份 ${index % 34}`,
    facts: {
      degree: index % 3 === 0 ? "博士" : "硕士",
      motto: `毕业寄语 ${index}`,
    },
  }));
  const assets = Array.from({ length: ASSET_COUNT }, (_, index) => ({
    id: `asset-${index}`,
    name: `背景图 ${index}`,
    type: "image/png",
    src: `data:image/png;base64,${String(index).repeat(ASSET_BYTES)}`,
  }));

  return {
    kind: "cengfan-project-package",
    version: 2,
    exportedAt: "2026-08-24T00:00:00.000Z",
    project: {
      id: "benchmark-project",
      title: "毕业去向图",
      students,
      map: {
        scale: 1,
        provinceStyles: Object.fromEntries(Array.from({ length: 34 }, (_, index) => [
          `省份 ${index}`,
          { color: `hsl(${index * 10} 70% 55%)`, labelVisible: true },
        ])),
      },
      cards: { visibleFields: ["name", "university", "city"] },
      guests: { people: [] },
      textElements: [],
      assetElements: [],
      history: { past: [], future: [] },
    },
    assets,
    fonts: [],
    customTemplates: [],
    renderSettings: { pixelRatio: 2, format: "png" },
  };
}

function clonePackage(pack: BenchmarkPackage): BenchmarkPackage {
  return structuredClone(pack);
}

function createEditedPackage(pack: BenchmarkPackage): BenchmarkPackage {
  const edited = clonePackage(pack);
  const indices = [0, 17, 48, 79, 110, 141, 172, 203, 234, 299];
  for (const [editIndex, studentIndex] of indices.entries()) {
    const student = edited.project.students[studentIndex]!;
    edited.project.students[studentIndex] = {
      ...student,
      city: `编辑后的城市 ${editIndex}`,
      facts: { ...student.facts, motto: `编辑后的寄语 ${editIndex}` },
    };
  }
  return edited;
}

function measure(
  name: string,
  before: BenchmarkPackage,
  after: BenchmarkPackage,
  iterations: number,
): void {
  diffCollaborationDocument(before, after);

  let operationCount = 0;
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    operationCount += diffCollaborationDocument(before, after).length;
  }
  const elapsedMs = performance.now() - startedAt;
  console.log(
    `scenario=${name} time=${(elapsedMs / iterations).toFixed(3)}ms operations=${operationCount / iterations}`,
  );
}

const original = createPackage();
const equalClone = clonePackage(original);
const editedClone = createEditedPackage(original);

measure("a-identical-reference", original, original, 20_000);
measure("b-structurally-equal-clone", original, equalClone, 1);
measure("c-ten-scattered-edits", original, editedClone, 1);
