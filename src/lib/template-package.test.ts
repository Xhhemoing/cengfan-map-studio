import { describe, expect, it, vi } from "vitest";
import { fileMatchesAccept } from "./file-accept";
import { createProjectDocument } from "./project-document";
import { createCustomTemplateFromProject, type CustomTemplateRecord } from "./template-store";
import {
  MAX_TEMPLATE_PACK_BYTES,
  TEMPLATE_PACK_FILE_ACCEPT,
  TEMPLATE_PACK_FILE_EXTENSION,
  TEMPLATE_PACK_KIND,
  TEMPLATE_PACK_VERSION,
  TemplatePackError,
  assertNoCommercialFields,
  createTemplatePack,
  parseTemplatePack,
  readTemplatePackFile,
  serializeTemplatePack,
  templatePackFilename,
  type TemplatePack,
  type TemplatePackErrorCode,
} from "./template-package";

const STUDENT_NAME = "林舟";
const GUEST_NAME = "王老师";

function sceneWithGuest() {
  const project = createProjectDocument({ students: [], templateId: "cartoon", dataView: "province" });
  project.guests = {
    ...project.guests,
    customText: `感谢 ${GUEST_NAME}`,
    people: [{ id: "guest-1", name: GUEST_NAME, visibility: true }],
  };
  return project;
}

function makeRecord(): CustomTemplateRecord {
  return createCustomTemplateFromProject({
    name: "卡通开学墙",
    baseTemplateId: "cartoon",
    scope: "visual",
    overrides: {},
    scene: sceneWithGuest(),
    students: [{ id: "s1", name: STUDENT_NAME, university: "北京大学", city: "北京市", visibility: true }],
  });
}

function makePackObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const pack = createTemplatePack({ record: makeRecord(), now: new Date("2026-08-24T10:00:00.000Z") });
  return { ...(JSON.parse(JSON.stringify(pack)) as Record<string, unknown>), ...overrides };
}

function expectPackError(run: () => unknown, code: TemplatePackErrorCode): TemplatePackError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(TemplatePackError);
    expect((error as TemplatePackError).code).toBe(code);
    return error as TemplatePackError;
  }
  throw new Error(`期望抛出 ${code}，但没有抛出`);
}

describe("template package format", () => {
  it("round-trips a custom template through export and import", () => {
    const record = makeRecord();
    const pack = createTemplatePack({
      record,
      author: "小林",
      now: new Date("2026-08-24T10:00:00.000Z"),
    });

    expect(pack.kind).toBe(TEMPLATE_PACK_KIND);
    expect(pack.version).toBe(TEMPLATE_PACK_VERSION);

    const imported = parseTemplatePack(serializeTemplatePack(pack), {
      now: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(imported.record.name).toBe(record.name);
    expect(imported.record.baseTemplateId).toBe("cartoon");
    expect(imported.record.scope).toBe("visual");
    expect(imported.record.document).toEqual(record.document);
    expect(imported.record.scene?.canvas).toEqual(record.scene?.canvas);
    expect(imported.author).toBe("小林");
    expect(imported.license).toBe("AGPL-3.0-only");
  });

  it("reassigns the record id and creation time on import", () => {
    const record = makeRecord();
    const json = serializeTemplatePack(createTemplatePack({ record }));

    const imported = parseTemplatePack(json, { now: new Date("2026-09-01T00:00:00.000Z") });

    expect(imported.record.id).not.toBe(record.id);
    expect(imported.record.id).toMatch(/^custom-/);
    expect(imported.record.createdAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("strips student data at every level before producing the file", () => {
    const record = makeRecord();
    const dirty = {
      ...record,
      students: [{ id: "s1", name: STUDENT_NAME }],
      document: { ...record.document, students: [{ id: "s2", name: STUDENT_NAME }] },
      scene: {
        ...record.scene!,
        cards: { ...record.scene!.cards, students: [{ id: "s3", name: STUDENT_NAME }] },
      },
    } as unknown as CustomTemplateRecord;

    const json = serializeTemplatePack(createTemplatePack({ record: dirty }));

    expect(json).not.toContain("students");
    expect(json).not.toContain(STUDENT_NAME);
  });

  it("aborts serialization when student data survives into the pack", () => {
    const pack = createTemplatePack({ record: makeRecord() });
    (pack.document as unknown as Record<string, unknown>).students = [{ name: STUDENT_NAME }];

    const error = expectPackError(() => serializeTemplatePack(pack), "STUDENT_DATA_DETECTED");
    expect(error.message).toContain("名单");
  });

  it("omits scene guests so guest names never leave the browser", () => {
    const record = makeRecord();
    expect(record.scene?.guests.people).toHaveLength(1);

    const pack = createTemplatePack({ record });
    const json = serializeTemplatePack(pack);

    expect(pack.scene).toBeDefined();
    expect((pack.scene as unknown as Record<string, unknown>).guests).toBeUndefined();
    expect(json).not.toContain(GUEST_NAME);
    expect(json).not.toContain("guests");
  });

  it("imports templates with an empty guest panel", () => {
    const json = serializeTemplatePack(createTemplatePack({ record: makeRecord() }));

    const imported = parseTemplatePack(json);

    expect(imported.record.scene?.guests.people).toEqual([]);
    expect(JSON.stringify(imported.record)).not.toContain(GUEST_NAME);
  });

  it.each<[string, (base: Record<string, unknown>) => Record<string, unknown>]>([
    ["顶层", (base) => ({ ...base, students: [{ name: STUDENT_NAME }] })],
    ["document 层", (base) => ({
      ...base,
      document: { ...(base.document as Record<string, unknown>), students: [{ name: STUDENT_NAME }] },
    })],
    ["scene 层", (base) => ({
      ...base,
      scene: { ...(base.scene as Record<string, unknown>), students: [{ name: STUDENT_NAME }] },
    })],
  ])("rejects an imported file carrying students at the %s", (_label, patch) => {
    const raw = JSON.stringify(patch(makePackObject()));

    const error = expectPackError(() => parseTemplatePack(raw), "STUDENT_DATA_DETECTED");
    expect(error.message).toContain("名单");
  });

  it("rejects an imported file carrying students inside a nested array", () => {
    const base = makePackObject();
    const scene = base.scene as Record<string, unknown>;
    const raw = JSON.stringify({
      ...base,
      scene: { ...scene, textElements: [{ id: "t1", students: [{ name: STUDENT_NAME }] }] },
    });

    expectPackError(() => parseTemplatePack(raw), "STUDENT_DATA_DETECTED");
  });

  it.each([
    ["price", { price: 199 }],
    ["sku", { sku: "TPL-001" }],
    ["listed", { listed: true }],
    ["价格", { 价格: "199 元" }],
  ])("rejects an imported file carrying the commercial key %s", (_label, patch) => {
    const raw = JSON.stringify({ ...makePackObject(), ...patch });

    const error = expectPackError(() => parseTemplatePack(raw), "COMMERCIAL_FIELD_REJECTED");
    expect(error.message).toContain("模板交换不含任何收费字段");
  });

  it("rejects commercial keys nested inside the document on import", () => {
    const base = makePackObject();
    const raw = JSON.stringify({
      ...base,
      document: { ...(base.document as Record<string, unknown>), pricing: { amount: 9 } },
    });

    expectPackError(() => parseTemplatePack(raw), "COMMERCIAL_FIELD_REJECTED");
  });

  it("refuses to export a record carrying commercial keys", () => {
    const record = makeRecord();
    const dirty = {
      ...record,
      document: { ...record.document, sku: "TPL-001" },
    } as unknown as CustomTemplateRecord;

    expectPackError(() => createTemplatePack({ record: dirty }), "COMMERCIAL_FIELD_REJECTED");
  });

  it("refuses a license string that looks like a price", () => {
    expectPackError(
      () => createTemplatePack({ record: makeRecord(), license: "¥199 买断" }),
      "COMMERCIAL_FIELD_REJECTED",
    );
  });

  it("does not mistake ordinary template fields for commercial fields", () => {
    expect(() => assertNoCommercialFields(makeRecord())).not.toThrow();
  });

  it.each([
    ["未来版本", 2],
    ["字符串版本", "1"],
    ["零版本", 0],
    ["缺失版本", undefined],
  ])("rejects an unsupported %s", (_label, version) => {
    const raw = JSON.stringify({ ...makePackObject(), version });

    const error = expectPackError(() => parseTemplatePack(raw), "UNSUPPORTED_VERSION");
    expect(error.message).toContain("升级");
  });

  it("rejects files that are not template packs", () => {
    const error = expectPackError(
      () => parseTemplatePack(JSON.stringify({ ...makePackObject(), kind: "something-else" })),
      "NOT_TEMPLATE_PACK",
    );
    expect(error.message).toContain("模板文件");
  });

  it("points project packages at the project import entry instead of failing vaguely", () => {
    const raw = JSON.stringify({
      kind: "cengfan-project-package",
      version: 2,
      project: { students: [] },
    });

    const error = expectPackError(() => parseTemplatePack(raw), "PROJECT_PACKAGE_REJECTED");
    expect(error.message).toContain("工程包");
  });

  it("rejects invalid JSON", () => {
    const error = expectPackError(() => parseTemplatePack("{ not json"), "INVALID_JSON");
    expect(error.message).toContain("JSON");
  });

  it("rejects unknown top-level keys so the schema stays closed", () => {
    const raw = JSON.stringify({ ...makePackObject(), mystery: { note: "夹带" } });

    const error = expectPackError(() => parseTemplatePack(raw), "UNKNOWN_FIELD");
    expect(error.message).toContain("mystery");
  });

  it("rejects a structurally broken template document", () => {
    const base = makePackObject();
    const document = { ...(base.document as Record<string, unknown>) };
    delete document.canvas;
    const raw = JSON.stringify({ ...base, document });

    expectPackError(() => parseTemplatePack(raw), "TEMPLATE_INVALID");
  });

  it("rejects a template without a usable name", () => {
    expectPackError(() => parseTemplatePack(JSON.stringify({ ...makePackObject(), name: "   " })), "TEMPLATE_INVALID");
  });

  it("builds a filesystem-safe filename", () => {
    const pack: TemplatePack = {
      ...createTemplatePack({ record: makeRecord(), now: new Date("2026-08-24T10:00:00.000Z") }),
      name: 'a/b\\c:d*e?f"g<h>i|j',
    };

    const filename = templatePackFilename(pack);

    expect(filename).toBe(`a-b-c-d-e-f-g-h-i-j-2026-08-24${TEMPLATE_PACK_FILE_EXTENSION}`);
  });

  it("refuses oversized files before reading them into memory", async () => {
    const text = vi.fn(async () => "{}");
    const file = { name: "big.cengfan-template", size: MAX_TEMPLATE_PACK_BYTES + 1, text } as unknown as File;

    await expect(readTemplatePackFile(file)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(text).not.toHaveBeenCalled();
  });

  it("reads a template pack from a file", async () => {
    const json = serializeTemplatePack(createTemplatePack({ record: makeRecord(), author: "小林" }));
    const file = new File([json], "卡通开学墙.cengfan-template", { type: "application/json" });

    const imported = await readTemplatePackFile(file);

    expect(imported.record.name).toBe("卡通开学墙");
    expect(imported.author).toBe("小林");
  });

  it("does not claim .cengfan project packages in its file picker filter", () => {
    const templateFile = new File(["{}"], "模板.cengfan-template", { type: "" });
    const projectFile = new File(["{}"], "工程.cengfan", { type: "" });

    expect(fileMatchesAccept(templateFile, TEMPLATE_PACK_FILE_ACCEPT)).toBe(true);
    expect(fileMatchesAccept(projectFile, TEMPLATE_PACK_FILE_ACCEPT)).toBe(false);
  });

  it("truncates over-long names and author nicknames", () => {
    const record = { ...makeRecord(), name: "长".repeat(120) };

    const pack = createTemplatePack({ record, author: "昵".repeat(80) });

    expect(Array.from(pack.name)).toHaveLength(60);
    expect(Array.from(pack.author ?? "")).toHaveLength(24);
  });

  it("omits the author when no nickname is provided", () => {
    const pack = createTemplatePack({ record: makeRecord() });

    expect(pack.author).toBeUndefined();
    expect(serializeTemplatePack(pack)).not.toContain('"author"');
  });
});
