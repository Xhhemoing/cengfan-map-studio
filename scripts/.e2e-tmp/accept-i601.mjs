import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

// 1x1 红色 PNG
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
writeFileSync("/tmp/test-asset.png", png);

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.getByText("内容与排版").first().waitFor({ timeout: 20000 });
await page.getByText("内容与排版").first().click();
await page.waitForTimeout(1500);

const countAssets = () => page.evaluate(() => document.querySelectorAll("[data-asset-shell]").length);
const assetOrder = () => page.evaluate(() => Array.from(document.querySelectorAll("[data-asset-shell]")).map((el) => el.getAttribute("data-asset-shell")));

console.log("initial assets:", await countAssets());

await page.setInputFiles("#asset-global-upload", "/tmp/test-asset.png");
await page.waitForTimeout(1500);
const afterUpload = await countAssets();
console.log("after upload:", afterUpload, afterUpload === 1 ? "PASS(上画布)" : "FAIL");

const ids = await assetOrder();
await page.locator(`[data-asset-group="${ids[0]}"]`).click({ force: true });
await page.waitForTimeout(600);
const inspectorTitle = await page.evaluate(() => document.querySelector(".content-layout-workspace__context")?.textContent?.includes("素材属性"));
console.log("inspector shows 素材属性:", inspectorTitle ? "PASS" : "FAIL");

// 复制
await page.getByLabel("复制素材", { exact: true }).click();
await page.waitForTimeout(800);
const afterDup = await countAssets();
console.log("after duplicate:", afterDup, afterDup === 2 ? "PASS(复制)" : "FAIL");
const orderAfterDup = await assetOrder();
console.log("order:", JSON.stringify(orderAfterDup));

// 选中的是复制出来的实例，下移应使其排在原实例之前
await page.getByLabel("素材下移", { exact: true }).click();
await page.waitForTimeout(600);
const orderDown = await assetOrder();
console.log("after 下移:", JSON.stringify(orderDown), orderDown[0] !== orderAfterDup[0] ? "PASS(下移改变层级)" : "FAIL");

// 上移应恢复原顺序
await page.getByLabel("素材上移", { exact: true }).click();
await page.waitForTimeout(600);
const orderUp = await assetOrder();
console.log("after 上移:", JSON.stringify(orderUp), orderUp[0] === orderAfterDup[0] ? "PASS(上移改变层级)" : "FAIL");

// 删除
await page.getByLabel("删除素材", { exact: true }).click();
await page.waitForTimeout(800);
const afterDel = await countAssets();
console.log("after delete:", afterDel, afterDel === 1 ? "PASS(删除)" : "FAIL");

await page.screenshot({ path: "/tmp/i601-final.png" });
await browser.close();
