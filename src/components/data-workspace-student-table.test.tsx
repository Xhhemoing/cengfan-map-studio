import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { DataWorkspaceStudentTable } from "./data-workspace-student-table";
import { createEmptyStudentDraft } from "../lib/data-workspace";
import type { Student } from "../lib/project-data";

const students: Student[] = [{
  id: "student-1",
  name: "林舟",
  university: "北京大学",
  city: "北京市",
  visibility: true,
}];

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

type TableProps = ComponentProps<typeof DataWorkspaceStudentTable>;

function renderTable(overrides: Partial<TableProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props: TableProps = {
    students,
    selectedStudentId: null,
    onSelectStudent: vi.fn(),
    onToggleVisibility: vi.fn(),
    onDeleteStudent: vi.fn(),
    confirmDelete: () => true,
    editing: {
      studentId: null,
      draft: createEmptyStudentDraft(),
      onChangeDraft: vi.fn(),
      onStart: vi.fn(),
      onSave: vi.fn(),
      onCancel: vi.fn(),
    },
    provinceEditing: {
      studentId: null,
      draft: "",
      onChangeDraft: vi.fn(),
      onStart: vi.fn(),
      onSave: vi.fn(),
      onCancel: vi.fn(),
    },
    ...overrides,
  };
  flushSync(() => root.render(<DataWorkspaceStudentTable {...props} />));
  return { container };
}

function expectDecorativeSvgs(scope: Element, expectedCount: number) {
  const svgs = Array.from(scope.querySelectorAll("svg"));
  expect(svgs).toHaveLength(expectedCount);
  svgs.forEach((svg) => expect(svg.getAttribute("aria-hidden")).toBe("true"));
}

describe("DataWorkspaceStudentTable", () => {
  it("hides row action icons from the a11y tree while keeping button labels", () => {
    const { container } = renderTable();

    const buttons = container.querySelector(".student-row__buttons")!;
    expect(buttons).not.toBeNull();
    expect(buttons.querySelector('button[aria-label="编辑 林舟"]')).not.toBeNull();
    expect(buttons.querySelector('button[aria-label="隐藏 林舟"]')).not.toBeNull();
    expect(buttons.querySelector('button[aria-label="删除 林舟"]')).not.toBeNull();
    expectDecorativeSvgs(buttons, 3);

    // The small inline province pencil is decorative too.
    const provinceEdit = container.querySelector('button[aria-label="修改 林舟 省份"]')!;
    expect(provinceEdit.getAttribute("type")).toBe("button");
    expectDecorativeSvgs(provinceEdit, 1);
  });

  it("hides the show icon when the student is hidden", () => {
    const { container } = renderTable({
      students: [{ ...students[0]!, visibility: false }],
    });

    const buttons = container.querySelector(".student-row__buttons")!;
    expect(buttons.querySelector('button[aria-label="显示 林舟"]')).not.toBeNull();
    expectDecorativeSvgs(buttons, 3);
  });

  it("hides the save/cancel icons of the inline row editor", () => {
    const { container } = renderTable({
      editing: {
        studentId: "student-1",
        draft: { name: "林舟", university: "北京大学", city: "北京市" },
        onChangeDraft: vi.fn(),
        onStart: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
      },
    });

    const buttons = container.querySelector(".student-row__buttons")!;
    expect(buttons).not.toBeNull();
    expect(buttons.querySelector('button[aria-label="保存 林舟"]')).not.toBeNull();
    expect(buttons.querySelector('button[aria-label="取消编辑 林舟"]')).not.toBeNull();
    expectDecorativeSvgs(buttons, 2);
  });

  it("hides the save/cancel icons of the province editor", () => {
    const { container } = renderTable({
      provinceEditing: {
        studentId: "student-1",
        draft: "北京市",
        onChangeDraft: vi.fn(),
        onStart: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
      },
    });

    const editor = container.querySelector(".student-province-editor")!;
    expect(editor).not.toBeNull();
    const save = editor.querySelector('button[aria-label="保存 林舟 省份"]')!;
    const cancel = editor.querySelector('button[aria-label="取消编辑 林舟 省份"]')!;
    expect(save).not.toBeNull();
    expect(cancel).not.toBeNull();
    expectDecorativeSvgs(save, 1);
    expectDecorativeSvgs(cancel, 1);
  });
});
