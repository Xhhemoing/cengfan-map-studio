import { chromium } from "playwright-core";

function parseRgb(text) {
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(text);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) };
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
await page.getByText("展示框样式").first().waitFor({ timeout: 20000 });

// 切换暗色
await page.getByLabel("切换到暗色模式").first().click();
await page.waitForTimeout(400);

await page.getByText("展示框样式").first().click();
await page.waitForTimeout(1500);

const readStyles = (selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const style = getComputedStyle(el);
  // 沿祖先链找第一个非透明背景
  let node = el;
  let bg = "rgba(0, 0, 0, 0)";
  while (node && node !== document.documentElement) {
    const candidate = getComputedStyle(node).backgroundColor;
    if (candidate && !/rgba?\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(candidate) && candidate !== "transparent") { bg = candidate; break; }
    node = node.parentElement;
  }
  return { color: style.color, background: bg };
}, selector);

const strong = await readStyles(".reference-card-style-workspace__preview-heading strong");
const span = await readStyles(".reference-card-style-workspace__preview-heading span");
console.log("标题 strong:", JSON.stringify(strong));
console.log("副标 span:", JSON.stringify(span));
for (const [label, styles] of [["标题", strong], ["副标", span]]) {
  const fg = parseRgb(styles.color);
  const bg = parseRgb(styles.background);
  const ratio = contrast(fg, bg);
  console.log(`${label}对比度: ${ratio.toFixed(2)}`, ratio >= 4.5 ? "PASS" : ratio >= 3 ? "MARGINAL" : "FAIL");
}

// 回归：暗色选中页签可读
const tab = await readStyles(".workflow-stage-stepper button.is-active");
if (tab) {
  const ratio = contrast(parseRgb(tab.color), parseRgb(tab.background));
  console.log("暗色选中页签:", JSON.stringify(tab), `对比度 ${ratio.toFixed(2)}`, ratio >= 3 ? "PASS" : "FAIL");
} else {
  const anyTab = await readStyles(".workflow-stepper button.is-active");
  if (anyTab) {
    const ratio = contrast(parseRgb(anyTab.color), parseRgb(anyTab.background));
    console.log("暗色选中页签(workflow-stepper):", JSON.stringify(anyTab), `对比度 ${ratio.toFixed(2)}`, ratio >= 3 ? "PASS" : "FAIL");
  } else {
    console.log("未找到选中页签元素");
  }
}

await page.screenshot({ path: "/tmp/i604-dark-frame.png" });
await browser.close();
