import { describe, expect, it } from "vitest";
import { isImportFailureMessage } from "./import-message";

describe("isImportFailureMessage", () => {
  it.each([
    "模板下载失败",
    "智能识别失败",
    "Excel 解析失败",
    "读取失败",
    "没有从文本识别到可导入数据",
    "没有从智能识别（local-fallback）识别到可导入的学生记录",
    "Excel 中没有工作表",
    "请先粘贴名单",
    "请先粘贴需要智能识别的名单",
    "学生姓名、就读院校和城市不能为空",
    "学生名称不能为空",
    "没有可导入的有效记录，2 条校验问题",
    "识别结果无法转换为有效记录",
    "无法定位城市：火星城",
  ])("classifies %s as a failure", (text) => {
    expect(isImportFailureMessage(text)).toBe(true);
  });

  it.each([
    "已下载学生数据导入模板",
    "已新增 1 名学生",
    "已更新 林舟",
    "已替换 3 条学生数据",
    "已追加 2 条学生数据",
    "已从智能识别（local-fallback）导入 2 条学生记录",
    "从文本识别到 3 条候选，另有 1 行未识别",
    "替换摘要：当前 1 条，新 2 条",
  ])("classifies %s as success/info", (text) => {
    expect(isImportFailureMessage(text)).toBe(false);
  });

  it("treats an empty message as non-failure so the alert region stays silent", () => {
    expect(isImportFailureMessage("")).toBe(false);
  });
});
