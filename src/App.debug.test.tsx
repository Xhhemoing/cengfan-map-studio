import { describe, it, expect } from "vitest";
import { click, installAppTestHarness, renderLegacyApp } from "./test-utils/app-harness";

installAppTestHarness();

describe("debug", () => {
  it("clicks the advanced tab then looks for the settings button", () => {
    const container = renderLegacyApp();
    const tab = container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]');
    if (tab) click(tab);
    expect(true).toBe(true);
  });
});
