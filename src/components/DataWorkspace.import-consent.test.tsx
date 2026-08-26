// 导入侧的出境闸门接线：粘贴原文在拿到明确同意之前不得交给第三方模型。
// 「同意并发送」之后的识别结果由 DataWorkspace.import-recognition.test.tsx 负责，
// 这里只钉住未同意时的那半条路。共享装置见 src/components/data-workspace-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import type { ParseDataResult } from "../lib/ai-client";
import {
  installDataWorkspaceTestHarness,
  click,
  changeInput,
  consentDialog,
  declineAiUpload,
  renderWorkspace,
  settle,
} from "./data-workspace-test-harness";

installDataWorkspaceTestHarness();

/** 同意之前调用即为出境事故，直接让用例失败而不是悄悄返回空结果。 */
function forbiddenAiParse() {
  return vi.fn(async (): Promise<ParseDataResult> => {
    throw new Error("未取得同意就把粘贴原文送了出去");
  });
}

function clickAiRecognize(container: HTMLDivElement): void {
  click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
}

function clickOneClickImport(container: HTMLDivElement): void {
  click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("一键识别并导入"))!);
}

describe("DataWorkspace import consent", () => {
  it("asks before the AI recognition sends anything", () => {
    const requestAiParse = forbiddenAiParse();
    const container = renderWorkspace({ requestAiParse });

    changeInput(container.querySelector("textarea")!, "苏禾 浙江大学 杭州");
    clickAiRecognize(container);

    expect(consentDialog(container)).not.toBeNull();
    expect(requestAiParse).not.toHaveBeenCalled();
    declineAiUpload(container);
  });

  it("asks before one-click import sends anything", () => {
    const requestAiParse = forbiddenAiParse();
    const container = renderWorkspace({ requestAiParse });

    changeInput(container.querySelector("textarea")!, "苏禾 浙江大学 杭州");
    clickOneClickImport(container);

    expect(consentDialog(container)).not.toBeNull();
    expect(requestAiParse).not.toHaveBeenCalled();
    declineAiUpload(container);
  });

  it("keeps the pasted text on this machine when 仅用本地识别 wins", async () => {
    const requestAiParse = forbiddenAiParse();
    const container = renderWorkspace({ requestAiParse });

    changeInput(container.querySelector("textarea")!, "苏禾 浙江大学 杭州");
    clickAiRecognize(container);
    declineAiUpload(container);
    await settle();

    expect(requestAiParse).not.toHaveBeenCalled();
    expect(consentDialog(container)).toBeNull();
    expect(container.textContent).toContain("从本地文本识别识别到 1 条候选");
    expect(container.textContent).toContain("未同意发送原文");
    expect(container.querySelector(".import-review")?.textContent).toContain("苏禾");
  });

  it("still lands a one-click import from local parsing alone", async () => {
    const onAppendStudents = vi.fn();
    const requestAiParse = forbiddenAiParse();
    const container = renderWorkspace({ onAppendStudents, requestAiParse });

    changeInput(container.querySelector("textarea")!, "本地同学 浙江大学 杭州");
    clickOneClickImport(container);
    declineAiUpload(container);
    await settle();

    expect(requestAiParse).not.toHaveBeenCalled();
    expect(onAppendStudents).toHaveBeenCalledWith([expect.objectContaining({ name: "本地同学", city: "杭州市" })]);
    expect(container.textContent).toContain("已从本地文本识别导入 1 条学生记录");
    expect(container.textContent).toContain("未同意发送原文");
  });

  it("empty text is refused before the question is even asked", () => {
    const requestAiParse = forbiddenAiParse();
    const container = renderWorkspace({ requestAiParse });

    clickAiRecognize(container);
    expect(consentDialog(container)).toBeNull();
    expect(container.textContent).toContain("请先粘贴需要智能识别的名单");

    clickOneClickImport(container);
    expect(consentDialog(container)).toBeNull();
    expect(container.textContent).toContain("请先粘贴名单");
    expect(requestAiParse).not.toHaveBeenCalled();
  });

  it("stops asking once the refusal is remembered, and offers a way back", async () => {
    const requestAiParse = forbiddenAiParse();
    const container = renderWorkspace({ requestAiParse });

    changeInput(container.querySelector("textarea")!, "苏禾 浙江大学 杭州");
    clickAiRecognize(container);
    declineAiUpload(container, true);
    await settle();
    expect(container.querySelector(".ai-consent__memo")).not.toBeNull();

    clickAiRecognize(container);
    await settle();
    expect(consentDialog(container)).toBeNull();
    expect(requestAiParse).not.toHaveBeenCalled();
    expect(container.textContent).toContain("未同意发送原文");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="重新询问是否发送原文"]')!);
    expect(container.querySelector(".ai-consent__memo")).toBeNull();
    clickAiRecognize(container);

    expect(consentDialog(container)).not.toBeNull();
    declineAiUpload(container);
  });
});
