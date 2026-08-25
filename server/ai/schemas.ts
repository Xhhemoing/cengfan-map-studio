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

export interface ExplainRequest {
  message: string;
  studentCount: number;
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

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

export function parseDataRequestSchema(input: unknown): ValidationResult<ParseDataRequest> {
  if (!isRecord(input)) {
    return { ok: false, error: "请求体必须是对象" };
  }
  const body = input;
  if (typeof body.text !== "string" || !body.text.trim()) {
    return { ok: false, error: "text 不能为空" };
  }
  if (typeof body.source !== "string" || !["paste", "csv", "excel", "ocr"].includes(body.source)) {
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
  if (!isRecord(input)) {
    return { ok: false, error: "请求体必须是对象" };
  }
  const body = input;
  if (typeof body.message !== "string" || !body.message.trim()) {
    return { ok: false, error: "message 不能为空" };
  }
  const summary = body.projectSummary;
  if (!isRecord(summary)) {
    return { ok: false, error: "projectSummary 不能为空" };
  }
  const projectSummary = summary;
  if (!Number.isSafeInteger(projectSummary.studentCount) || Number(projectSummary.studentCount) < 0) {
    return { ok: false, error: "studentCount 必须是非负整数" };
  }
  for (const key of ["templateId", "dataView", "cardPreset"] as const) {
    if (projectSummary[key] !== undefined && (typeof projectSummary[key] !== "string" || !projectSummary[key].trim())) {
      return { ok: false, error: `${key} 必须是非空字符串` };
    }
  }
  return {
    ok: true,
    value: {
      message: body.message,
      projectSummary: {
        studentCount: projectSummary.studentCount as number,
        templateId: (projectSummary.templateId as string | undefined) ?? "original",
        dataView: (projectSummary.dataView as string | undefined) ?? "province",
        cardPreset: (projectSummary.cardPreset as string | undefined) ?? "standard",
      },
    },
  };
}

export function explainRequestSchema(input: unknown): ValidationResult<ExplainRequest> {
  if (!isRecord(input)) return { ok: false, error: "请求体必须是对象" };
  if (typeof input.message !== "string" || !input.message.trim()) {
    return { ok: false, error: "message 不能为空" };
  }
  if (input.studentCount !== undefined
    && (!Number.isSafeInteger(input.studentCount) || Number(input.studentCount) < 0)) {
    return { ok: false, error: "studentCount 必须是非负整数" };
  }
  return {
    ok: true,
    value: {
      message: input.message,
      studentCount: (input.studentCount as number | undefined) ?? 0,
    },
  };
}

export function validateEditorCommandPayload(
  input: unknown,
): ValidationResult<EditorCommandPayload> {
  if (!isRecord(input)) {
    return { ok: false, error: "command 必须是对象" };
  }
  const command = input;
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
