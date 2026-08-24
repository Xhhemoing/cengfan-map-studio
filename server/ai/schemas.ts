export type SourceType = "paste" | "csv" | "excel" | "ocr";

export interface ParseDataRequest {
  text: string;
  source: SourceType;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

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