import { describe, expect, it } from "vitest";
import {
  COLUMN_LABELS,
  findColumnIndexes,
  looksLikeHeaderRow,
  matchStudentColumn,
  REQUIRED_COLUMNS,
} from "./import-aliases";

describe("import aliases", () => {
  it("recognizes province headers in Chinese and English", () => {
    for (const alias of ["省份", "省", "所在省份", "所属省份", "省级行政区", "Province", " state "]) {
      expect(matchStudentColumn(alias)).toBe("province");
    }
  });

  it("keeps province out of the required columns", () => {
    expect(REQUIRED_COLUMNS).toEqual(["name", "university", "city"]);
    expect([...REQUIRED_COLUMNS]).not.toContain("province");
  });

  it("labels the province column for user-facing messages", () => {
    expect(COLUMN_LABELS.province).toBe("省份");
  });

  it("does not let a province column alone turn a row into a header row", () => {
    expect(looksLikeHeaderRow(["省份", "去向类型"])).toBe(false);
    expect(looksLikeHeaderRow(["学生姓名", "省份"])).toBe(false);
    expect(looksLikeHeaderRow(["学生姓名", "城市", "省份"])).toBe(true);
  });

  it("maps every recognized column to its leftmost position", () => {
    expect(findColumnIndexes(["班级", "学生姓名", "录取院校", "城市", "去向类型", "省份", "省份"])).toEqual({
      name: 1,
      university: 2,
      city: 3,
      locationScope: 4,
      province: 5,
    });
  });

  it("does not confuse 城市 aliases with province aliases", () => {
    expect(matchStudentColumn("所在城市")).toBe("city");
    expect(matchStudentColumn("所在省份")).toBe("province");
  });
});
