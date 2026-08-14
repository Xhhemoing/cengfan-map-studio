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

export function PanelHeader({
  title,
  meta,
  id,
  actions,
  className = "",
}: {
  title: ReactNode;
  meta?: ReactNode;
  id?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={["panel-heading", className].filter(Boolean).join(" ")}>
      <div className="panel-heading__title">
        <span id={id}>{title}</span>
        {meta !== undefined && <small>{meta}</small>}
      </div>
      {actions && <div className="panel-heading__actions">{actions}</div>}
    </div>
  );
}

export function InspectorHeader({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="inspector-header">
      <div className="inspector-header__title">
        <h2>{title}</h2>
        {meta !== undefined && <small>{meta}</small>}
      </div>
      {actions && <ActionGroup label="当前面板操作">{actions}</ActionGroup>}
    </header>
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
    <button {...props} type={type} className={["wide-button", "action-button", className].filter(Boolean).join(" ")}>
      {children}
    </button>
  );
}

export type ButtonVariant = "default" | "secondary" | "danger" | "ghost";

function variantClass(variant: ButtonVariant) {
  return variant === "default" ? "" : `--${variant}`;
}

export function IconButton({
  label,
  icon,
  text,
  variant = "default",
  title,
  className = "",
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children" | "title"> & {
  label: string;
  icon: ReactNode;
  text?: ReactNode;
  variant?: ButtonVariant;
  title?: string;
}) {
  return (
    <button
      {...props}
      type={type}
      className={["icon-button", `icon-button${variantClass(variant)}`, className].filter(Boolean).join(" ")}
      aria-label={label}
      title={title ?? label}
    >
      {icon}
      {text !== undefined && <span className="sr-only">{text}</span>}
    </button>
  );
}

export function ToolbarButton({
  className = "",
  ...props
}: Omit<React.ComponentProps<typeof IconButton>, "className"> & { className?: string }) {
  return <IconButton {...props} className={["toolbar-button", className].filter(Boolean).join(" ")} />;
}

export function CompactButton({
  children,
  icon,
  variant = "default",
  className = "",
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
  icon?: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <button
      {...props}
      type={type}
      className={["compact-button", `compact-button${variantClass(variant)}`, className].filter(Boolean).join(" ")}
      data-studio-density="compact"
    >
      {icon}
      {children}
    </button>
  );
}

export function ActionGroup({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["action-group", className].filter(Boolean).join(" ")} role="group" aria-label={label}>
      {children}
    </div>
  );
}

type SegmentItem<Id extends string> = {
  id: Id;
  label: ReactNode;
  icon?: LucideIcon;
  ariaLabel?: string;
};

export function SegmentedControl<Id extends string>({
  label,
  activeId,
  items,
  onChange,
  className = "",
}: {
  label: string;
  activeId: Id;
  items: Array<SegmentItem<Id>>;
  onChange: (id: Id) => void;
  className?: string;
}) {
  return (
    <div className={["segmented-control", className].filter(Boolean).join(" ")} role="group" aria-label={label}>
      {items.map(({ id, label: itemLabel, icon: Icon, ariaLabel }) => (
        <button
          key={id}
          type="button"
          aria-label={ariaLabel}
          aria-pressed={activeId === id}
          className={activeId === id ? "is-active" : undefined}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={14} aria-hidden />}
          {itemLabel}
        </button>
      ))}
    </div>
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
  return <SegmentedControl label={label} activeId={activeId} items={items} onChange={onChange} className="segmented-nav" />;
}
