import { describe, expect, it } from "vitest";
import {
  buildProvinceSummary,
  getVisibleStudents,
  type Student,
} from "./project-data";

const students: Student[] = [
  { id: "1", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
  { id: "2", name: "陈宁", university: "清华大学", city: "北京市", visibility: true },
  { id: "3", name: "苏禾", university: "浙江大学", city: "杭州市", visibility: true },
];

describe("buildProvinceSummary", () => {
  it("derives province groups and retains visible student details", () => {
    const summary = buildProvinceSummary(students);

    expect(summary).toEqual([
      expect.objectContaining({ province: "北京市", count: 2, students: students.slice(0, 2) }),
      expect.objectContaining({ province: "浙江省", count: 1, students: students.slice(2) }),
    ]);
  });

  it("excludes hidden students from visible records and province summaries", () => {
    const hiddenStudent: Student = {
      id: "student-hidden",
      name: "隐藏同学",
      university: "北京大学",
      city: "北京市",
      visibility: false,
    };

    expect(getVisibleStudents([hiddenStudent])).toEqual([]);
    expect(buildProvinceSummary([...students, hiddenStudent])).toEqual(
      buildProvinceSummary(students),
    );
  });

  it("keeps pre-visibility draft records visible until migration", () => {
    const legacyStudent = {
      id: "student-legacy",
      name: "旧草稿同学",
      university: "北京大学",
      city: "北京市",
      province: "北京市",
      major: "",
    } as unknown as Student;

    expect(getVisibleStudents([legacyStudent])).toEqual([legacyStudent]);
  });

  it("excludes international students from China province summaries", () => {
    const internationalStudent: Student = {
      id: "student-international",
      name: "周晴",
      university: "哈佛大学",
      city: "美国·波士顿",
      locationScope: "international",
      visibility: true,
    };

    expect(getVisibleStudents([...students, internationalStudent])).toContain(internationalStudent);
    expect(buildProvinceSummary([...students, internationalStudent])).toEqual(buildProvinceSummary(students));
  });
});
