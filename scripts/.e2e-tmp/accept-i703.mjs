import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.getByText("内容与排版").first().waitFor({ timeout: 20000 });
await page.getByText("内容与排版").first().click();
await page.waitForTimeout(1500);

const currentObject = () => page.evaluate(() =>
  document.querySelector('section[aria-label="当前对象属性"] .content-layout-workspace__section-heading small')?.textContent ?? "");

// 先选中一个省份（模拟真实点击省份路径）。
await page.evaluate(() => {
  const path = document.querySelector("svg.poster [data-map-layer] path");
  path?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(500);
const afterProvince = await currentObject();
console.log("先选省份，当前对象:", JSON.stringify(afterProvince), afterProvince && afterProvince !== "画布" ? "PASS(非画布)" : "FAIL");

// 再真实鼠标点击画布空白（背景 rect 覆盖区域，取画布右下角空白像素）。
const svgBox = await page.locator("svg.poster").first().boundingBox();
let clicked = false;
for (const [fx, fy] of [[0.97, 0.5], [0.03, 0.97], [0.97, 0.03], [0.5, 0.97]]) {
  await page.mouse.click(svgBox.x + svgBox.width * fx, svgBox.y + svgBox.height * fy);
  await page.waitForTimeout(400);
  if ((await currentObject()) === "画布") { clicked = true; console.log(`空白点击命中于 (${fx}, ${fy})`); break; }
}
console.log("点空白后当前对象:", JSON.stringify(await currentObject()), clicked ? "PASS(画布)" : "FAIL");

// 选中画布后，右栏应能看到画布尺寸/背景等设置。
const inspectorText = await page.evaluate(() =>
  document.querySelector(".content-layout-workspace__context")?.textContent ?? "");
console.log("画布检查器包含尺寸/背景设置:", /尺寸|宽|背景|安全边距/.test(inspectorText) ? "PASS" : `FAIL(${inspectorText.slice(0, 120)})`);

// 回归：点空白之后再点省份，仍能选中省份（画布不抢占后续选择）。
await page.evaluate(() => {
  const path = document.querySelector("svg.poster [data-map-layer] path");
  path?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(400);
const backToProvince = await currentObject();
console.log("再点省份，当前对象:", JSON.stringify(backToProvince), backToProvince !== "画布" ? "PASS" : "FAIL");

await page.screenshot({ path: "/tmp/i703-final.png" });
await browser.close();
