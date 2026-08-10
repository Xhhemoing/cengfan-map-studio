import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  parseUniversitiesRows,
  renderUniversitiesModule,
  syncChinaUniversities,
  UNIVERSITIES_SHEET,
  UNIVERSITIES_URL,
} from "./sync-china-universities.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

/** MOE workbook rows: group rows + university rows (0-based columns). */
const ROWS = [
  ["附件1："],
  ["全国普通高等学校名单"],
  ["序号", "学校名称", "学校标识码", "主管部门", "所在地", "办学层次", "备注"],
  ["北京市（2所）"],
  [1, "北京大学", 4111010001, "教育部", "北京市", "本科", ""],
  [2, "清华大学", 4111010003, "教育部", "北京市", "本科", ""],
  ["浙江省（1所）"],
  [893, "浙江大学", 4133010335, "教育部", "杭州市", "本科", ""],
  ["云南省（1所）"],
  [894, "楚雄师范学院", 4133000012, "云南省", "楚雄彝族\n自治州", "本科", ""],
];

function rowsToXlsxBuffer(rows) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, UNIVERSITIES_SHEET);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("sync china universities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses the MOE workbook rows into name/province/city rows with cleaned cities", () => {
    const rows = parseUniversitiesRows(ROWS);
    expect(rows).toHaveLength(4);
    expect(rows).toContainEqual({
      name: "浙江大学",
      province: "浙江省",
      city: "杭州市",
      aliases: ["浙大"],
    });
    // 换行脏数据被清洗
    expect(rows).toContainEqual({
      name: "楚雄师范学院",
      province: "云南省",
      city: "楚雄彝族自治州",
      aliases: [],
    });
    // 别名来自 legacy 表
    expect(rows.find((row) => row.name === "北京大学")?.aliases).toEqual(["北大"]);
    expect(rows.find((row) => row.name === "清华大学")?.aliases).toEqual(["清华"]);
  });

  it("sorts rows by canonical name", () => {
    const rows = parseUniversitiesRows(ROWS);
    const names = rows.map((row) => row.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "zh-CN")));
  });

  it("skips header, title, and malformed rows", () => {
    const rows = parseUniversitiesRows([
      ["附件1："],
      ["全国普通高等学校名单"],
      ["序号", "学校名称", "学校标识码", "主管部门", "所在地", "办学层次", "备注"],
      ["北京市（1所）"],
      [1, "北京大学", 4111010001, "教育部", "北京市", "本科", ""],
      [2, "", 4111010003, "教育部", "北京市", "本科", ""], // 缺名称
      [3, "缺城市大学", 4111010004, "教育部", "", "本科", ""], // 缺城市
      "not-an-array",
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("北京大学");
  });

  it("renders a TypeScript module with the catalog and source metadata", () => {
    const rows = parseUniversitiesRows(ROWS);
    const module = renderUniversitiesModule(rows);
    expect(module).toContain("export const chinaUniversities: UniversityCatalogEntry[] = [");
    expect(module).toContain('{ name: "浙江大学", province: "浙江省", city: "杭州市", aliases: ["浙大"] },');
    expect(module).toContain(`count: ${rows.length}`);
    expect(module).toContain("comes from the workbook group rows");
  });

  it("writes the target module after validating the workbook", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cengfan-uni-"));
    const target = join(dir, "china-universities.ts");
    try {
      const buffer = rowsToXlsxBuffer(ROWS);
      const fetchBuffer = vi.fn(async () => buffer);
      const result = await syncChinaUniversities({ fetchBuffer, target, minRows: 1 });
      expect(result.count).toBe(4);
      const content = await readFile(target, "utf8");
      expect(content).toContain('"北京大学"');
      expect(fetchBuffer).toHaveBeenCalledWith(UNIVERSITIES_URL);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses to write when the row count is implausibly small", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cengfan-uni-"));
    try {
      const buffer = rowsToXlsxBuffer(ROWS);
      await expect(
        syncChinaUniversities({ fetchBuffer: async () => buffer, target: join(dir, "a.ts") }),
      ).rejects.toThrow(/行数异常/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
