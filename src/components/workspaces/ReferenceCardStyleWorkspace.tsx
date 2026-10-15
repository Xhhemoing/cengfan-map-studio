import { getSelectedCardIds } from "../../lib/card-settings-scope";
import type { ResolvedProjectScene } from "../../lib/resolved-scene";
import { Check } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { applyCardTemplate, getCardTemplateLayoutSuggestions, listCardTemplates } from "../../lib/card-templates";
import type { MapTemplateId } from "../../lib/project-data";
import type { ProjectDocument } from "../../lib/project-document";
import type { UserFont } from "../../lib/fonts";
import type { CardPresentation, CardSettings, SceneSelection } from "../../lib/scene-document";
import { PosterCanvas } from "../canvas/PosterCanvas";
import { CardsInspector } from "../inspector/CardsInspector";
import { TemplatePicker, type CustomTemplateOption, type TemplateOption } from "../TemplatePicker";
import { CardStyleSamples } from "./CardStyleSamples";

const REFERENCE_PRESENTATIONS: CardPresentation[] = [
  "color-pill",
  "emblem-list",
  "city-label",
  "glass-stat",
];

/** 4 套可在画布与导出文件中稳定渲染的展示框样式格。 */
export function ReferenceCardStyleOptions({ cards, onPatch }: {
  cards: CardSettings;
  onPatch: (patch: Partial<CardSettings>) => void;
}) {
  const [includeSuggestions, setIncludeSuggestions] = useState(false);
  const suggestionId = useId();
  const templates = listCardTemplates().filter((template) =>
    REFERENCE_PRESENTATIONS.includes(template.cards.presentation ?? "standard"),
  );

  return (
    <>
    <label htmlFor={suggestionId} className="boolean-control checkbox-row">
      <input id={suggestionId} type="checkbox" checked={includeSuggestions} onChange={(event) => setIncludeSuggestions(event.target.checked)} />
      同时采用分组、内容与空间建议
    </label>
    <p className="property-panel__hint">默认只换外观，保留分组、字号和已调整的位置。</p>
    <div className="reference-card-style-options">
      {templates.map((template) => {
        const selected = cards.templateId === template.id || cards.presentation === template.cards.presentation;
        const suggestions = getCardTemplateLayoutSuggestions(template.id, cards);
        return (
          <button
            key={template.id}
            type="button"
            className={`reference-card-style-option${selected ? " is-selected" : ""}`}
            data-reference-card-style={template.id}
            data-reference-card-style-selected={selected ? "true" : "false"}
            aria-pressed={selected}
            onClick={() => onPatch(applyCardTemplate(template.id, cards, includeSuggestions ? "visual-and-layout" : "visual"))}
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
              {includeSuggestions && Object.keys(suggestions).length > 0 && <small>将同时调整：{suggestions.grouping ? `按${suggestions.grouping === "city" ? "城市" : suggestions.grouping === "university" ? "院校" : "省份"}分组` : "内容或空间设置"}</small>}
            </span>
            {selected && <Check size={18} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
    </>
  );
}

export interface ReferenceCardStyleRailProps {
  project?: ProjectDocument;
  cards: CardSettings;
  userFonts?: UserFont[];
  templates: TemplateOption[];
  currentTemplateId: string;
  customTemplates: CustomTemplateOption[];
  onApplyTemplate: (id: MapTemplateId) => void;
  onApplyCustomTemplate: (record: CustomTemplateOption) => void;
  onSaveTemplate: () => void;
  onPatch: (patch: Partial<CardSettings>) => void;
  onResetCards: () => void;
  optimizationPanel?: ReactNode;
  scopedInspector?: ReactNode;
}

/**
 * Right rail of the FRAME stage: 整体模板（内置 + 我的模板 + 保存当前），
 * the 4 reference display-frame styles, then the global CardsInspector.
 * The shell owns the rail chrome (labelled aside + resizer + mobile drawer).
 */
export function ReferenceCardStyleRail({
  project,
  cards,
  userFonts = [],
  templates,
  currentTemplateId,
  customTemplates,
  onApplyTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
  onPatch,
  onResetCards,
  optimizationPanel,
  scopedInspector,
}: ReferenceCardStyleRailProps) {
  return (
    <aside className="reference-card-style-rail" aria-label="版式与展示框样式">
      {optimizationPanel}
      <TemplatePicker
        templates={templates}
        currentTemplateId={currentTemplateId}
        customTemplates={customTemplates}
        onApplyTemplate={onApplyTemplate}
        onApplyCustomTemplate={onApplyCustomTemplate}
        onSaveTemplate={onSaveTemplate}
      />
      <section className="reference-card-style-rail__styles" aria-label="展示框样式">
        <div className="reference-card-style-rail__heading">
          <strong>全局展示框样式</strong>
          <small>可稳定渲染的 4 套</small>
        </div>
        <ReferenceCardStyleOptions cards={cards} onPatch={onPatch} />
      </section>
      {project && <CardStyleSamples project={project} userFonts={userFonts} />}
      {scopedInspector ?? <CardsInspector
        cards={cards}
        userFonts={userFonts}
        onPatch={onPatch}
        onReset={onResetCards}
        mode="global"
        collapsible
      />}
    </aside>
  );
}

export interface ReferenceCardStyleWorkspaceProps {
  onSceneResolved?: (scene: ResolvedProjectScene) => void;
  project: ProjectDocument;
  selection: SceneSelection;
  userFonts?: UserFont[];
  onSelect: (selection: SceneSelection) => void;
  onMoveCard?: (id: string, x: number, y: number) => void;
  onMoveGuests?: (x: number, y: number) => void;
  onCardPositionsResolved?: (positions: Record<string, { x: number; y: number }>) => void;
}

/**
 * Center content of the FRAME stage: the live poster canvas, wired like the
 * map/content stages (onSelect / onMoveCard / onCardPositionsResolved), so
 * template and display-frame changes preview immediately. The style options
 * and the CardsInspector live in the unified right rail
 * (`ReferenceCardStyleRail`).
 */
export function ReferenceCardStyleWorkspace({
  onSceneResolved,
  project,
  selection,
  userFonts = [],
  onSelect,
  onMoveCard,
  onMoveGuests,
  onCardPositionsResolved,
}: ReferenceCardStyleWorkspaceProps) {
  return (
    <main className="reference-card-style-workspace" aria-label="版式">
      <div className="reference-card-style-workspace__body">
        <section className="reference-card-style-workspace__preview" aria-label="版式画布">
          <div className="reference-card-style-workspace__preview-heading">
            <div>
              <strong>版式</strong>
              <small>展示框与海报结构 · 右侧改动实时反映</small>
            </div>
            <span>{project.canvas.width} × {project.canvas.height}</span>
          </div>
          <div className="reference-card-style-workspace__canvas">
            <PosterCanvas
              selectedCardIds={getSelectedCardIds(selection, project.cards, project)}
              onSceneResolved={onSceneResolved}
              project={project}
              selectedProvince={selection.type === "province" ? selection.province : null}
              userFonts={userFonts}
              onSelect={onSelect}
              onMoveCard={onMoveCard}
              onMoveGuests={onMoveGuests}
              onCardPositionsResolved={onCardPositionsResolved}
              mapSelected={selection.type === "map"}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
