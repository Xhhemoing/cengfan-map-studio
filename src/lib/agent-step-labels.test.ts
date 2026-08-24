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

  it("falls back to raw names for unknown tools and fields", () => {
    expect(agentStepLabel({ name: "update_cards", arguments: { patch: { unknownField: 1 } } })).toBe("调整数据卡片：unknownField");
    expect(agentStepLabel({ name: "mystery_tool", arguments: {} })).toBe("mystery_tool");
  });
});
