import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/scout2.png" });
const info = await page.evaluate(() => {
  const texts = Array.from(document.querySelectorAll("button")).map((el) => el.textContent?.trim().slice(0, 30)).filter(Boolean);
  const stageButtons = Array.from(document.querySelectorAll("[role=tab], [data-stage], nav button")).map((el) => el.textContent?.trim().slice(0, 20));
  return { texts: texts.slice(0, 80), stageButtons: stageButtons.slice(0, 30) };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
