import type { ProjectSnapshot } from "./project-document";
import { createDefaultScene, normalizeScene, type CardSettings, type SceneDocument } from "./scene-document";
import { normalizeDisplayFrame } from "./display-frame";
import { normalizePrintBleedMm } from "./print-bleed";
import {
  asRecord,
  clamp,
  getEdgeStyle,
  isOneOf,
  stringFromSources,
  type MigrationContext,
  type PrintBleedCanvas,
  type ProjectMigrationOptions,
  type ProvincePosition,
} from "./project-migration-helpers";
import {
  getCardGrouping,
  getCardPreset,
  getDataView,
  getTemplateId,
  getVersion,
  migrateNoWrapFields,
  uniqueFields,
} from "./project-migration-fields";
import { migrateStudents } from "./project-migration-students";
import { migrateMapSettings } from "./project-migration-map";
import { migrateAssetElements, migrateTextElements } from "./project-migration-elements";

export type { ProjectMigrationOptions, ProvincePosition };

function createMigrationContext(input: unknown, options: ProjectMigrationOptions): MigrationContext {
  const payload = asRecord(input) ?? {};
  return {
    payload,
    style: asRecord(payload.style) ?? {},
    defaults: createDefaultScene(getTemplateId(payload)),
    isV2: Number(payload.schemaVersion) === 2,
    options,
  };
}

/** Reads the print bleed off any stored canvas record, defaulting to no bleed. */
export function readPrintBleedMm(canvas: unknown): number {
  return normalizePrintBleedMm(asRecord(canvas)?.printBleedMm);
}

function migrateCanvasSettings(context: MigrationContext): PrintBleedCanvas {
  const { defaults, isV2, payload, style } = context;
  const canvasInput = asRecord(payload.canvas);
  const sources = isV2 && canvasInput ? [canvasInput, style, payload] : [style, payload];
  const backgroundImageSrc = stringFromSources(sources, "backgroundImageSrc", "");
  return {
    ...defaults.canvas,
    ...(isV2 && canvasInput ? canvasInput : {}),
    ...(isV2 ? {} : { width: 1500, height: 1000 }),
    backgroundColor: stringFromSources(sources, "backgroundColor", defaults.canvas.backgroundColor),
    ...(backgroundImageSrc ? { backgroundImageSrc } : {}),
    backgroundFit: isV2 && isOneOf(canvasInput?.backgroundFit, ["cover", "contain", "stretch"] as const)
      ? canvasInput.backgroundFit
      : defaults.canvas.backgroundFit,
    backgroundOpacity: isV2 ? clamp(canvasInput?.backgroundOpacity, 0, 1, defaults.canvas.backgroundOpacity) : 1,
    printBleedMm: readPrintBleedMm(canvasInput),
  };
}

function migrateCardSettings(context: MigrationContext): SceneDocument["cards"] {
  const { defaults, isV2, payload, style } = context;
  const cardsInput = asRecord(payload.cards);
  const positions = asRecord(cardsInput?.positions);
  return {
    ...defaults.cards,
    ...(cardsInput ? cardsInput as Partial<CardSettings> : {}),
    ...(positions ? { positions: positions as CardSettings["positions"] } : {}),
    preset: getCardPreset(isV2 ? cardsInput?.preset ?? style.cardPreset : style.cardPreset, defaults.cards.preset),
    grouping: getCardGrouping(cardsInput?.grouping, defaults.cards.grouping),
    visibleFields: uniqueFields(
      isV2 ? cardsInput?.visibleFields ?? style.visibleFields : style.visibleFields,
      defaults.cards.visibleFields,
    ),
    noWrapFields: migrateNoWrapFields(
      isV2
        ? cardsInput?.noWrapFields ?? style.noWrapFields ?? payload.noWrapFields
        : style.noWrapFields ?? payload.noWrapFields,
    ),
    connectorDash: isV2 && cardsInput
      ? getEdgeStyle(cardsInput.connectorDash ?? defaults.cards.connectorDash)
      : defaults.cards.connectorDash,
    ...(isV2 && cardsInput?.displayFrame !== undefined
      ? { displayFrame: normalizeDisplayFrame(cardsInput.displayFrame, defaults.cards.displayFrame) }
      : {}),
  };
}

function migrateGuestSettings(context: MigrationContext): SceneDocument["guests"] {
  const { defaults, isV2, payload } = context;
  const guestsInput = asRecord(payload.guests);
  return {
    ...defaults.guests,
    ...(isV2 && guestsInput ? guestsInput : {}),
    people: isV2 && Array.isArray(guestsInput?.people)
      ? guestsInput.people as typeof defaults.guests.people
      : defaults.guests.people,
  };
}

export function migrateProjectPayload(
  input: unknown,
  options: ProjectMigrationOptions = {},
): ProjectSnapshot {
  const context = createMigrationContext(input, options);
  const { payload } = context;
  const scene = normalizeScene({
    canvas: migrateCanvasSettings(context),
    map: migrateMapSettings(context),
    cards: migrateCardSettings(context),
    guests: migrateGuestSettings(context),
    textElements: migrateTextElements(context),
    assetElements: migrateAssetElements(context),
  });

  const nextStyle = {
    cardPreset: scene.cards.preset,
    mapScale: scene.map.scale,
    backgroundColor: scene.canvas.backgroundColor,
    ...(scene.canvas.backgroundImageSrc ? { backgroundImageSrc: scene.canvas.backgroundImageSrc } : {}),
    visibleFields: [...scene.cards.visibleFields],
    regionalAssets: {},
  } satisfies ProjectSnapshot["style"];

  return {
    schemaVersion: 2,
    students: migrateStudents(payload.students),
    templateId: getTemplateId(payload),
    dataView: getDataView(payload),
    canvas: scene.canvas,
    map: scene.map,
    cards: scene.cards,
    guests: scene.guests,
    textElements: scene.textElements,
    assetElements: scene.assetElements,
    style: nextStyle,
    version: getVersion(payload),
  };
}
