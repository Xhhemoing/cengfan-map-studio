import { useState } from "react";
import { getCardPositionPolicy, getCardPositionSource, getCardScopeKey, resolveCardSettings } from "../../lib/card-settings-scope";
import type { CardSettings, SceneSelection } from "../../lib/scene-document";
import type { UserFont } from "../../lib/fonts";
import { CardsInspector } from "./CardsInspector";

export function CardScopeInspector({ cards, ids, userFonts, onPatch, onReset, unavailableSelection = false }: {
  cards: CardSettings;
  ids: string[];
  unavailableSelection?: boolean;
  userFonts: UserFont[];
  onPatch: (target: SceneSelection, patch: Record<string, unknown>) => void;
  onReset: (target: Extract<SceneSelection, { type: "cards" }>) => void;
}) {
  const [editAll, setEditAll] = useState(false);
  const scoped = ids.length > 0 && !editAll;
  const target: Extract<SceneSelection, { type: "cards" }> = scoped ? { type: "cards", ids, scopeGrouping: cards.grouping } : { type: "cards" };
  const effective = scoped ? resolveCardSettings(cards, ids[0]!) : cards;
  const policies = ids.map((id) => getCardPositionPolicy(cards, id));
  const policy = policies.every((value) => value === policies[0]) ? policies[0] : "";
  const overridden = ids.filter((id) => Boolean(cards.styleOverrides?.[getCardScopeKey(cards, id)])).length;
  const sources = new Set(ids.map((id) => getCardPositionSource(cards, id)));
  const sourceLabels = { manual: "手动调整", frozen: "地图调整时保留", auto: "自动排布", legacy: "原工程位置" };

  if (unavailableSelection && !editAll) return <section className="property-panel" role="status">
    <p>所选展示框已不可用，或分组已更改。请在画布重新选择要编辑的框。</p>
    <button type="button" className="secondary-button" onClick={() => setEditAll(true)}>编辑全部展示框的默认样式</button>
  </section>;

  return <>
    <section className="property-panel" data-card-scope>
      <label htmlFor="cards-edit-scope">作用范围
        <select id="cards-edit-scope" value={scoped ? "selected" : "all"} onChange={(event) => setEditAll(event.target.value === "all")}>
          {ids.length > 0 && <option value="selected">{ids.length === 1 ? `当前框：${ids[0]}` : `已选 ${ids.length} 个展示框`}</option>}
          <option value="all">全部展示框的默认样式</option>
        </select>
      </label>
      <p className="property-panel__hint">{scoped
        ? `仅修改所选框。${overridden ? `${overridden} 个框有独立样式，其余属性继承全局。` : "当前继承全局样式。"}`
        : "修改全局默认值；已有单框覆盖继续保留。点击框选择，按住 Shift 可多选。"}</p>
      {scoped && <>
        {ids.length > 1 && <p className="property-panel__hint">控件显示第一个框的有效值；修改某项会应用到全部所选框，其他属性分别保留。</p>}
        <label htmlFor="cards-position-policy">位置策略
          <select id="cards-position-policy" value={policy ?? "auto"} onChange={(event) => onPatch(target, { positionPolicy: event.target.value })}>
            {policy === "" && <option value="" disabled>多个不同策略</option>}
            <option value="auto">允许自动移动</option>
            <option value="preserve">保留当前位置</option>
            <option value="locked">锁定位置（禁止拖动）</option>
          </select>
        </label>
        <p className="property-panel__hint">位置来源：{[...sources].map((source) => sourceLabels[source]).join("、")}。锁定位置参与其他框的排布避让，刷新时继续保留。</p>
        <button className="secondary-button" type="button" disabled={overridden === 0} onClick={() => onPatch(target, { resetStyleOverrides: true })}>恢复所选框的全局继承</button>
      </>}
    </section>
    <CardsInspector cards={effective} userFonts={userFonts} mode={scoped ? "scoped" : "all"}
      onPatch={(patch) => onPatch(target, patch)} onReset={() => onReset(target)} />
  </>;
}
