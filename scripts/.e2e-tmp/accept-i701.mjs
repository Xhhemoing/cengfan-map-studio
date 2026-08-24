import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.getByText("示例：2026届毕业去向").first().click();
await page.getByText("数据与素材").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1200);
const projectId = await page.evaluate(() => window.location.hash.split("/").pop());
console.log("projectId:", projectId);

async function addStudent(name, university, city) {
  const expand = page.locator('[aria-label="展开新增学生"]');
  if (await expand.count()) await expand.first().click();
  await page.waitForTimeout(200);
  await page.locator('input[placeholder="林舟"]').first().fill(name);
  await page.getByLabel("就读院校", { exact: true }).first().fill(university);
  await page.getByLabel("城市", { exact: true }).first().fill(city);
  await page.getByRole("button", { name: "新增学生" }).last().click();
  await page.waitForTimeout(300);
}

const mirrorState = () => page.evaluate((id) => window.localStorage.getItem(`cengfan-map-studio:project-draft:${id}`) !== null, projectId);

// —— 场景 A：新增学生 → 等 5 秒（防抖自动保存）→ F5 → 仍在，且走的是持久化记录 ——
await addStudent("防抖学生甲", "南京大学", "南京市");
console.log("A: 新增后镜像存在(pending 尚未清):", await mirrorState());
await page.waitForTimeout(5000);
const mirrorAfterAutosave = await mirrorState();
console.log("A: 5 秒后镜像已被自动保存清除:", !mirrorAfterAutosave ? "PASS(已落盘 IndexedDB)" : "FAIL(仍有镜像)");
await page.reload({ waitUntil: "networkidle" });
await page.getByText("数据与素材").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
let body = await page.evaluate(() => document.body.textContent ?? "");
console.log("A: 刷新后学生仍在:", body.includes("防抖学生甲") ? "PASS" : "FAIL");
console.log("A: 未走草稿恢复路径:", !body.includes("恢复了刷新前未保存的修改") ? "PASS(读的是记录)" : "INFO(走了镜像)");

// —— 场景 B：新增学生 → 不等（<2s 防抖窗口内）→ F5 → 靠 pagehide 同步镜像恢复 ——
await addStudent("闪电学生乙", "四川大学", "成都市");
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByText("数据与素材").first().waitFor({ timeout: 20000 });
await page.getByText("恢复了刷新前未保存的修改").first().waitFor({ timeout: 10000 }).then(
  () => console.log("B: 出现草稿恢复提示: PASS"),
  () => console.log("B: 草稿恢复提示未出现: WARN(可能已自动保存)"),
);
await page.waitForTimeout(800);
body = await page.evaluate(() => document.body.textContent ?? "");
console.log("B: 刷新后闪电学生乙仍在:", body.includes("闪电学生乙") ? "PASS" : "FAIL");
console.log("B: 场景 A 学生也仍在:", body.includes("防抖学生甲") ? "PASS" : "FAIL");

// 恢复后的内容应再次被自动保存回记录（镜像清除）。
await page.waitForTimeout(5000);
console.log("B: 恢复内容已回写记录(镜像清除):", !(await mirrorState()) ? "PASS" : "FAIL");
await page.reload({ waitUntil: "networkidle" });
await page.getByText("数据与素材").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1500);
body = await page.evaluate(() => document.body.textContent ?? "");
console.log("B: 第二次刷新后两名学生均在:", body.includes("闪电学生乙") && body.includes("防抖学生甲") ? "PASS" : "FAIL");

await page.screenshot({ path: "/tmp/i701-final.png" });
await browser.close();
