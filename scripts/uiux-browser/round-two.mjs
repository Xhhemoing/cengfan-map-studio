import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function selectStage(page, label, id) {
  await page.getByRole("navigation", { name: "制作步骤", exact: true })
    .getByRole("button", { name: new RegExp(`^${label}(?:，|$)`) }).click();
  await page.locator(`.studio-editor-shell[data-stage="${id}"]`).waitFor();
}

async function openSample(page) {
  const sample = page.locator(".workbench-card-main").first();
  const name = (await sample.getAttribute("aria-label")).replace(/^打开项目 /, "");
  await sample.click();
  await page.locator('.studio-editor-shell[data-stage="data"]').waitFor();
  return { name, hash: new URL(page.url()).hash };
}

async function returnToWorkbench(page, { openTools }) {
  await openTools(page);
  await page.getByRole("button", { name: "返回项目列表", exact: true }).click();
  await page.locator(".workbench-shell").waitFor();
  assert.equal(new URL(page.url()).hash, "#/");
}

async function svgDownload(page, trigger, output, filename) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10_000 }),
    trigger.click(),
  ]);
  assert.match(download.suggestedFilename(), /\.svg$/i, "SVG action and retry must download SVG");
  assert.equal(await download.failure(), null);
  const path = resolve(output, filename);
  await download.saveAs(path);
  assert.match(await readFile(path, "utf8"), /<svg\b/, "Downloaded file must contain an SVG document");
  return filename;
}

/** Each project restores its own stage; empty projects offer a useful next step. */
export async function checkProjectSessions(page, helpers) {
  const sample = await openSample(page);
  await selectStage(page, "交付", "export");
  await returnToWorkbench(page, helpers);
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page.locator('.studio-editor-shell[data-stage="data"]').waitFor();
  const newProjectHash = new URL(page.url()).hash;
  assert.notEqual(newProjectHash, sample.hash);
  await selectStage(page, "交付", "export");
  const emptyNotice = page.locator('.delivery-workspace__roster-notice[data-roster-state="empty"]');
  await emptyNotice.waitFor();
  assert.match(await emptyNotice.innerText(), /空白模板/);
  assert.equal(await page.locator(".delivery-workspace__all-clear").count(), 0, "Empty rosters must not claim all checks passed");
  await emptyNotice.getByRole("button", { name: "完善名单", exact: true }).click();
  await page.locator('.studio-editor-shell[data-stage="data"]').waitFor();
  await selectStage(page, "地图", "map");
  await returnToWorkbench(page, helpers);
  await page.getByRole("button", { name: `打开项目 ${sample.name}`, exact: true }).click();
  await page.locator('.studio-editor-shell[data-stage="export"]').waitFor();
  assert.equal(new URL(page.url()).hash, sample.hash);
  await returnToWorkbench(page, helpers);
  await page.getByRole("button", { name: "打开项目 未命名项目", exact: true }).click();
  await page.locator('.studio-editor-shell[data-stage="map"]').waitFor();
  assert.equal(new URL(page.url()).hash, newProjectHash);
  return { aStage: "export", bStage: "map", emptyTemplateGuidance: true };
}

/** Saved identity is visible, and export feedback describes the actual snapshot. */
export async function checkSavedExport(page, helpers) {
  const sample = await openSample(page);
  const identity = page.locator(".project-save-indicator");
  await identity.getByLabel(`当前项目：${sample.name}`, { exact: true }).waitFor();
  await page.locator('.project-save-indicator[data-save-status="saved"]').waitFor();
  assert.match(await identity.getByRole("status").innerText(), /^已保存/);
  const save = page.getByRole("button", { name: "保存当前项目", exact: true });
  assert.equal(await save.isVisible(), true, "Save must be available outside the tools disclosure");
  await save.click();
  await page.locator(".editor-status-strip").getByText(/强制保存完成/).waitFor();
  await selectStage(page, "交付", "export");
  const first = await svgDownload(page, page.getByRole("button", { name: "导出 SVG", exact: true }), helpers.output, "round-two-original.svg");
  await page.locator('.delivery-workspace__result[data-export-stale="false"]').waitFor();
  await selectStage(page, "名单", "data");
  await page.getByRole("button", { name: "隐藏 林舟", exact: true }).click();
  await page.locator('.project-save-indicator[data-save-status="pending"]').waitFor();
  await selectStage(page, "交付", "export");
  const stale = page.locator('.delivery-workspace__result[data-export-stale="true"]');
  await stale.waitFor();
  assert.match(await stale.innerText(), /当前版本有修改，请重新导出/);
  const screenshot = await helpers.capture(page, "round-two-stale-export");
  const retry = await svgDownload(page, page.getByRole("button", { name: "再次导出", exact: true }), helpers.output, "round-two-updated.svg");
  await page.locator('.delivery-workspace__result[data-export-stale="false"]').waitFor();
  assert.equal(await page.getByText("当前版本有修改，请重新导出", { exact: true }).count(), 0);
  return { currentIdentity: true, directSave: true, staleClearedAfterSvgRetry: true, downloads: [first, retry], screenshots: [screenshot] };
}

/** Failed project writes keep the editor open; a subsequent retry can succeed. */
export async function checkSaveFailureRecovery(page, helpers) {
  const sample = await openSample(page);
  await page.getByRole("button", { name: "隐藏 林舟", exact: true }).click();
  await page.evaluate(() => {
    window.__uiuxOriginalProjectPut = IDBObjectStore.prototype.put;
    window.__uiuxQuotaAttempts = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "projects") {
        window.__uiuxQuotaAttempts += 1;
        throw new DOMException("Browser acceptance injected quota failure", "QuotaExceededError");
      }
      return window.__uiuxOriginalProjectPut.apply(this, args);
    };
  });
  let attempts;
  let screenshot;
  try {
    await helpers.openTools(page);
    await page.getByRole("button", { name: "返回项目列表", exact: true }).click();
    await page.locator('.project-save-indicator[data-save-status="failed"]').waitFor();
    await page.locator(".editor-status-strip").getByText(/当前编辑器已保留/).waitFor();
    assert.equal(new URL(page.url()).hash, sample.hash);
    assert.equal(await page.locator(".workbench-shell").count(), 0);
    assert.equal(await page.getByRole("button", { name: "重试保存当前项目", exact: true }).isVisible(), true);
    screenshot = await helpers.capture(page, "round-two-save-rejected");
    const firstAttempts = await page.evaluate(() => window.__uiuxQuotaAttempts);
    assert.ok(firstAttempts >= 1);
    // Retry returning while still blocked: the navigation guard must release.
    await helpers.openTools(page);
    await page.getByRole("button", { name: "返回项目列表", exact: true }).click();
    await page.waitForFunction((previous) => window.__uiuxQuotaAttempts > previous, firstAttempts);
    await page.locator('.project-save-indicator[data-save-status="failed"]').waitFor();
    assert.equal(new URL(page.url()).hash, sample.hash);
    attempts = await page.evaluate(() => window.__uiuxQuotaAttempts);
  } finally {
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = window.__uiuxOriginalProjectPut;
      delete window.__uiuxOriginalProjectPut;
    });
  }
  await page.getByRole("button", { name: "重试保存当前项目", exact: true }).click();
  await page.locator('.project-save-indicator[data-save-status="saved"]').waitFor();
  assert.equal(new URL(page.url()).hash, sample.hash, "Saving should not unexpectedly navigate");
  await returnToWorkbench(page, helpers);
  return { injectedFault: "projects-only QuotaExceededError", blockedAttempts: attempts, retrySaved: true, returnedAfterSave: true, screenshots: [screenshot] };
}
