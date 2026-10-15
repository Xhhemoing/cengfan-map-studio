import { useMemo } from "react";
import type { ProjectDocument } from "../../lib/project-document";
import { buildLayoutGroups } from "../../lib/layout";
import { getVisibleStudents } from "../../lib/project-data";
import { buildPreparedCardContents, type PreparedCardContent, type PreparedCardRow } from "../../lib/prepared-card-content";
import type { CardSettings } from "../../lib/scene-document";
import { createSceneTextMeasurement } from "../../lib/scene-text-measurement";
import { DestinationCard } from "../canvas/DestinationCard";
import { ReferenceCardVisual } from "../canvas/ReferenceCardVisual";
import type { DestinationCardStyle } from "../canvas/DestinationCard";
import type { DestinationCardsAppearance } from "../canvas/DestinationCardsLayer";
import { resolveDestinationCardStyle } from "../canvas/destination-card-effective-style";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "../../lib/card-expression";

export type CardStyleSampleKind = "shortest" | "typical" | "largest" | "longest";
const SAMPLE_LABELS: Record<CardStyleSampleKind, string> = { shortest: "最短内容", typical: "典型内容", largest: "最大分组", longest: "最长字段" };

function score(kind: CardStyleSampleKind, card: PreparedCardContent): number {
  const text = card.rows.flatMap((row: PreparedCardRow) => row.lines.flat()).map((line) => line.text).join("");
  if (kind === "shortest") return text.length;
  if (kind === "longest") return Math.max(0, ...card.rows.flatMap((row: PreparedCardRow) => row.lines.map((line) => line.map((part) => part.text).join("").length)));
  if (kind === "largest") return card.group.count;
  return Math.abs(text.length - 32);
}

function sampleFor(kind: CardStyleSampleKind, cards: PreparedCardContent[]) {
  return [...cards].sort((a, b) => kind === "typical" ? score(kind, a) - score(kind, b) : score(kind, a) - score(kind, b))[kind === "shortest" || kind === "typical" ? 0 : cards.length - 1];
}

export interface CardStyleSamplesProps {
  project: ProjectDocument;
  userFonts?: import("../../lib/fonts").UserFont[];
  cards?: CardSettings;
  appearance?: DestinationCardsAppearance;
  baseStyle?: DestinationCardStyle;
  onSampleSelect?: (kind: CardStyleSampleKind) => void;
}

/** Isolated real-data samples. It reuses prepared content and the production card renderers. */
export function CardStyleSamples({ project, userFonts = [], cards = project.cards, appearance, baseStyle, onSampleSelect }: CardStyleSamplesProps) {
  const samples = useMemo(() => {
    const measurement = createSceneTextMeasurement(userFonts);
    const groups = buildLayoutGroups(getVisibleStudents(project.students), cards.grouping);
    const contents = buildPreparedCardContents({
      groups, grouping: cards.grouping, visibleFields: cards.visibleFields, citySubgroups: cards.citySubgroups !== false,
      expressionTemplates: cards.expressionTemplates ?? DEFAULT_CARD_EXPRESSION_TEMPLATES, nameFormat: cards.nameFormat,
      fontSize: cards.fontSize, fieldTypography: cards.fieldTypography, fieldFonts: cards.fieldFonts, userFonts,
      measureText: measurement.options.measureText, compactLayout: cards.compactLayout === true || cards.preset === "compact",
      maxWidth: cards.maxWidth, widthMode: cards.widthMode, minWidth: cards.minWidth, minFontSize: cards.minFontSize,
      horizontalPadding: cards.horizontalPadding ?? cards.padding, bottomPadding: cards.bottomPadding ?? cards.padding,
      showProvinceTexture: cards.showProvinceTexture === true, noWrapFields: new Set(cards.noWrapFields ?? []),
      lineHeightMultiplier: project.canvas.lineHeight ?? 1, canvasWidth: project.canvas.width, safeMargin: project.canvas.safeMargin,
      presentation: cards.presentation, showCount: cards.showCount,
    });
    return (['shortest', 'typical', 'largest', 'longest'] as CardStyleSampleKind[]).map((kind) => ({ kind, card: sampleFor(kind, contents) })).filter((sample) => sample.card);
  }, [cards, project.canvas.lineHeight, project.canvas.safeMargin, project.canvas.width, project.students, userFonts]);

  if (!samples.length) return <section className="card-style-samples" aria-label="真实数据样本"><p>暂无可展示的名单样本。</p></section>;
  return <section className="card-style-samples" aria-label="真实数据样本"><div className="card-style-samples__heading"><strong>真实数据样本</strong><small>用当前名单检查样式适配</small></div><div className="card-style-samples__grid">
    {samples.map(({ kind, card }) => <button key={kind} type="button" className="card-style-sample" aria-label={`查看${SAMPLE_LABELS[kind]}`} onClick={() => onSampleSelect?.(kind)}>
      <span className="card-style-sample__label">{SAMPLE_LABELS[kind]}</span><svg viewBox={`0 0 ${Math.max(120, card.width)} ${Math.max(100, card.height)}`} role="img" aria-label={`${SAMPLE_LABELS[kind]}预览`}>
        {cards.presentation && cards.presentation !== "standard" ? <ReferenceCardVisual presentation={cards.presentation} group={card.group} rows={card.rows} titleLines={card.titleLines} referenceMetrics={card.referenceMetrics} width={card.width} height={card.height} accent={project.map.activeColor} background={cards.background} opacity={cards.opacity} textColor={cards.textColor} fontSize={cards.fontSize} edgeColor={project.map.edgeColor} fieldFonts={cards.fieldFonts} fieldTypography={cards.fieldTypography} userFonts={userFonts} showCount={cards.showCount !== false} horizontalPadding={cards.horizontalPadding ?? cards.padding} /> : baseStyle ? <DestinationCard style={resolveDestinationCardStyle(baseStyle, appearance!, cards).style} group={card.group} province={card.province} rows={card.rows} titleLines={card.titleLines} headerExtra={card.headerExtra} width={card.width} height={card.height} provinceTexture={null} /> : <text x="8" y="20">{card.group.title}</text>}
      </svg>
    </button>)}
  </div></section>;
}
