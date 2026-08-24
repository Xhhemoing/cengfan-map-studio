import { describe, expect, it } from "vitest";
import {
  MAX_PROJECT_PACKAGE_BYTES,
  MAX_SPREADSHEET_IMPORT_BYTES,
  PROJECT_PACKAGE_IMPORT_LIMIT,
  SPREADSHEET_IMPORT_LIMIT,
  checkImportFileSize,
} from "./import-file-limits";

/** jsdom 里造一份真实体积的 File 太贵，只伪造 `size`：校验本来就只读这个字段。 */
function fileOfSize(bytes: number, name = "roster.xlsx"): File {
  const file = new File([], name);
  Object.defineProperty(file, "size", { value: bytes });
  return file;
}

describe("checkImportFileSize", () => {
  it("accepts a missing file and anything at or below the limit", () => {
    expect(checkImportFileSize(null, SPREADSHEET_IMPORT_LIMIT)).toBeNull();
    expect(checkImportFileSize(fileOfSize(0), SPREADSHEET_IMPORT_LIMIT)).toBeNull();
    expect(checkImportFileSize(fileOfSize(MAX_SPREADSHEET_IMPORT_BYTES), SPREADSHEET_IMPORT_LIMIT)).toBeNull();
  });

  it("rejects one byte over the spreadsheet limit with an actionable message", () => {
    const message = checkImportFileSize(fileOfSize(MAX_SPREADSHEET_IMPORT_BYTES + 1), SPREADSHEET_IMPORT_LIMIT);

    expect(message).toContain("表格文件过大");
    expect(message).toContain("上限 12.0 MB");
    expect(message).toContain("请拆分成多份");
  });

  it("keeps the project package on its own, larger budget", () => {
    expect(MAX_PROJECT_PACKAGE_BYTES).toBeGreaterThan(MAX_SPREADSHEET_IMPORT_BYTES);
    expect(checkImportFileSize(fileOfSize(MAX_SPREADSHEET_IMPORT_BYTES + 1, "工程.json"), PROJECT_PACKAGE_IMPORT_LIMIT)).toBeNull();

    const message = checkImportFileSize(fileOfSize(MAX_PROJECT_PACKAGE_BYTES + 1, "工程.json"), PROJECT_PACKAGE_IMPORT_LIMIT);
    expect(message).toContain("工程包过大");
    expect(message).toContain("上限 24.0 MB");
    expect(message).toContain("工程包包含资源");
  });

  it("treats a non-finite size as zero rather than rejecting the file", () => {
    expect(checkImportFileSize(fileOfSize(Number.NaN), SPREADSHEET_IMPORT_LIMIT)).toBeNull();
  });
});
