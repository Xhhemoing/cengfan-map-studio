import { lazy, Suspense } from "react";
import { RouteLoadingShell } from "./RouteLoadingShell";

const LazyWorkflowPrototype = lazy(async () => {
  const { WorkflowPrototype } = await import("./WorkflowPrototype");
  return { default: WorkflowPrototype };
});

export function WorkflowPrototypeRoute() {
  return (
    <Suspense fallback={<RouteLoadingShell message="正在加载流程原型…" />}>
      <LazyWorkflowPrototype />
    </Suspense>
  );
}
