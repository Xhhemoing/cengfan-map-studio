import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "../lib/card-expression";
import { DEFAULT_NAME_FORMAT, formatStudentName, NAME_FORMAT_PRESETS, normalizeNameFormat } from "../lib/name-format";
import type { CardSettings } from "../lib/scene-document";
import { DeferredInput } from "./DeferredInput";

export function CardPresentationSettings({ cards, onPatch }: {
  cards: CardSettings;
  onPatch: (patch: Partial<CardSettings>) => void;
}) {
  const expressions = cards.expressionTemplates ?? DEFAULT_CARD_EXPRESSION_TEMPLATES;
  const nameFormat = cards.nameFormat ?? DEFAULT_NAME_FORMAT;
  const setExpression = (key: keyof typeof expressions, value: string) => onPatch({
    expressionTemplates: { ...expressions, [key]: value },
  });

  return (
    <section className="property-panel card-presentation-settings">
      <header><h2>内容表达与姓名展示</h2></header>
      <fieldset className="cards-expressions"><legend>通用字段模板</legend>
        <label htmlFor="cards-expression-title">卡片标题<DeferredInput id="cards-expression-title" value={expressions.title} onCommit={(title) => setExpression("title", title)} /></label>
        <label htmlFor="cards-expression-city">城市标题<DeferredInput id="cards-expression-city" value={expressions.city} onCommit={(city) => setExpression("city", city)} /></label>
        <label htmlFor="cards-expression-row">名单内容<DeferredInput id="cards-expression-row" value={expressions.row} onCommit={(row) => setExpression("row", row)} /></label>
        <p className="property-panel__hint">可用：{'{group} {count} {province} {city} {university} {names}'}</p>
      </fieldset>
      <fieldset className="cards-name-format"><legend>姓名展示</legend>
        <div className="cards-name-format__presets">
          {NAME_FORMAT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={nameFormat === preset.value ? "is-active" : ""}
              onClick={() => onPatch({ nameFormat: preset.value })}
            >{preset.label}</button>
          ))}
        </div>
        <label htmlFor="cards-name-format-custom">自定义模板<DeferredInput id="cards-name-format-custom" value={nameFormat} onCommit={(draft) => onPatch({ nameFormat: normalizeNameFormat(draft) })} /></label>
        <p className="property-panel__hint">内置格式：Wxm、wxm、WXM、王*明、王xm。自定义模板可用：{'{name} {surname} {given} {initial} {initials} {surnameInitial} {givenInitials} {last} {rest}'}</p>
        <p className="property-panel__hint">当前预览（王小明）：{formatStudentName("王小明", nameFormat)}</p>
      </fieldset>
    </section>
  );
}
