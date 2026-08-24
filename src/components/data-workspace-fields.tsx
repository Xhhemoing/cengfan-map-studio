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

export const studentColumnLabels: Record<StudentColumn, string> = {
  name: "学生姓名",
  university: "录取院校",
  city: "城市",
  province: "省份",
  locationScope: "去向类型",
};
