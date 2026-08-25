import { DRAFT_KEY } from "./app-constants";
import { createProjectDocument, restoreProjectDocument } from "./project-document";
import { sampleStudents } from "./project-data";
import type { ProjectDocument } from "./project-document";

export function createInitialProject(): ProjectDocument {
  return createProjectDocument({
    students: [...sampleStudents],
    templateId: "original",
    dataView: "province",
    textElements: [
      {
        id: "text-title",
        content: "2026 届计算机（1）班毕业去向",
        x: 120,
        y: 80,
        fontSize: 28,
        color: "#1f2a44",
      },
      {
        id: "text-note",
        content: "点击地图高亮省份，查看具体去向",
        x: 120,
        y: 120,
        fontSize: 14,
        color: "#5b6b7a",
      },
      {
        id: "text-wish",
        content: "山高水长，来日再聚",
        x: 745,
        y: 905,
        fontSize: 20,
        color: "#c85d4b",
      },
    ],
  });
}

export function loadInitialProject(): ProjectDocument {
  if (typeof window === "undefined") return createInitialProject();
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
      ?? window.localStorage.getItem("editor:draft:v1");
    if (!raw) return createInitialProject();
    const restored = restoreProjectDocument(raw);
    if (restored.students.length === 0) restored.students = sampleStudents;
    return restored;
  } catch {
    return createInitialProject();
  }
}

export function loadBrowserValue<T>(load: () => T, fallback: T): T {
  try {
    return load();
  } catch {
    return fallback;
  }
}

/** 服务端渲染下没有浏览器状态可读,读取本身失败时退回同一份兜底值。 */
export function loadBrowserState<T>(load: () => T, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return loadBrowserValue(load, fallback);
}
