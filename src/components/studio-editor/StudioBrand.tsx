import { MapPinned } from "lucide-react";

/** 顶栏品牌标识（加载壳、全局设置页与旧版编辑器共用同一份标记）。 */
export function StudioBrand() {
  return (
    <div className="brand">
      <MapPinned size={24} aria-hidden />
      <span className="brand-label brand-label__full">蹭饭地图工作室</span>
      <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
      <em>Beta</em>
    </div>
  );
}
