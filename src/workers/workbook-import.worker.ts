import * as XLSX from "xlsx";
import {
  decodeCsvBytes,
  parseExcelWorkbook,
  type CsvEncoding,
  type ExcelWorkbookImportResult,
} from "../lib/binary-import";

export interface WorkbookImportRequest {
  type: "parse-workbook";
  requestId: number;
  buffer: ArrayBuffer;
  isCsv: boolean;
}

export type WorkbookImportResponse =
  | {
      type: "result";
      requestId: number;
      parsed: ExcelWorkbookImportResult | null;
      encoding: CsvEncoding | null;
    }
  | {
      type: "error";
      requestId: number;
      message: string;
    };

export function parseWorkbookImport(
  request: Pick<WorkbookImportRequest, "buffer" | "isCsv">,
): Pick<Extract<WorkbookImportResponse, { type: "result" }>, "parsed" | "encoding"> {
  const decoded = request.isCsv ? decodeCsvBytes(request.buffer) : null;
  const workbook = decoded
    ? XLSX.read(decoded.text, { type: "string" })
    : XLSX.read(request.buffer, { type: "array" });
  const sheets = workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    return [{
      name,
      rows: rows.map((row) =>
        (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim()),
      ),
    }];
  });
  return {
    parsed: parseExcelWorkbook(sheets),
    encoding: decoded?.encoding ?? null,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "工作簿后台解析失败";
}

const workerScope = globalThis as unknown as {
  document?: unknown;
  onmessage: ((event: MessageEvent<WorkbookImportRequest>) => void) | null;
  postMessage: (message: WorkbookImportResponse) => void;
};

// Importing the pure parser in jsdom tests must not install a handler on Window.
if (typeof workerScope.document === "undefined" && typeof workerScope.postMessage === "function") {
  workerScope.onmessage = (event) => {
    const request = event.data;
    if (request.type !== "parse-workbook") return;
    try {
      workerScope.postMessage({
        type: "result",
        requestId: request.requestId,
        ...parseWorkbookImport(request),
      });
    } catch (error) {
      workerScope.postMessage({
        type: "error",
        requestId: request.requestId,
        message: errorMessage(error),
      });
    }
  };
}
