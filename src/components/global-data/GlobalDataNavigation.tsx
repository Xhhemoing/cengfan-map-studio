import type { GlobalDataView } from "../GlobalDataScreen";
import { globalDataViews } from "../../lib/global-data-views";

export function GlobalDataNavigation({ activeView, onChange }: {
  activeView: GlobalDataView;
  onChange: (view: GlobalDataView) => void;
}) {
  return (
    <nav className="global-data-nav" role="tablist" aria-label="全局数据工作台导航">
      {globalDataViews.map(({ id, label, description, icon: Icon }) => (
        <button key={id} type="button" role="tab" aria-label={label} aria-selected={activeView === id} aria-controls={`global-data-${id}`} tabIndex={activeView === id ? 0 : -1} className={activeView === id ? "is-active" : undefined} onClick={() => onChange(id)}>
          <Icon size={17} aria-hidden />
          <span><strong>{label}</strong><small>{description}</small></span>
        </button>
      ))}
    </nav>
  );
}
