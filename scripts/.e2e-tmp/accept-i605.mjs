import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.getByText("数据与素材").first().waitFor({ timeout: 20000 });
await page.getByText("数据与素材").first().click();
await page.waitForTimeout(1200);

// 展开新增学生（紧凑模式下默认折叠）
const expand = page.locator('[aria-label="展开新增学生"]');
if (await expand.count()) await expand.first().click();
await page.waitForTimeout(300);

await page.getByLabel("学生姓名").or(page.locator('input[placeholder="林舟"]')).first().fill("测试生");
await page.getByLabel("就读院校", { exact: true }).first().fill("苏州大学");
await page.waitForTimeout(500);
const cityValue = await page.getByLabel("城市", { exact: true }).first().inputValue().catch(() => null);
const provinceValue = await page.getByLabel("省份", { exact: true }).first().inputValue().catch(() => null);
console.log("自动带出 城市:", cityValue, "省份:", provinceValue);

await page.getByRole("button", { name: "新增学生" }).last().click();
await page.waitForTimeout(1200);

// 江苏省 chip 不应显示「已覆盖」
const chips = await page.evaluate(() => Array.from(document.querySelectorAll('[aria-label="省份分布"] .data-upload-workspace__province-chip')).map((chip) => chip.textContent?.replace(/\s+/g, " ").trim()));
console.log("chips:", JSON.stringify(chips));
const jiangsu = chips.find((text) => text?.includes("江苏省"));
console.log("江苏省 chip:", jiangsu, jiangsu && !jiangsu.includes("已覆盖") ? "PASS(无已覆盖)" : "FAIL");

// 数据质量应无省份覆盖告警
const health = await page.evaluate(() => document.body.textContent ?? "");
const overrideHits = (health.match(/使用省份覆盖/g) ?? []).length;
console.log("使用省份覆盖 提示次数:", overrideHits, overrideHits === 0 ? "PASS(0 覆盖告警)" : "FAIL");

// 名单确实新增
const hasStudent = health.includes("苏州大学");
console.log("名单包含苏州大学:", hasStudent ? "PASS" : "FAIL");

await page.screenshot({ path: "/tmp/i605-data.png" });
await browser.close();
