/**
 * Micro-benchmark for the project-document commit path.
 * Run five fresh processes with:
 *   npx tsx scripts/perf-transaction-bench.ts
 */
import {
  applyTransaction,
  createProjectDocument,
  redoTransaction,
  undoTransaction,
  type ProjectDocument,
} from "../src/lib/project-document";
import type { Student } from "../src/lib/project-data";
import type { ProvinceStyle } from "../src/lib/scene-document";

const STUDENT_COUNT = 500;
const PROVINCE_STYLE_COUNT = 34;
const TRANSACTION_COUNT = 200;
const UNDO_REDO_CYCLES = 50;

const provinces = [
  "北京市",
  "天津市",
  "河北省",
  "山西省",
  "内蒙古自治区",
  "辽宁省",
  "吉林省",
  "黑龙江省",
  "上海市",
  "江苏省",
  "浙江省",
  "安徽省",
  "福建省",
  "江西省",
  "山东省",
  "河南省",
  "湖北省",
  "湖南省",
  "广东省",
  "广西壮族自治区",
  "海南省",
  "重庆市",
  "四川省",
  "贵州省",
  "云南省",
  "西藏自治区",
  "陕西省",
  "甘肃省",
  "青海省",
  "宁夏回族自治区",
  "新疆维吾尔自治区",
  "香港特别行政区",
  "澳门特别行政区",
  "台湾省",
] as const;

function createStudents(): Student[] {
  return Array.from({ length: STUDENT_COUNT }, (_, index) => ({
    id: `student-${index}`,
    name: `学生${index}`,
    university: `大学${index % 50}`,
    city: `城市${index % 100}`,
    province: provinces[index % provinces.length],
    visibility: true,
  }));
}

function createProvinceStyles(): Record<string, ProvinceStyle> {
  return Object.fromEntries(provinces.map((province, index) => [
    province,
    {
      visible: true,
      labelFontId: `font-${index % 4}`,
      appearance: {
        kind: "texture",
        assetId: `province-asset-${index}`,
        src: `data:image/png;base64,${"a".repeat(128)}`,
        fit: index % 2 === 0 ? "cover" : "contain",
        opacity: 0.8,
        scale: 1,
        offsetX: index - 17,
        offsetY: 17 - index,
      },
    },
  ]));
}

function createBenchmarkDocument(): ProjectDocument {
  const project = createProjectDocument({
    students: createStudents(),
    templateId: "original",
    dataView: "province",
  });
  return {
    ...project,
    map: {
      ...project.map,
      provinceStyles: createProvinceStyles(),
    },
  };
}

function runWorkload(): ProjectDocument {
  let project = createBenchmarkDocument();

  for (let index = 0; index < TRANSACTION_COUNT; index += 1) {
    const studentIndex = index % STUDENT_COUNT;
    project = applyTransaction(project, {
      id: `bench-transaction-${index}`,
      label: `Benchmark transaction ${index}`,
      source: "manual",
      apply: (current) => ({
        ...current,
        students: current.students.map((student, currentIndex) =>
          currentIndex === studentIndex
            ? { ...student, name: `学生${studentIndex}-修改${index}` }
            : student
        ),
      }),
    });
  }

  for (let index = 0; index < UNDO_REDO_CYCLES; index += 1) {
    project = undoTransaction(project);
    project = redoTransaction(project);
  }

  return project;
}

const start = performance.now();
const result = runWorkload();
const elapsed = performance.now() - start;

if (
  result.students.length !== STUDENT_COUNT
  || Object.keys(result.map.provinceStyles ?? {}).length !== PROVINCE_STYLE_COUNT
  || result.version !== TRANSACTION_COUNT
) {
  throw new Error("Transaction benchmark produced an invalid document");
}

console.log(
  `transaction_bench_ms=${elapsed.toFixed(3)} students=${STUDENT_COUNT} `
  + `province_styles=${PROVINCE_STYLE_COUNT} transactions=${TRANSACTION_COUNT} `
  + `undo_redo_cycles=${UNDO_REDO_CYCLES}`,
);
