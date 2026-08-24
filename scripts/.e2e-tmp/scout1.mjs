import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/scout1.png" });
const buttons = await page.evaluate(() => Array.from(document.querySelectorAll("button, a")).slice(0, 60).map((el) => el.textContent?.trim().slice(0, 40)).filter(Boolean));
console.log(JSON.stringify(buttons, null, 1));
console.log("title:", await page.title());
await browser.close();
