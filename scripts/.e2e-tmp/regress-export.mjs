import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByLabel("新建项目").first().click();
await page.getByText("最终导出").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);

// 编辑器画布应显示嘉宾引导占位（空嘉宾 + 面板可见）：需要先到渲染海报画布的阶段
await page.getByText("内容与排版").first().click();
await page.waitForTimeout(1500);
const editorPlaceholder = await page.evaluate(() => document.querySelectorAll("[data-editor-placeholder]").length);
console.log("编辑器占位元素:", editorPlaceholder, editorPlaceholder > 0 ? "(编辑态可见，前置条件成立)" : "(前置条件不成立)");

await page.getByText("最终导出").first().click();
await page.waitForTimeout(1500);

const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByLabel("导出 SVG").click(),
]);
const path = await download.path();
const svg = readFileSync(path, "utf8");
const hasAttr = svg.includes("data-editor-placeholder");
const hasCopy = svg.includes("在右侧添加老师");
console.log("导出 SVG 含 data-editor-placeholder:", hasAttr, hasAttr ? "FAIL" : "PASS");
console.log("导出 SVG 含嘉宾占位文案:", hasCopy, hasCopy ? "FAIL" : "PASS");
await browser.close();
