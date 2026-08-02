import type { EditorCommand } from "./editor-commands";
import { createEditorCommand } from "./editor-commands";

export interface AiProposal {
  mode: "proposal" | "explain";
  explanation: string;
  commands: EditorCommand[];
  provider: string;
}

export interface ParseDataResult {
  provider: string;
  candidates: Array<{
    name: string;
    university: string;
    city: string;
    sourceLine: number;
    rawLine: string;
  }>;
  unparsed: Array<{ sourceLine: number; rawLine: string; reason: string }>;
}

function resolveEndpoint(path: string, endpoint?: string): string {
  if (endpoint) return endpoint;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export async function requestAiProposal(input: {
  message: string;
  studentCount: number;
  templateId: string;
  dataView: string;
  cardPreset?: string;
  endpoint?: string;
}): Promise<AiProposal> {
  const payload = {
    message: input.message,
    projectSummary: {
      studentCount: input.studentCount,
      templateId: input.templateId,
      dataView: input.dataView,
      cardPreset: input.cardPreset ?? "standard",
    },
  };

  const response = await fetch(
    resolveEndpoint("/api/ai/propose-edits", input.endpoint),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(`AI backend error: ${response.status}`);
  }

  const data = (await response.json()) as {
    mode: "proposal" | "explain";
    explanation: string;
    commands: Array<Omit<EditorCommand, "id"> & { id?: string }>;
    provider: string;
  };

  return {
    mode: data.mode,
    explanation: data.explanation,
    provider: data.provider,
    commands: data.commands.map((command) =>
      createEditorCommand({
        ...command,
        id: command.id,
      } as EditorCommand),
    ),
  };
}

export async function requestAiParseData(input: {
  text: string;
  source?: "paste" | "csv" | "excel" | "ocr";
  endpoint?: string;
}): Promise<ParseDataResult> {
  const response = await fetch(
    resolveEndpoint("/api/ai/parse-data", input.endpoint),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        source: input.source ?? "paste",
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`AI parse error: ${response.status}`);
  }
  return response.json();
}
