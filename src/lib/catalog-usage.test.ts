import { describe, expect, it } from "vitest";
import { createUserAsset } from "./assets";
import { createUserFont } from "./fonts";
import {
  applyDataViewChange,
  findAssetUsage,
  findFontUsage,
  isAssetInUse,
  isFontInUse,
  removeUserAsset,
  removeUserFont,
  STYLE_LAYER_TARGETS,
} from "./catalog-usage";
import { createProjectDocument } from "./project-document";
import { sampleStudents } from "./project-data";

describe("catalog usage helpers", () => {
  it("detects province appearance and instance usage for a catalog asset", () => {
    const asset = createUserAsset({
      label: "西湖",
      src: "data:image/png;base64,abc",
      kind: "province-texture",
      provinceIds: ["浙江省"],
    });
    const project = createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
    });
    project.map.provinceStyles = {
      浙江省: {
        appearance: {
          kind: "texture",
          assetId: asset.id,
          src: asset.src,
          fit: "contain",
          scale: 1,
          overflow: false,
        },
      },
    };
    project.assetElements = [
      {
        id: "instance-1",
        assetId: asset.id,
        label: "旧贴图实例",
        src: asset.src,
        kind: "province-texture",
        province: "浙江省",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        visibility: true,
      },
    ];

    const usage = findAssetUsage(project, asset.id);
    expect(usage.provinces).toEqual(["浙江省"]);
    expect(usage.instances).toEqual([{ id: "instance-1", label: "旧贴图实例" }]);
    expect(isAssetInUse(project, asset.id, asset)).toBe(true);
    expect(removeUserAsset([asset], asset.id)).toEqual([]);
  });

  it("detects font usage across text, cards, provinces, and guests", () => {
    const font = createUserFont({
      label: "手写",
      src: "data:font/ttf;base64,AA==",
      format: "truetype",
    });
    const project = createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
    });
    project.textElements = project.textElements.map((text) =>
      text.id === "text-title" ? { ...text, fontId: font.id } : text,
    );
    project.cards.fieldFonts = { title: font.id, name: font.id };
    project.map.provinceLabelFontId = font.id;
    project.map.provinceStyles = { 陕西省: { labelFontId: font.id } };
    project.guests.titleFontId = font.id;
    project.guests.peopleFontId = font.id;
    project.guests.people = [{ id: "guest-1", name: "张老师", visibility: true, fontId: font.id }];

    const usage = findFontUsage(project, font.id);
    expect(usage.texts.some((text) => text.id === "text-title")).toBe(true);
    expect(usage.cardFields).toEqual(expect.arrayContaining(["title", "name"]));
    expect(usage.provinceLabels).toEqual(expect.arrayContaining(["全部省份", "陕西省"]));
    expect(usage.guestTexts).toEqual(expect.arrayContaining(["嘉宾标题", "全部嘉宾", "张老师"]));
    expect(isFontInUse(project, font.id)).toBe(true);
    expect(removeUserFont([font], font.id)).toEqual([]);
  });

  it("applies data view change with coherent card grouping and fill mode", () => {
    const project = createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
    });
    project.cards.positions = { 北京市: { x: 10, y: 20 } };
    project.map.fillMode = "manual";

    const city = applyDataViewChange(project, "city");
    expect(city.dataView).toBe("city");
    expect(city.cards.grouping).toBe("city");
    expect(city.cards.positions).toEqual({ 北京市: { x: 10, y: 20 } });
    expect(city.map.fillMode).toBe("manual");

    const heat = applyDataViewChange(project, "heat");
    expect(heat.dataView).toBe("heat");
    expect(heat.cards.grouping).toBe("province");
    expect(heat.map.fillMode).toBe("heat");

    const pins = applyDataViewChange(project, "pins");
    expect(pins.dataView).toBe("pins");
    expect(pins.cards.grouping).toBe("province");
    expect(pins.map.fillMode).toBe("manual");
  });

  it("exposes style layer targets for the style panel", () => {
    expect(STYLE_LAYER_TARGETS.map((item) => item.label)).toEqual([
      "画布背景",
      "主标题",
      "副标题",
      "中国地图",
      "数据卡片",
      "特邀嘉宾",
    ]);
  });
});
