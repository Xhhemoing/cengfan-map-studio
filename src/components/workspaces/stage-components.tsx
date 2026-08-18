import { createElement, lazy, Suspense, type ComponentType, type ReactNode } from "react";

// Heterogeneous cache of preloaded stage screens. `any` is required so rails
// with distinct props can share one Map without fighting ComponentType variance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
type AnyComponent = ComponentType<any>;

const workspaceCache = new Map<string, AnyComponent>();

function cachedLazy(key: string, loader: () => Promise<{ default: AnyComponent }>): AnyComponent {
  const LazyComp = lazy(loader);
  function Gate(props: object) {
    return createElement(workspaceCache.get(key) ?? LazyComp, props);
  }
  Gate.displayName = key;
  return Gate;
}

/**
 * Warms workspace modules so tests can render App synchronously. Production
 * leaves the cache empty and lets `React.lazy` split each stage.
 */
export async function preloadStudioWorkspaces(): Promise<void> {
  const [data, map, frame, content, delivery, settings] = await Promise.all([
    import("./DataUploadWorkspace"),
    import("./MapStyleWorkspace"),
    import("./ReferenceCardStyleWorkspace"),
    import("./ContentLayoutWorkspace"),
    import("./DeliveryWorkspace"),
    import("../GlobalSettingsScreen"),
  ]);
  workspaceCache.set("DataUploadRail", data.DataUploadRail);
  workspaceCache.set("DataUploadWorkspace", data.DataUploadWorkspace);
  workspaceCache.set("MapStyleRail", map.MapStyleRail);
  workspaceCache.set("MapStyleWorkspace", map.MapStyleWorkspace);
  workspaceCache.set("ReferenceCardStyleWorkspace", frame.ReferenceCardStyleWorkspace);
  workspaceCache.set("ContentLayoutRail", content.ContentLayoutRail);
  workspaceCache.set("ContentLayoutWorkspace", content.ContentLayoutWorkspace);
  workspaceCache.set("DeliveryRail", delivery.DeliveryRail);
  workspaceCache.set("DeliveryWorkspace", delivery.DeliveryWorkspace);
  workspaceCache.set("GlobalSettingsScreen", settings.GlobalSettingsScreen);
}

export const DataUploadRail = cachedLazy("DataUploadRail", () =>
  import("./DataUploadWorkspace").then((mod) => ({ default: mod.DataUploadRail })),
) as typeof import("./DataUploadWorkspace").DataUploadRail;
export const DataUploadWorkspace = cachedLazy("DataUploadWorkspace", () =>
  import("./DataUploadWorkspace").then((mod) => ({ default: mod.DataUploadWorkspace })),
) as typeof import("./DataUploadWorkspace").DataUploadWorkspace;
export const MapStyleRail = cachedLazy("MapStyleRail", () =>
  import("./MapStyleWorkspace").then((mod) => ({ default: mod.MapStyleRail })),
) as typeof import("./MapStyleWorkspace").MapStyleRail;
export const MapStyleWorkspace = cachedLazy("MapStyleWorkspace", () =>
  import("./MapStyleWorkspace").then((mod) => ({ default: mod.MapStyleWorkspace })),
) as typeof import("./MapStyleWorkspace").MapStyleWorkspace;
export const ReferenceCardStyleWorkspace = cachedLazy("ReferenceCardStyleWorkspace", () =>
  import("./ReferenceCardStyleWorkspace").then((mod) => ({ default: mod.ReferenceCardStyleWorkspace })),
) as typeof import("./ReferenceCardStyleWorkspace").ReferenceCardStyleWorkspace;
export const ContentLayoutRail = cachedLazy("ContentLayoutRail", () =>
  import("./ContentLayoutWorkspace").then((mod) => ({ default: mod.ContentLayoutRail })),
) as typeof import("./ContentLayoutWorkspace").ContentLayoutRail;
export const ContentLayoutWorkspace = cachedLazy("ContentLayoutWorkspace", () =>
  import("./ContentLayoutWorkspace").then((mod) => ({ default: mod.ContentLayoutWorkspace })),
) as typeof import("./ContentLayoutWorkspace").ContentLayoutWorkspace;
export const DeliveryRail = cachedLazy("DeliveryRail", () =>
  import("./DeliveryWorkspace").then((mod) => ({ default: mod.DeliveryRail })),
) as typeof import("./DeliveryWorkspace").DeliveryRail;
export const DeliveryWorkspace = cachedLazy("DeliveryWorkspace", () =>
  import("./DeliveryWorkspace").then((mod) => ({ default: mod.DeliveryWorkspace })),
) as typeof import("./DeliveryWorkspace").DeliveryWorkspace;
export const GlobalSettingsScreen = cachedLazy("GlobalSettingsScreen", () =>
  import("../GlobalSettingsScreen").then((mod) => ({ default: mod.GlobalSettingsScreen })),
) as typeof import("../GlobalSettingsScreen").GlobalSettingsScreen;

export function WorkspaceSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="studio-workspace-loading" role="status" aria-label="正在加载工作区">正在加载工作区…</div>}>
      {children}
    </Suspense>
  );
}
