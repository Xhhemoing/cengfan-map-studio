import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.getByText("数据与素材").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1200);

const expand = page.locator('[aria-label="展开新增学生"]');
if (await expand.count()) await expand.first().click();
await page.waitForTimeout(200);

// 只填姓名，点新增。
await page.locator('input[placeholder="林舟"]').first().fill("只填姓名同学");
await page.getByRole("button", { name: "新增学生" }).last().click();
await page.waitForTimeout(400);

const error = page.locator(".draft-form .draft-form__error");
const count = await error.count();
console.log("表单内错误提示存在:", count > 0 ? "PASS" : "FAIL");
if (count > 0) {
  const text = await error.first().textContent();
  console.log("错误文案:", JSON.stringify(text), text?.includes("不能为空") ? "PASS" : "FAIL");
  console.log("role=alert:", (await error.first().getAttribute("role")) === "alert" ? "PASS" : "FAIL");
  const visible = await error.first().isVisible();
  console.log("错误提示可见:", visible ? "PASS" : "FAIL");
  // 与新增按钮的距离：就近提示应在同一表单内、几百像素内。
  const errBox = await error.first().boundingBox();
  const btnBox = await page.getByRole("button", { name: "新增学生" }).last().boundingBox();
  if (errBox && btnBox) {
    const distance = Math.abs(errBox.y - btnBox.y);
    console.log(`与新增按钮垂直距离: ${distance.toFixed(0)}px`, distance < 200 ? "PASS(就近)" : "FAIL");
  }
}

// 补全后成功新增，错误消失。
await page.getByLabel("就读院校", { exact: true }).first().fill("同济大学");
await page.getByLabel("城市", { exact: true }).first().fill("上海市");
await page.getByRole("button", { name: "新增学生" }).last().click();
await page.waitForTimeout(400);
console.log("成功后错误消失:", (await page.locator(".draft-form__error").count()) === 0 ? "PASS" : "FAIL");

await page.screenshot({ path: "/tmp/i702-final.png" });
await browser.close();
