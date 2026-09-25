import { lazy, Suspense, useCallback, useState, useSyncExternalStore } from "react";
import { StorageNotice, StorageNoticeActionError, StorageNoticeExportAction } from "./StorageNotice";
import { RouteLoadingShell } from "./RouteLoadingShell";
import { projectPackageFileName } from "../lib/project-package-file-name";
import {
  editorProjectStore,
  projectStoreHealthChannel,
  type ProjectStoreHealthChannel,
} from "../lib/editor-project-store";
import { downloadProjectPackage } from "../lib/project-package";
import type { ProjectStore, ProjectStoreError, ProjectStoreHealth } from "../lib/project-store";

const LazyApp = lazy(async () => {
  const { App } = await import("../App");
  return { default: App };
});

const LazyProjectWorkbench = lazy(async () => {
  const { ProjectWorkbench } = await import("./ProjectWorkbench");
  return { default: ProjectWorkbench };
});

interface StudioRouteProps {
  /** 覆盖共享项目库,只用于测试。 */
  store?: ProjectStore;
  /** 覆盖健康度数据源,只用于测试。 */
  healthChannel?: ProjectStoreHealthChannel;
}

/** 订阅共享 store 的健康度:恢复持久化后提示必须自行消失,所以不能只读一次快照。 */
function useStoreHealth(channel: ProjectStoreHealthChannel): {
  health: ProjectStoreHealth;
  recoverError: ProjectStoreError | null;
} {
  const subscribe = useCallback((notify: () => void) => channel.subscribe(notify), [channel]);
  const readHealth = useCallback(() => channel.getHealth(), [channel]);
  const readRecoverError = useCallback(() => channel.getRecoverError(), [channel]);
  return {
    health: useSyncExternalStore(subscribe, readHealth, readHealth),
    recoverError: useSyncExternalStore(subscribe, readRecoverError, readRecoverError),
  };
}

export function WorkbenchRoute({ store = editorProjectStore, healthChannel = projectStoreHealthChannel }: StudioRouteProps) {
  const { health, recoverError } = useStoreHealth(healthChannel);
  return (
    <Suspense fallback={<RouteLoadingShell message="正在加载项目工作台…" />}>
      <LazyProjectWorkbench store={store} health={health} recoverError={recoverError} />
    </Suspense>
  );
}

/**
 * 编辑器路由上的降级提示。
 * 提示挂在 App 外面:降级是路由层的存储状态,不属于编辑器画布本身。
 * 催用户导出就得给出口 —— 这里至少放当前项目的一键导出,不必先回工作台。
 */
export function ProjectRoute({
  projectId,
  store = editorProjectStore,
  healthChannel = projectStoreHealthChannel,
}: StudioRouteProps & { projectId: string }) {
  const { health, recoverError } = useStoreHealth(healthChannel);
  const [exportError, setExportError] = useState("");

  const exportCurrent = useCallback(async () => {
    try {
      const stored = await store.get(projectId);
      if (!stored) throw new Error("项目不存在");
      downloadProjectPackage(stored.pack, projectPackageFileName(stored));
      setExportError("");
    } catch (reason) {
      // 存储层已把失败翻译成可直接展示的中文,原样带出来。
      setExportError(reason instanceof Error ? `导出失败：${reason.message}` : "导出失败");
    }
  }, [projectId, store]);

  return (
    <>
      {health === "memory" && (
        <StorageNotice
          recoverError={recoverError}
          exportActions={
            <>
              <StorageNoticeExportAction
                projectId={projectId}
                ariaLabel="导出当前项目"
                onExport={() => void exportCurrent()}
              >
                导出当前项目
              </StorageNoticeExportAction>
              {exportError && <StorageNoticeActionError message={exportError} />}
            </>
          }
        />
      )}
      <Suspense fallback={<RouteLoadingShell message="正在加载编辑器…" />}>
        <LazyApp projectId={projectId} />
      </Suspense>
    </>
  );
}
