import { Database, MapPinned, Rows3, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { GlobalDataView } from "../GlobalDataScreen";

const navigation: Array<{ id: GlobalDataView; label: string; description: string; icon: typeof Database }> = [
  { id: "overview", label: "数据总览", description: "查看工程数据状态", icon: Database },
  { id: "roster", label: "名单管理", description: "导入、编辑和筛选", icon: Rows3 },
  { id: "quality", label: "数据质量", description: "处理异常和缺失", icon: ShieldCheck },
  { id: "mapping", label: "地图映射", description: "修正城市和省份", icon: MapPinned },
  { id: "presentation", label: "数据呈现", description: "切换地图和卡片表达", icon: SlidersHorizontal },
];

export function globalDataViewLabel(view: GlobalDataView): string {
  return navigation.find((item) => item.id === view)?.label ?? "数据总览";
}

export function GlobalDataNavigation({ activeView, onChange }: {
  activeView: GlobalDataView;
  onChange: (view: GlobalDataView) => void;
}) {
  return (
    <nav className="global-data-nav" role="tablist" aria-label="全局数据工作台导航">
      {navigation.map(({ id, label, description, icon: Icon }) => (
        <button key={id} type="button" role="tab" aria-label={label} aria-selected={activeView === id} aria-controls={`global-data-${id}`} tabIndex={activeView === id ? 0 : -1} className={activeView === id ? "is-active" : undefined} onClick={() => onChange(id)}>
          <Icon size={17} aria-hidden />
          <span><strong>{label}</strong><small>{description}</small></span>
        </button>
      ))}
    </nav>
  );
}