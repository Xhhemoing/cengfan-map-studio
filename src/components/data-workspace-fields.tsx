import { searchCities, searchProvinces, searchUniversities } from "../lib/search-catalog";
import type { StudentColumn } from "../lib/binary-import";
import type { SearchComboboxOption } from "./SearchCombobox";

export function universityOptions(query: string): SearchComboboxOption[] {
  return searchUniversities(query).map((university) => ({
    value: university.name,
    label: university.name,
    detail: university.city,
  }));
}

export function cityOptions(query: string): SearchComboboxOption[] {
  return searchCities(query).map((city) => ({
    value: city.name,
    label: city.name,
    detail: city.province,
  }));
}

export function provinceOptions(query: string): SearchComboboxOption[] {
  return searchProvinces(query).map((province) => ({
    value: province,
    label: province,
  }));
}

/** Roster uploads are spreadsheets only; this app never reads images. */
export const ROSTER_FILE_ACCEPT = ".xlsx,.xls,.csv,text/csv";

/**
 * Brings a roster row into view and moves focus onto it. The row lives in the
 * student table while 定位 actions come from sibling panels, so the shared
 * contract is the `data-student-row` attribute rather than a routing layer.
 * Returns false when the row is not rendered (filtered out, or from another
 * dataset) so callers can tell the user instead of silently doing nothing.
 */
export function focusStudentRow(id: string, root: ParentNode = document): boolean {
  const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-student-row]"));
  const row = rows.find((item) => item.dataset.studentRow === id);
  if (!row) return false;
  if (typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "center" });
  if (typeof row.focus === "function") row.focus({ preventScroll: true });
  return true;
}

export const studentColumnLabels: Record<StudentColumn, string> = {
  name: "学生姓名",
  university: "录取院校",
  city: "城市",
  province: "省份",
  locationScope: "去向类型",
};
