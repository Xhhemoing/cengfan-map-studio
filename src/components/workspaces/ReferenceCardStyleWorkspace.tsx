import { Check } from "lucide-react";
import { applyCardTemplate, listCardTemplates } from "../../lib/card-templates";
import type { CardPresentation, CardSettings } from "../../lib/scene-document";

const REFERENCE_PRESENTATIONS: CardPresentation[] = [
  "color-pill",
  "emblem-list",
  "city-label",
  "glass-stat",
];

export function ReferenceCardStyleWorkspace({ cards, onPatch }: {
  cards: CardSettings;
  onPatch: (patch: Partial<CardSettings>) => void;
}) {
  const templates = listCardTemplates().filter((template) =>
    REFERENCE_PRESENTATIONS.includes(template.cards.presentation ?? "standard"),
  );

  return (
    <main className="reference-card-style-workspace" aria-label="展示框样式">
      <header className="reference-card-style-workspace__header">
        <div>
          <h2>展示框样式</h2>
          <p>选择可直接在画布和导出文件中稳定渲染的样式。</p>
        </div>
      </header>
      <div className="reference-card-style-workspace__grid">
        {templates.map((template) => {
          const selected = cards.templateId === template.id || cards.presentation === template.cards.presentation;
          return (
            <button
              key={template.id}
              type="button"
              className={`reference-card-style-option${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onPatch(applyCardTemplate(template.id, cards))}
            >
              <span className={`reference-card-style-option__preview is-${template.cards.presentation ?? "standard"}`} aria-hidden="true">
                <i />
                <b>{template.name.slice(0, 4)}</b>
                <small>院校 · 姓名</small>
                <small>城市 · 去向</small>
              </span>
              <span className="reference-card-style-option__copy">
                <strong>{template.name}</strong>
                <small>{template.description}</small>
              </span>
              {selected && <Check size={18} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </main>
  );
}
