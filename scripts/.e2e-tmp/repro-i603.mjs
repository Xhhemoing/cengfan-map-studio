import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.getByText("最终导出").first().waitFor({ timeout: 20000 });
await page.getByText("最终导出").first().click();
await page.waitForTimeout(3000);
await page.screenshot({ path: "/tmp/i603-export.png", fullPage: false });
const sections = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("section")).filter((s) => /排版问题|数据告警|资源缺失|导出检查/.test(s.getAttribute("aria-label") ?? s.textContent ?? "")).slice(0, 8).map((s) => ({
    label: s.getAttribute("aria-label"),
    text: s.textContent?.replace(/\s+/g, " ").slice(0, 800),
  }));
});
console.log(JSON.stringify(sections, null, 1));
await browser.close();
