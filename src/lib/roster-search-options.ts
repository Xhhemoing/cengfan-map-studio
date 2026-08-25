/**
 * 名单录入用的三个检索适配器:把 `search-catalog` 的原始命中翻译成下拉项。
 *
 * 结构与 `SearchComboboxOption` 相同,但这里不从组件层反向引入类型——
 * 名单工作台与名单阶段右栏都要用它们,放在 lib 里两边都能取。
 */
import { searchCities, searchProvinces, searchUniversities } from "./search-catalog";

export interface RosterSearchOption {
  value: string;
  label: string;
  detail?: string;
}

export function universityOptions(query: string): RosterSearchOption[] {
  return searchUniversities(query).map((university) => ({
    value: university.name,
    label: university.name,
    detail: university.city,
  }));
}

export function cityOptions(query: string): RosterSearchOption[] {
  return searchCities(query).map((city) => ({
    value: city.name,
    label: city.name,
    detail: city.province,
  }));
}

export function provinceOptions(query: string): RosterSearchOption[] {
  return searchProvinces(query).map((province) => ({ value: province, label: province }));
}
