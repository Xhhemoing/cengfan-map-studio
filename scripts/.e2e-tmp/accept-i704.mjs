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
function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.getByText("内容与排版").first().waitFor({ timeout: 20000 });

await page.getByLabel("切换到暗色模式").first().click();
await page.waitForTimeout(400);
await page.getByText("内容与排版").first().click();
await page.waitForTimeout(1500);

const readStyles = (selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const style = getComputedStyle(el);
  let node = el;
  let bg = "rgba(0, 0, 0, 0)";
  while (node && node !== document.documentElement) {
    const candidate = getComputedStyle(node).backgroundColor;
    if (candidate && !/rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(candidate) && candidate !== "transparent") { bg = candidate; break; }
    node = node.parentElement;
  }
  return { color: style.color, background: bg, text: el.textContent?.slice(0, 30) };
}, selector);

async function checkContrast(label, selector) {
  const styles = await readStyles(selector);
  if (!styles) { console.log(`${label}: 元素不存在(${selector})`); return; }
  const fg = parseRgb(styles.color);
  const bg = parseRgb(styles.background);
  const ratio = contrast(fg, bg);
  console.log(`${label} [${styles.text?.trim()}] ${styles.color} on ${styles.background} 对比度 ${ratio.toFixed(2)}`, ratio >= 4.5 ? "PASS" : ratio >= 3 ? "MARGINAL" : "FAIL");
}

// 「字体排版」折叠标题（右栏 InspectorPanel 常驻折叠区）。
await checkContrast("字体排版 summary", ".inspector-global-typography summary");
// 属性面板高级折叠标题。
await checkContrast("高级设置 summary", ".property-panel__advanced summary");

// 素材面板「查找 / 省份」label：打开素材与实例上下文（内容阶段右栏）。
const assetTab = page.getByRole("tab", { name: /素材/ });
if (await assetTab.count()) { await assetTab.first().click(); await page.waitForTimeout(600); }
await checkContrast("素材查找 label", ".asset-province-picker label");
await checkContrast("素材面板顶层 label", ".asset-panel > label");
await checkContrast("素材区块 label", ".asset-section label");

await page.screenshot({ path: "/tmp/i704-dark.png" });
await browser.close();
