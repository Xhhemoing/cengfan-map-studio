import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /2地图样式|地图样式/ }).first().click();
await page.waitForTimeout(1000);

async function readBoxes() {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-destination-card]")).map((card) => {
      const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(card.getAttribute("transform") ?? "");
      const rect = card.querySelector("rect");
      return {
        key: card.getAttribute("data-destination-card"),
        x: Number(match?.[1]),
        y: Number(match?.[2]),
        width: Number(rect?.getAttribute("width")),
        height: Number(rect?.getAttribute("height")),
      };
    });
  });
}

function overlapPairs(boxes) {
  const pairs = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]; const b = boxes[j];
      const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0) pairs.push(`${a.key}@(${a.x},${a.y} ${a.width}x${a.height}) ~ ${b.key}@(${b.x},${b.y} ${b.width}x${b.height}) => ${ox.toFixed(1)}x${oy.toFixed(1)}`);
    }
  }
  return pairs;
}

for (const view of ["城市", "院校", "省份"]) {
  const control = page.locator(".map-style-workspace__data-views, [aria-label=地图表达]").last();
  await page.getByRole("radio", { name: view }).or(page.getByRole("button", { name: view })).or(control.getByText(view, { exact: true })).first().click().catch(async () => {
    await page.getByText(view, { exact: true }).first().click();
  });
  await page.waitForTimeout(2500);
  const boxes = await readBoxes();
  console.log(`--- ${view} (${boxes.length} cards)`);
  console.log(JSON.stringify(boxes));
  const pairs = overlapPairs(boxes);
  console.log(pairs.length ? `OVERLAPS:\n${pairs.join("\n")}` : "no overlaps");
  await page.screenshot({ path: `/tmp/i602-${view}.png`, fullPage: false });
}
await browser.close();
