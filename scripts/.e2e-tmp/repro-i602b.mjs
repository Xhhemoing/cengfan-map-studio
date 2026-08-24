import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.getByText("地图样式").first().waitFor({ timeout: 20000 });
await page.getByText("地图样式").first().click();
await page.waitForTimeout(2500);

async function readBoxes() {
  return page.evaluate(() => Array.from(document.querySelectorAll("[data-destination-card]")).map((card) => {
    const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(card.getAttribute("transform") ?? "");
    const rect = card.querySelector("rect");
    return { key: card.getAttribute("data-destination-card"), x: Number(match?.[1]), y: Number(match?.[2]), width: Number(rect?.getAttribute("width")), height: Number(rect?.getAttribute("height")) };
  }));
}
function overlapPairs(boxes) {
  const pairs = [];
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
    const a = boxes[i]; const b = boxes[j];
    const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (ox > 0 && oy > 0) pairs.push(`${a.key}@(${Math.round(a.x)},${Math.round(a.y)}) ~ ${b.key}@(${Math.round(b.x)},${Math.round(b.y)}) => ${ox.toFixed(0)}x${oy.toFixed(0)}`);
  }
  return pairs;
}

// 在省份模式下做一次地图编辑，触发 freezeCardPositionsForMapChange。
// 地图属性 X 输入框：改 350 -> 352。
const xInput = page.locator('input').filter({ hasNot: page.locator('nothing') }).nth(0);
// 更可靠：通过 label 找。先 dump 输入框。
const inputs = await page.evaluate(() => Array.from(document.querySelectorAll(".map-style-workspace__context input, aside input")).map((el, i) => ({ i, type: el.type, value: el.value, label: el.closest("label")?.textContent?.trim().slice(0, 12) ?? el.getAttribute("aria-label") ?? "" })));
console.log("inputs:", JSON.stringify(inputs.slice(0, 12)));

const target = page.locator("aside input[type=number]").first();
await target.fill("352");
await target.blur();
await page.waitForTimeout(1500);

console.log("--- after map patch (province mode)");
let boxes = await readBoxes();
console.log(JSON.stringify(boxes));

// 切到城市模式
await page.getByText("城市", { exact: true }).first().click();
await page.waitForTimeout(3000);
boxes = await readBoxes();
console.log("--- city mode after freeze");
console.log(JSON.stringify(boxes));
const pairs = overlapPairs(boxes);
console.log(pairs.length ? `OVERLAPS:\n${pairs.join("\n")}` : "no overlaps");
await page.screenshot({ path: "/tmp/i602b-city.png" });

// 再切院校
await page.getByText("院校", { exact: true }).first().click();
await page.waitForTimeout(3000);
boxes = await readBoxes();
console.log("--- university mode after freeze");
const pairs2 = overlapPairs(boxes);
console.log(pairs2.length ? `OVERLAPS:\n${pairs2.join("\n")}` : "no overlaps");
await page.screenshot({ path: "/tmp/i602b-univ.png" });
await browser.close();
