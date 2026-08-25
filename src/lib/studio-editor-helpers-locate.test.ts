// 排版问题的「定位」映射：由问题 id 反查画布上该选中哪个对象。
// 连接线类问题（穿卡、引线冲突）的 id 里混着连接线 id 与卡片 id，这里逐类锁定。
import { describe, expect, it } from "vitest";
import { estimateDestinationCardLayouts } from "./content-layout-objects";
import type { Student } from "./project-data";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { listContentLayoutIssues, resolveLayoutIssueSelection } from "./studio-editor-helpers";

const beijing: Student = { id: "student-bj", name: "陈北", university: "北京大学", city: "北京市", province: "北京市", visibility: true };
const zhejiang: Student = { id: "student-zj", name: "沈杭", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true };

/** 默认「original」模板：画布 1500×1000、安全边距 48、地图 (350,120,800,690)。 */
function projectWith(students: Student[]): ProjectDocument {
  return createProjectDocument({ students, templateId: "original", dataView: "province" });
}

/** 把某张卡摆到卡心落在 (x, y)，避免在用例里手算实测宽高。 */
function centeredPosition(project: ProjectDocument, key: string, x: number, y: number) {
  const card = estimateDestinationCardLayouts(project).find((entry) => entry.group.key === key)!;
  return { x: x - card.width / 2, y: y - card.height / 2 };
}

function projectWithPositions(positions: Record<string, { x: number; y: number }>): ProjectDocument {
  const project = projectWith([beijing, zhejiang]);
  project.cards = { ...project.cards, positions };
  return project;
}

describe("resolveLayoutIssueSelection", () => {
  it("locates the crossed card for a connector issue the real check produced", () => {
    const project = projectWith([beijing, zhejiang]);
    // 北京卡在左、浙江卡在中间同一水平线上：北京的引线向右横穿浙江卡正身。
    project.cards = {
      ...project.cards,
      connectorStyle: "straight",
      positions: {
        北京市: centeredPosition(project, "北京市", 250, 351),
        浙江省: centeredPosition(project, "浙江省", 560, 351),
      },
    };

    const crossing = listContentLayoutIssues(project).filter((issue) => issue.kind === "connector-crosses-card");
    expect(crossing.map((issue) => issue.id)).toEqual(["connector-北京市:浙江省"]);
    // 体检报告随附原始对象 id：被穿的卡在前、出发卡殿后，定位不再依赖拆 id。
    expect(crossing[0]!.targets).toEqual(["浙江省", "北京市"]);
    // 手工摆放的卡片没有各自的选中类型，整层 cards 就是画布上能选中的目标。
    expect(resolveLayoutIssueSelection(project, crossing[0]!.id, crossing[0]!.targets)).toEqual({ type: "cards" });
    // 不带 targets 的旧调用继续走 id 片段解析。
    expect(resolveLayoutIssueSelection(project, crossing[0]!.id)).toEqual({ type: "cards" });
  });

  it("prefers the issue's targets over parsing the composite id", () => {
    const project = projectWithPositions({ 北京市: { x: 100, y: 300 } });
    // id 片段按出现顺序会先命中 text-note；targets 指明真正要定位的是 text-title。
    expect(resolveLayoutIssueSelection(project, "text-note:text-title", ["text-title", "text-note"]))
      .toEqual({ type: "text", id: "text-title" });
  });

  it("matches a colon-bearing card key in targets verbatim, without splitting", () => {
    const project = projectWithPositions({ "杭州:西湖": { x: 100, y: 300 } });
    expect(resolveLayoutIssueSelection(project, "connector-北京市:杭州:西湖", ["杭州:西湖", "北京市"]))
      .toEqual({ type: "cards" });
  });

  it("strips the connector- prefix inside targets when only the departure card is placed", () => {
    const project = projectWithPositions({ 北京市: { x: 100, y: 300 } });
    expect(resolveLayoutIssueSelection(project, "connector-北京市:connector-浙江省", ["connector-北京市", "connector-浙江省"]))
      .toEqual({ type: "cards" });
  });

  it("falls back to id fragments when the targets are stale or empty", () => {
    const project = projectWithPositions({ 北京市: { x: 100, y: 300 } });
    expect(resolveLayoutIssueSelection(project, "connector-北京市:浙江省", ["已删除的卡", "另一张已删除的卡"]))
      .toEqual({ type: "cards" });
    expect(resolveLayoutIssueSelection(project, "connector-北京市:浙江省", [])).toEqual({ type: "cards" });
  });

  it("falls back to the connector's own card when the crossed card is no longer placed", () => {
    const project = projectWithPositions({ 北京市: { x: 100, y: 300 } });
    expect(resolveLayoutIssueSelection(project, "connector-北京市:浙江省")).toEqual({ type: "cards" });
  });

  it("locates a connector-conflict pair, whose id names two connectors and no object", () => {
    const project = projectWithPositions({ 北京市: { x: 100, y: 300 }, 浙江省: { x: 600, y: 300 } });
    expect(resolveLayoutIssueSelection(project, "connector-北京市:connector-浙江省")).toEqual({ type: "cards" });
  });

  it("keeps a colon inside a card key instead of splitting the key apart", () => {
    // 分组键来自名单里的省 / 市 / 院校名，用户数据里带 ":" 完全可能。
    const project = projectWithPositions({ "杭州:西湖": { x: 100, y: 300 } });
    expect(resolveLayoutIssueSelection(project, "杭州:西湖")).toEqual({ type: "cards" });
    expect(resolveLayoutIssueSelection(project, "connector-北京市:杭州:西湖")).toEqual({ type: "cards" });
  });

  it("keeps the leading object of a composite id and the non-card targets", () => {
    const project = projectWithPositions({ 北京市: { x: 100, y: 300 } });
    expect(resolveLayoutIssueSelection(project, "text-note:text-title")).toEqual({ type: "text", id: "text-note" });
    expect(resolveLayoutIssueSelection(project, "map")).toEqual({ type: "map" });
    expect(resolveLayoutIssueSelection(project, "guests")).toEqual({ type: "guests" });
    expect(resolveLayoutIssueSelection(project, "cards")).toEqual({ type: "cards" });
  });

  it("prefers an element whose own id starts with connector- over the stripped card key", () => {
    const project = projectWithPositions({ 北京市: { x: 100, y: 300 } });
    project.assetElements = [{
      id: "connector-北京市",
      assetId: "asset-1",
      label: "装饰",
      src: "data:image/png;base64,AAA",
      kind: "decoration",
      x: 10,
      y: 10,
      width: 40,
      height: 40,
      rotation: 0,
      opacity: 1,
      zIndex: 30,
      visibility: true,
    }];
    expect(resolveLayoutIssueSelection(project, "connector-北京市")).toEqual({ type: "asset", id: "connector-北京市" });
  });

  it("returns null when no part of the id names a canvas object", () => {
    const project = projectWithPositions({ 北京市: { x: 100, y: 300 } });
    expect(resolveLayoutIssueSelection(project, "connector-未知:未知")).toBeNull();
    expect(resolveLayoutIssueSelection(project, "connector-未知:未知", ["未知"])).toBeNull();
  });
});
