import type { Student } from "./project-data";
import { parseLocationScopeValue } from "./import-data";
import { resolveCity } from "./search-catalog";
import { asRecord, asString, type UnknownRecord } from "./project-migration-helpers";

const STUDENT_TEXT_KEYS = ["name", "university", "school", "city"] as const;

/**
 * A record is a student as soon as one recognizable text column survived. Older and
 * unknown payload versions often carry partial rows; dropping them would silently
 * delete people from the roster instead of surfacing them as incomplete data.
 */
function looksLikeStudent(record: UnknownRecord): boolean {
  return STUDENT_TEXT_KEYS.some((key) => typeof record[key] === "string");
}

function uniqueStudentId(requested: string, usedIds: Set<string>, index: number): string {
  const base = requested || `student-${index + 1}`;
  if (!usedIds.has(base)) return base;
  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

export function migrateStudents(value: unknown): Student[] {
  if (!Array.isArray(value)) return [];

  const students: Student[] = [];
  const usedIds = new Set<string>();
  for (const [index, item] of value.entries()) {
    const record = asRecord(item);
    if (!record || !looksLikeStudent(record)) continue;

    const name = asString(record.name);
    const university = asString(record.university ?? record.school);
    const rawCity = asString(record.city);

    const id = uniqueStudentId(asString(record.id), usedIds, index);
    usedIds.add(id);

    // Hand-written and pre-canonical payloads spell the overseas scope the way the
    // import parser accepts it ("overseas", "abroad", "海外"), so the same reader
    // decides here: anything else stays a China destination.
    const locationScope = parseLocationScopeValue(asString(record.locationScope));
    const manualProvince = locationScope ? "" : asString(record.province);
    students.push({
      id,
      name,
      university,
      city: (locationScope || !rawCity) ? rawCity : (resolveCity(rawCity).city || rawCity),
      ...(manualProvince ? { province: manualProvince } : {}),
      ...(locationScope ? { locationScope } : {}),
      visibility: record.visibility !== false,
    });
  }
  return students;
}
