import { restoreProjectPackage, type ProjectPackage } from "./project-package";

export interface WorkspaceSnapshot {
  kind: "cengfan-workspace";
  version: 1;
  projectPackage: ProjectPackage;
}

type Request = typeof fetch;

export async function loadWorkspacePackage(request: Request = fetch): Promise<ProjectPackage | null> {
  const response = await request("/api/workspace", {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`工作区恢复失败：${response.status}`);
  const snapshot = await response.json() as Partial<WorkspaceSnapshot>;
  if (snapshot.kind !== "cengfan-workspace" || snapshot.version !== 1 || !snapshot.projectPackage) {
    throw new Error("工作区快照格式无效");
  }
  return restoreProjectPackage(snapshot.projectPackage);
}

export async function saveWorkspacePackage(projectPackage: ProjectPackage, request: Request = fetch): Promise<void> {
  const snapshot: WorkspaceSnapshot = {
    kind: "cengfan-workspace",
    version: 1,
    projectPackage,
  };
  const response = await request("/api/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error(`工作区保存失败：${response.status}`);
}
