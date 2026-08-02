import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type NavigationItem<Id extends string> = {
  id: Id;
  label: string;
  description?: string;
  icon?: LucideIcon;
};

export function ToolbarGroup({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["topbar-action-group", className].filter(Boolean).join(" ")} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function ControlCluster({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["control-cluster", className].filter(Boolean).join(" ")} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  meta,
  id,
  className = "",
}: {
  title: ReactNode;
  meta?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={["panel-heading", className].filter(Boolean).join(" ")}>
      <span id={id}>{title}</span>
      {meta !== undefined && <small>{meta}</small>}
    </div>
  );
}

export function PanelSection({
  title,
  meta,
  children,
  className = "",
  label,
  ...sectionProps
}: Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      {...sectionProps}
      className={["asset-section", className].filter(Boolean).join(" ")}
      aria-label={label ?? (typeof title === "string" ? title : undefined)}
    >
      <div className="asset-section__heading">
        <strong>{title}</strong>
        {meta !== undefined && <small>{meta}</small>}
      </div>
      {children}
    </section>
  );
}

export function ActionButton({
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} type={type} className={["wide-button", className].filter(Boolean).join(" ")}>
      {children}
    </button>
  );
}

export function WorkspaceNav<Id extends string>({
  activeId,
  items,
  onChange,
}: {
  activeId: Id;
  items: Array<NavigationItem<Id>>;
  onChange: (id: Id) => void;
}) {
  return (
    <nav className="workspace-nav" aria-label="工作区">
      {items.map(({ id, label, description, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={description ? `${label}：${description}` : label}
          aria-selected={activeId === id}
          className={activeId === id ? "is-active" : undefined}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={17} />}
          <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
        </button>
      ))}
    </nav>
  );
}

export function SegmentedNav<Id extends string>({
  label,
  activeId,
  items,
  onChange,
}: {
  label: string;
  activeId: Id;
  items: Array<NavigationItem<Id>>;
  onChange: (id: Id) => void;
}) {
  return (
    <div className="segmented-nav" role="group" aria-label={label}>
      {items.map(({ id, label: itemLabel }) => (
        <button
          key={id}
          type="button"
          aria-pressed={activeId === id}
          className={activeId === id ? "is-active" : undefined}
          onClick={() => onChange(id)}
        >
          {itemLabel}
        </button>
      ))}
    </div>
  );
}
