import { describe, expect, it } from "vitest";
import { agentStepLabel } from "./agent-step-labels";

describe("agentStepLabel", () => {
  it("renders update_* patches with Chinese tool and field labels (I-13-04)", () => {
    expect(agentStepLabel({ name: "update_cards", arguments: { patch: { preset: "compact", compactLayout: true } } })).toBe("调整数据卡片：卡片样式、紧凑排版");
    expect(agentStepLabel({ name: "update_map", arguments: { patch: { scale: 0.9, landColor: "#ffffff" } } })).toBe("调整地图：缩放、陆地颜色");
    expect(agentStepLabel({ name: "update_canvas", arguments: { patch: { width: 900 } } })).toBe("调整画布：宽度");
  });

  it("labels flat update arguments while skipping identifier keys", () => {
    expect(agentStepLabel({ name: "update_canvas", arguments: { width: 900, backgroundOpacity: 0.8 } })).toBe("调整画布：宽度、背景透明度");
    expect(agentStepLabel({ name: "update_text", arguments: { id: "text-1", patch: { content: "你好" } } })).toBe("调整文本：文字内容");
    expect(agentStepLabel({ name: "update_province", arguments: { province: "浙江省", patch: { appearance: {} } } })).toBe("调整省份样式：省份贴图");
  });

  it("translates data view and auto layout values", () => {
    expect(agentStepLabel({ name: "set_data_view", arguments: { view: "province" } })).toBe("切换数据视图：省份卡片");
    expect(agentStepLabel({ name: "auto_layout", arguments: {} })).toBe("自动排版：四象限");
    expect(agentStepLabel({ name: "auto_layout", arguments: { mode: "grid" } })).toBe("自动排版：边缘网格");
  });

  it("covers common SCENE_DOMAIN_PROPS fields with Chinese labels (I-14-05)", () => {
    expect(agentStepLabel({ name: "update_province", arguments: { province: "浙江省", patch: { fill: "#d05a45" } } })).toBe("调整省份样式：填色");
    expect(agentStepLabel({ name: "update_province", arguments: { province: "浙江省", patch: { visible: false, labelFontId: "font-kai" } } })).toBe("调整省份样式：显示状态、标注字体");
    expect(agentStepLabel({ name: "update_guests", arguments: { patch: { displayMode: "cards", customText: "寄语" } } })).toBe("调整嘉宾栏：显示方式、自定义文本");
    expect(agentStepLabel({ name: "update_cards", arguments: { patch: { nameFormat: "{surname}xx", noWrapFields: ["name"] } } })).toBe("调整数据卡片：姓名格式、不分行字段");
    expect(agentStepLabel({ name: "update_asset", arguments: { id: "asset-1", patch: { rotation: 30, kind: "landmark" } } })).toBe("调整素材：旋转角度、素材类型");
    expect(agentStepLabel({ name: "update_map", arguments: { patch: { renderSource: { kind: "vector" } } } })).toBe("调整地图：地图渲染来源");
  });

  it("wraps unknown tools and fields in Chinese labels instead of bare English (I-14-05)", () => {
    expect(agentStepLabel({ name: "update_cards", arguments: { patch: { unknownField: 1 } } })).toBe("调整数据卡片：属性（unknownField）");
    expect(agentStepLabel({ name: "mystery_tool", arguments: {} })).toBe("执行修改（mystery_tool）");
  });
});
