import { chromium } from "playwright-core";

function parseRgb(text) {
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(text ?? "");
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}
function luminance({ r, g, b }) {
  const chan = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}
const contrast = (fg, bg) => (Math.max(luminance(fg), luminance(bg)) + 0.05) / (Math.min(luminance(fg), luminance(bg)) + 0.05);

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.getByText("地图样式").first().waitFor({ timeout: 20000 });
await page.getByLabel("切换到暗色模式").first().click();
await page.waitForTimeout(300);
await page.getByText("地图样式").first().click();
await page.waitForTimeout(1500);

const entries = await page.evaluate(() => {
  const resolveBg = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const candidate = getComputedStyle(node).backgroundColor;
      if (candidate && !/rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(candidate) && candidate !== "transparent") return candidate;
      node = node.parentElement;
    }
    return "rgb(255, 255, 255)";
  };
  return Array.from(document.querySelectorAll(".property-panel__advanced summary, .property-panel__advanced-title, .asset-panel__advanced > summary, .workflow-save-template")).slice(0, 6).map((el) => ({
    selector: el.className || el.tagName,
    text: el.textContent?.trim().slice(0, 20),
    color: getComputedStyle(el).color,
    background: resolveBg(el),
  }));
});
for (const entry of entries) {
  const ratio = contrast(parseRgb(entry.color), parseRgb(entry.background));
  console.log(`${entry.selector} [${entry.text}] ${entry.color} on ${entry.background} 对比度 ${ratio.toFixed(2)}`, ratio >= 4.5 ? "PASS" : "FAIL");
}
if (entries.length === 0) console.log("地图样式阶段无折叠标题元素（略过）");
await page.screenshot({ path: "/tmp/i704b-dark.png" });
await browser.close();
