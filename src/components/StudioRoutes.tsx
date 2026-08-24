import { useCallback, useSyncExternalStore } from "react";
import { AlertTriangle } from "lucide-react";
import { App } from "../App";
import { ProjectWorkbench } from "./ProjectWorkbench";
import {
  editorProjectStore,
  projectStoreHealthChannel,
  type ProjectStoreHealthChannel,
} from "../lib/editor-project-store";
import type { ProjectStore, ProjectStoreError, ProjectStoreHealth } from "../lib/project-store";

const MEMORY_MODE_NOTICE = "本次编辑不会保存到本机，请及时导出工程备份";
const MEMORY_MODE_DETAIL = "浏览器本机存储不可用，本次编辑只保留在当前标签页内存中。";

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

/**
 * 编辑器路由上的降级提示。
 * 提示挂在 App 外面:降级是路由层的存储状态,不属于编辑器画布本身。
 */
function MemoryModeNotice({ recoverError }: { recoverError: ProjectStoreError | null }) {
  return (
    <section className="workbench-resume workbench-storage-notice" role="status" data-store-health="memory">
      <span className="workbench-resume-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
      <span className="workbench-resume-body">
        <strong>{MEMORY_MODE_NOTICE}</strong>
        {/* 写回失败(典型是配额耗尽)才是用户能动手解决的那条信息,优先于通用说明。 */}
        <small>{recoverError ? recoverError.message : MEMORY_MODE_DETAIL}</small>
      </span>
    </section>
  );
}

export function WorkbenchRoute({ store = editorProjectStore, healthChannel = projectStoreHealthChannel }: StudioRouteProps) {
  const { health } = useStoreHealth(healthChannel);
  return <ProjectWorkbench store={store} health={health} />;
}

export function ProjectRoute({ projectId, healthChannel = projectStoreHealthChannel }: StudioRouteProps & { projectId: string }) {
  const { health, recoverError } = useStoreHealth(healthChannel);
  return (
    <>
      {health === "memory" && <MemoryModeNotice recoverError={recoverError} />}
      <App projectId={projectId} />
    </>
  );
}
