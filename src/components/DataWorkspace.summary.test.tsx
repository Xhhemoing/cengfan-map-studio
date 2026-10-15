import { describe, expect, it } from "vitest";
import type { Student } from "../lib/project-data";
import {
  changeInput, getInput, installDataWorkspaceTestHarness, renderWorkspace, students,
} from "./data-workspace-test-harness";

installDataWorkspaceTestHarness();

const records: Student[] = [
  students[0]!,
  { ...students[0]!, id: "student-2", name: "周晴", visibility: false },
  { ...students[0]!, id: "student-3", name: "星河", city: "火星市" },
];

function readSummary(container: HTMLElement) {
  const summary = container.querySelector('[aria-label="名单状态"]')!;
  return Array.from(summary.children, (child) => child.textContent?.replace(/\s/g, ""));
}

describe("DataWorkspace standalone roster summary", () => {
  it("retains its own heading, summary and full editing/import controls by default", () => {
    const container = renderWorkspace({ students: records });

    expect(container.textContent).toContain("学生数据中心");
    expect(container.textContent).toContain("2 显示 / 3 条");
    expect(readSummary(container)).toEqual(["3总记录", "2可见", "1隐藏", "1未匹配城市"]);
    expect(container.querySelector(".draft-form")).not.toBeNull();
    expect(container.querySelector("textarea")?.labels?.[0]?.textContent).toBe("导入文本");
    expect(container.querySelector('[aria-label="地图呈现方式"]')).not.toBeNull();
    expect(container.querySelector('table[aria-label="学生数据表"]')).not.toBeNull();
  });

  it("keeps full-roster visibility and unresolved counts when results exclude those records", () => {
    const container = renderWorkspace({ students: records });
    const filter = getInput(container, "筛选学生");

    changeInput(filter, "林舟");

    expect(container.querySelectorAll("[data-student-row]")).toHaveLength(1);
    expect(readSummary(container)).toEqual(["3总记录", "2可见", "1隐藏", "1未匹配城市"]);
    expect(container.textContent).toContain("2 显示 / 3 条");
    expect(document.getElementById(filter.getAttribute("aria-describedby")!)?.textContent)
      .toBe("找到 1 条匹配记录（名单共 3 条）");

    changeInput(filter, "不存在的姓名");
    expect(container.querySelectorAll("[data-student-row]")).toHaveLength(0);
    expect(readSummary(container)).toEqual(["3总记录", "2可见", "1隐藏", "1未匹配城市"]);
    expect(container.textContent).toContain("找到 0 条匹配记录（名单共 3 条）");
  });

  it("lets an embedding shell own the summary without losing import or roster controls", () => {
    const container = renderWorkspace({ students: records, hideRosterSummary: true });

    expect(container.querySelector('[aria-label="名单状态"]')).toBeNull();
    expect(container.querySelector(".draft-form")).not.toBeNull();
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(getInput(container, "筛选学生")).not.toBeNull();
    expect(container.querySelectorAll("[data-student-row]")).toHaveLength(3);
  });
});
