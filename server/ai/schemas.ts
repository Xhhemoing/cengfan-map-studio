export type SourceType = "paste" | "csv" | "excel" | "ocr";

export interface ParseDataRequest {
  text: string;
  source: SourceType;
}

export interface ProposeEditsRequest {
  message: string;
  projectSummary: {
    studentCount: number;
    templateId: string;
    dataView: string;
    cardPreset: string;
  };
}

export interface EditorCommandPayload {
  id: string;
  type:
    | "setDataView"
    | "setTemplate"
    | "setCardPreset"
    | "setMapScale"
    | "setBackgroundColor"
    | "setVisibleFields"
    | "moveText";
  label: string;
  risk: "low" | "medium" | "high";
  before: unknown;
  after: unknown;
  targetId?: string;
  reason?: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

const COMMAND_TYPES = new Set([
  "setDataView",
  "setTemplate",
  "setCardPreset",
  "setMapScale",
  "setBackgroundColor",
  "setVisibleFields",
  "moveText",
]);

export function parseDataRequestSchema(input: unknown): ValidationResult<ParseDataRequest> {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "请求体必须是对象" };
  }
  const body = input as Record<string, unknown>;
  if (typeof body.text !== "string" || !body.text.trim()) {
    return { ok: false, error: "text 不能为空" };
  }
  if (!["paste", "csv", "excel", "ocr"].includes(String(body.source))) {
    return { ok: false, error: "source 无效" };
  }
  return {
    ok: true,
    value: {
      text: body.text,
      source: body.source as SourceType,
    },
  };
}

export function proposeEditsRequestSchema(
  input: unknown,
): ValidationResult<ProposeEditsRequest> {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "请求体必须是对象" };
  }
  const body = input as Record<string, unknown>;
  if (typeof body.message !== "string" || !body.message.trim()) {
    return { ok: false, error: "message 不能为空" };
  }
  const summary = body.projectSummary;
  if (!summary || typeof summary !== "object") {
    return { ok: false, error: "projectSummary 不能为空" };
  }
  const projectSummary = summary as Record<string, unknown>;
  if (typeof projectSummary.studentCount !== "number") {
    return { ok: false, error: "studentCount 必须是数字" };
  }
  return {
    ok: true,
    value: {
      message: body.message,
      projectSummary: {
        studentCount: projectSummary.studentCount,
        templateId: String(projectSummary.templateId ?? "original"),
        dataView: String(projectSummary.dataView ?? "province"),
        cardPreset: String(projectSummary.cardPreset ?? "standard"),
      },
    },
  };
}

export function validateEditorCommandPayload(
  input: unknown,
): ValidationResult<EditorCommandPayload> {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "command 必须是对象" };
  }
  const command = input as Record<string, unknown>;
  if (typeof command.id !== "string" || !command.id) {
    return { ok: false, error: "command.id 无效" };
  }
  if (!COMMAND_TYPES.has(String(command.type))) {
    return { ok: false, error: `不支持的命令类型: ${String(command.type)}` };
  }
  if (typeof command.label !== "string" || !command.label) {
    return { ok: false, error: "command.label 无效" };
  }
  if (!["low", "medium", "high"].includes(String(command.risk))) {
    return { ok: false, error: "command.risk 无效" };
  }
  return {
    ok: true,
    value: command as unknown as EditorCommandPayload,
  };
}
