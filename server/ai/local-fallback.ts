import { parseStudentText } from "../../src/lib/import-data";
import type { ParseDataRequest } from "./schemas";

export function localParseData(request: ParseDataRequest) {
  const parsed = parseStudentText(request.text);
  return {
    provider: "local-fallback",
    source: request.source,
    candidates: parsed.candidates,
    unparsed: parsed.unparsed,
  };
}
