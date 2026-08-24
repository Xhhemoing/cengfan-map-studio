import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { createCustomTemplateFromProject, type CustomTemplateRecord } from "./template-store";
import { TemplatePackError } from "./template-package";
import {
  describeTemplatePackError,
  downloadTemplatePack,
  mergeImportedTemplate,
} from "./template-exchange-actions";

const GUEST_NAME = "王老师";

function makeRecord(name = "卡通开学墙"): CustomTemplateRecord {
  const scene = createProjectDocument({ students: [], templateId: "cartoon", dataView: "province" });
  scene.guests = { ...scene.guests, people: [{ id: "guest-1", name: GUEST_NAME, visibility: true }] };
  return createCustomTemplateFromProject({
    name,
    baseTemplateId: "cartoon",
    scope: "visual",
    overrides: {},
    scene,
    students: [{ id: "s1", name: "林舟", university: "北京大学", city: "北京市", visibility: true }],
  });
}

function stubDownload() {
  const blobs: Blob[] = [];
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return "blob:template-pack";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  return { blobs, createObjectURL };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("downloadTemplatePack", () => {
  it("writes a .cengfan-template file without student or guest names", async () => {
    const { blobs } = stubDownload();

    const result = downloadTemplatePack({
      record: makeRecord(),
      author: "小林",
      now: new Date("2026-08-24T10:00:00.000Z"),
    });

    expect(result.filename).toBe("卡通开学墙-2026-08-24.cengfan-template");
    expect(result.bytes).toBeGreaterThan(0);
    expect(blobs).toHaveLength(1);
    const text = await blobs[0]!.text();
    expect(text).not.toContain("林舟");
    expect(text).not.toContain(GUEST_NAME);
    expect(JSON.parse(text)).toMatchObject({ kind: "cengfan-template", version: 1, author: "小林" });
  });

  it("never creates a blob when the template fails an outbound gate", () => {
    const { createObjectURL } = stubDownload();
    const record = makeRecord();
    const dirty = { ...record, document: { ...record.document, price: 199 } } as unknown as CustomTemplateRecord;

    expect(() => downloadTemplatePack({ record: dirty })).toThrow(TemplatePackError);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe("mergeImportedTemplate", () => {
  it("puts the imported template first without dropping anything below the limit", () => {
    const existing = Array.from({ length: 19 }, (_, index) => makeRecord(`模板 ${index}`));
    const imported = makeRecord("导入的模板");

    const { next, dropped } = mergeImportedTemplate(existing, imported);

    expect(next).toHaveLength(20);
    expect(next[0]).toBe(imported);
    expect(dropped).toBe(0);
  });

  it("drops the oldest template when the limit is reached", () => {
    const existing = Array.from({ length: 20 }, (_, index) => makeRecord(`模板 ${index}`));
    const imported = makeRecord("导入的模板");

    const { next, dropped } = mergeImportedTemplate(existing, imported);

    expect(next).toHaveLength(20);
    expect(next[0]).toBe(imported);
    expect(dropped).toBe(1);
    expect(next).not.toContain(existing[19]);
  });
});

describe("describeTemplatePackError", () => {
  it.each([
    "INVALID_JSON",
    "NOT_TEMPLATE_PACK",
    "PROJECT_PACKAGE_REJECTED",
    "UNSUPPORTED_VERSION",
    "UNKNOWN_FIELD",
    "COMMERCIAL_FIELD_REJECTED",
    "STUDENT_DATA_DETECTED",
    "TEMPLATE_INVALID",
    "FILE_TOO_LARGE",
  ] as const)("explains %s in plain Chinese", (code) => {
    const withMessage = describeTemplatePackError(new TemplatePackError(code, "模板文件读取失败：细节"));
    const withoutMessage = describeTemplatePackError(new TemplatePackError(code, ""));

    expect(withMessage).toBe("模板文件读取失败：细节");
    expect(withoutMessage).not.toContain("Error");
    expect(withoutMessage.length).toBeGreaterThan(4);
  });

  it("falls back to a readable message for unexpected failures", () => {
    expect(describeTemplatePackError(new Error("boom"))).toContain("模板");
    expect(describeTemplatePackError("boom")).toContain("模板");
  });
});
