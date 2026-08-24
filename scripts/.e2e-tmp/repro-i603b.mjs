import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.getByText("地图样式").first().waitFor({ timeout: 20000 });
await page.getByText("地图样式").first().click();
await page.waitForTimeout(2000);
// 地图编辑触发位置冻结
const target = page.locator("aside input[type=number]").first();
await target.fill("352");
await target.blur();
await page.waitForTimeout(1200);

await page.getByText("最终导出").first().click();
await page.waitForTimeout(2500);
const sections = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("section")).filter((s) => /排版问题/.test(s.getAttribute("aria-label") ?? "")).map((s) => ({
    label: s.getAttribute("aria-label"),
    items: Array.from(s.querySelectorAll("li, button")).map((el) => el.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean),
    text: s.textContent?.replace(/\s+/g, " ").slice(0, 1500),
  }));
});
console.log(JSON.stringify(sections, null, 1));
await page.screenshot({ path: "/tmp/i603b-export.png" });
await browser.close();
