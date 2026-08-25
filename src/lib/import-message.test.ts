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

  it("treats size and timeout rejections as failures", () => {
    // 这两条是最该打断人的阻断，此前一个失败关键词都不含，被判成功后只进 polite 区。
    expect(isImportFailureMessage("文件过大：Excel / CSV 最多 25 MB。删掉表里无关的工作表和图片后另存一份，再上传。")).toBe(true);
    expect(isImportFailureMessage("解析超时：等了 30 秒还没读完，这个文件可能已损坏。用 Excel / WPS 重新另存一份 .xlsx 再试。")).toBe(true);
    expect(isImportFailureMessage("文件格式不支持")).toBe(true);
    expect(isImportFailureMessage("已追加 3 条学生数据，跳过 1 行")).toBe(false);
  });

  it("treats an empty message as non-failure so the alert region stays silent", () => {
    expect(isImportFailureMessage("")).toBe(false);
  });
});
