// 从 src/lib/project-package.test.ts 拆出：工程包下载的文件名与可再导入性。
// 这里要打桩 URL / <a>.click，与上游那份纯序列化用例的环境诉求不同。
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileMatchesAccept } from "./file-accept";
import { createProjectDocument } from "./project-document";
import {
  createProjectPackage,
  downloadProjectPackage,
  PROJECT_PACKAGE_FILE_ACCEPT,
} from "./project-package";

describe("downloadProjectPackage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubDownload(): string[] {
    const downloads: string[] = [];
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:project-package");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    return downloads;
  }

  function packAt(iso: string) {
    return createProjectPackage({
      project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
      assets: [],
      fonts: [],
      now: new Date(iso),
    });
  }

  it("defaults to the shared export name and stays importable", () => {
    const downloads = stubDownload();

    downloadProjectPackage(packAt("2026-08-24T09:30:00.000Z"));

    expect(downloads).toEqual(["我的毕业去向图-工程包-2026-08-24.json"]);
    expect(fileMatchesAccept(new File(["{}"], downloads[0]!), PROJECT_PACKAGE_FILE_ACCEPT)).toBe(true);
  });

  it("keeps an explicit filename untouched", () => {
    const downloads = stubDownload();

    downloadProjectPackage(packAt("2026-08-24T09:30:00.000Z"), "高三3班-工程包-2026-08-24.cengfan");

    expect(downloads).toEqual(["高三3班-工程包-2026-08-24.cengfan"]);
    expect(fileMatchesAccept(new File(["{}"], downloads[0]!), PROJECT_PACKAGE_FILE_ACCEPT)).toBe(true);
  });
});
