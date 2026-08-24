import { describe, expect, it, vi } from "vitest";
import { checkLayoutHealth } from "./layout-health";
import {
  createLayoutHealthSignature,
  LayoutHealthCache,
  layoutHealthIssues,
} from "./layout-health-cache";
import type { Student } from "./project-data";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { buildHealthInput } from "./render-health";

function student(id: string, university: string, city: string): Student {
  return { id, name: `同学${id}`, university, city, visibility: true };
}

function projectWith(students: Student[] = [
  student("s1", "北京大学", "北京市"),
  student("s2", "中山大学", "广州市"),
  student("s3", "复旦大学", "上海市"),
]): ProjectDocument {
  return createProjectDocument({ students, templateId: "original", dataView: "province" });
}

/** 计数版缓存：既验证「算了几次」，也验证算出来的东西没被改形。 */
function countingCache(capacity?: number) {
  const compute = vi.fn((project: ProjectDocument) => checkLayoutHealth(buildHealthInput(project)));
  return { compute, cache: new LayoutHealthCache(capacity, compute) };
}

describe("layout health cache", () => {
  it("reuses the same issues array while the signature holds", () => {
    const { compute, cache } = countingCache();
    const project = projectWith();
    const first = cache.issuesFor(project);
    const second = cache.issuesFor({ ...project, students: project.students.map((entry) => ({ ...entry })) });

    expect(compute).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("matches a direct checkLayoutHealth(buildHealthInput(project)) call", () => {
    const { cache } = countingCache();
    const project = projectWith();

    expect(cache.issuesFor(project)).toEqual(checkLayoutHealth(buildHealthInput(project)));
  });

  it.each([
    ["version 自增", (project: ProjectDocument) => ({ ...project, version: project.version + 7 })],
    ["历史栈变化", (project: ProjectDocument) => ({
      ...project,
      history: { past: [{ id: "tx", label: "改名", source: "manual" as const, snapshot: project }], future: [] },
    })],
    ["style 变化", (project: ProjectDocument) => ({ ...project, style: { ...project.style, mapScale: 2 } })],
    ["学生 id 变化", (project: ProjectDocument) => ({
      ...project,
      students: project.students.map((entry) => ({ ...entry, id: `${entry.id}-copy` })),
    })],
    ["隐藏学生的姓名变化", (project: ProjectDocument) => ({
      ...project,
      students: [...project.students, { id: "hidden", name: "隐藏同学", university: "南京大学", city: "南京市", visibility: false }],
    })],
  ])("skips the solve when only %s", (_label, mutate) => {
    const { compute, cache } = countingCache();
    const project = projectWith();
    const baseline = cache.issuesFor(project);
    const mutated = cache.issuesFor(mutate(project));

    expect(compute).toHaveBeenCalledTimes(1);
    expect(mutated).toBe(baseline);
  });

  it.each([
    ["画布尺寸", (project: ProjectDocument) => ({ ...project, canvas: { ...project.canvas, width: 1080, height: 1080 } })],
    ["地图框", (project: ProjectDocument) => ({ ...project, map: { ...project.map, x: project.map.x + 120 } })],
    ["卡片手动位置", (project: ProjectDocument) => ({
      ...project,
      cards: { ...project.cards, positions: { "北京市": { x: project.canvas.width - 10, y: 20 } } },
    })],
    ["连线可见性（无框 + 低不透明度）", (project: ProjectDocument) => ({
      ...project,
      cards: { ...project.cards, preset: "borderless" as const, opacity: 0 },
    })],
    ["嘉宾面板可见性", (project: ProjectDocument) => ({
      ...project,
      guests: { ...project.guests, visibility: !project.guests.visibility },
    })],
    ["文本框位置", (project: ProjectDocument) => ({
      ...project,
      textElements: project.textElements.map((element, index) => index === 0 ? { ...element, x: element.x + 400 } : element),
    })],
    ["可见学生的城市", (project: ProjectDocument) => ({
      ...project,
      students: project.students.map((entry, index) => index === 0 ? { ...entry, city: "杭州市" } : entry),
    })],
    ["数据视图切到 pins", (project: ProjectDocument) => ({ ...project, dataView: "pins" as const })],
  ])("recomputes and stays exact when %s changes", (_label, mutate) => {
    const { compute, cache } = countingCache();
    const project = projectWith();
    cache.issuesFor(project);
    const changed = mutate(project);

    expect(cache.issuesFor(changed)).toEqual(checkLayoutHealth(buildHealthInput(changed)));
    expect(compute).toHaveBeenCalledTimes(2);
  });

  // 图片二进制只记「有/无」：换一张同样存在的底图不动几何，但从无到有会改嘉宾行高等测量，必须重算。
  it("ignores image payload edits but not their presence", () => {
    const { compute, cache } = countingCache();
    const base = projectWith();
    const withImages: ProjectDocument = {
      ...base,
      canvas: { ...base.canvas, backgroundImageSrc: "data:image/png;base64,AAAA" },
      guests: {
        ...base.guests,
        people: [{ id: "g1", name: "张老师", avatarSrc: "data:image/png;base64,AAAA", visibility: true }],
      },
    };
    const swappedImages: ProjectDocument = {
      ...withImages,
      canvas: { ...withImages.canvas, backgroundImageSrc: "data:image/png;base64,BBBBBBBB" },
      guests: {
        ...withImages.guests,
        people: withImages.guests.people.map((person) => ({ ...person, avatarSrc: "data:image/png;base64,BBBBBBBB" })),
      },
    };
    const droppedAvatar: ProjectDocument = {
      ...swappedImages,
      guests: {
        ...swappedImages.guests,
        people: swappedImages.guests.people.map(({ avatarSrc: _avatarSrc, ...person }) => person),
      },
    };

    const issues = cache.issuesFor(withImages);
    expect(cache.issuesFor(swappedImages)).toBe(issues);
    expect(compute).toHaveBeenCalledTimes(1);

    expect(cache.issuesFor(droppedAvatar)).toEqual(checkLayoutHealth(buildHealthInput(droppedAvatar)));
    expect(compute).toHaveBeenCalledTimes(2);
  });

  // 姓名不是纯事实字段：wrapCardText 按真实文案测宽换行，行数决定卡高。
  it("recomputes when a visible student's name changes the measured card height", () => {
    const project = projectWith([student("s1", "北京大学", "北京市")]);
    const renamed = {
      ...project,
      students: project.students.map((entry) => ({ ...entry, name: "名字特别长的一位同学同学同学同学" })),
    };

    expect(createLayoutHealthSignature(renamed)).not.toBe(createLayoutHealthSignature(project));
    expect(buildHealthInput(renamed).objects.find((object) => object.kind === "card")?.bounds.height)
      .not.toBe(buildHealthInput(project).objects.find((object) => object.kind === "card")?.bounds.height);
  });

  it("keeps only the most recent entries and re-solves an evicted one", () => {
    const { compute, cache } = countingCache(2);
    const project = projectWith();
    const wide = { ...project, canvas: { ...project.canvas, width: 1400 } };
    const tall = { ...project, canvas: { ...project.canvas, height: 1400 } };

    cache.issuesFor(project);
    cache.issuesFor(wide);
    const tallIssues = cache.issuesFor(tall);

    expect(cache.size).toBe(2);
    expect(cache.issuesFor(tall)).toBe(tallIssues);
    expect(compute).toHaveBeenCalledTimes(3);

    cache.issuesFor(project);
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it("shares one module-level cache for the editor's single current project", () => {
    const project = projectWith();

    expect(layoutHealthIssues(project)).toBe(layoutHealthIssues({ ...project, version: project.version + 1 }));
  });
});
