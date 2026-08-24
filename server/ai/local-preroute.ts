import { chinaCities, chinaProvinces } from "../../src/data/china-locations";
import { isRecord, type ChatMessage } from "./agent-types";

/**
 * 主模型之前的只读统计预路由。命中后只能返回一句中文回答，永远不产生工具调用，
 * 因此误判的上限是答错一个数字，不可能改到画布。
 */
export type LocalStatIntentKind =
  | "student-total"
  | "province-count"
  | "hidden-count"
  | "duplicate"
  | "top-province";

export interface LocalStatIntent {
  kind: LocalStatIntentKind;
  /** province-count 命中时解析出的规范省级名称。 */
  province?: string;
}

export interface LocalPrerouteAnswer {
  intent: LocalStatIntentKind;
  summary: string;
}

export interface LocalPrerouteInput {
  userMessage: string;
  digest: Record<string, unknown>;
  messages?: ChatMessage[];
}

/**
 * 省名词表来自共享目录 `src/data/china-locations`，本文件不再自带 34 省硬编码列表。
 *
 * 为什么不直接调用 `src/lib/search-catalog` 的 `resolveProvinceName`：那条依赖链是
 * `search-catalog → map-data → ../assets/china.geojson?raw`，`?raw` 是 Vite 专有导入。
 * 服务端由 tsx 直接运行（`npm run dev:ai` / `npm start`），import 阶段就会抛
 * ERR_UNKNOWN_FILE_EXTENSION 而让整个 API 起不来（vitest 走 Vite 转换，反而看不出来）。
 * 目录数据与 GeoJSON 的 34 个省名逐字一致，因此这里用同一份目录数据兜住权威性，
 * 并在 local-preroute.test.ts 里逐项对齐 `resolveProvinceName`，任一侧改名都会红。
 *
 * 回滚：删掉本段与目录 import，恢复本地 PROVINCE_NAMES 词表 + provinceKey 后缀剥离即可，
 * 其余匹配逻辑不依赖目录。
 */
const PROVINCE_NAMES = chinaProvinces.map((province) => province.name);

/**
 * 与 `src/lib/map-data.ts` 的 `toShortProvinceName` 同一套后缀；该模块因 geojson 导入
 * 无法在服务端加载，故此处保留一份最小拷贝，由测试逐项对齐权威短名。
 */
const PROVINCE_SUFFIXES = ["特别行政区", "维吾尔自治区", "壮族自治区", "回族自治区", "自治区", "省", "市"];

function toShortProvinceName(name: string): string {
  return PROVINCE_SUFFIXES.reduce((shortName, suffix) => shortName.replace(suffix, ""), name);
}

/** 直辖市与特区在城市目录里既是市又是省，取它们的中文别名（帝都、魔都、津、渝……）。 */
function catalogProvinceAliases(): Array<[string, string]> {
  return chinaCities
    .filter((city) => city.name === city.province)
    .flatMap((city) => (city.aliases ?? [])
      // 英文缩写（HK / Macao）在整串锚定的中文句式里没有用武之地，还要额外考虑大小写，直接跳过。
      .filter((alias) => /^[\u4e00-\u9fa5]+$/u.test(alias))
      .map((alias): [string, string] => [alias, city.province]));
}

/** 目录里没有的口语缩写，只补这一条；其余一律以目录为准。 */
const COLLOQUIAL_ALIASES: Array<[string, string]> = [["内蒙", "内蒙古自治区"]];

const PROVINCE_BY_TOKEN = ((): Map<string, string> => {
  const index = new Map<string, string>();
  const add = (token: string, province: string) => {
    if (token && !index.has(token)) index.set(token, province);
  };
  for (const name of PROVINCE_NAMES) {
    add(name, name);
    add(toShortProvinceName(name), name);
  }
  for (const [alias, province] of [...catalogProvinceAliases(), ...COLLOQUIAL_ALIASES]) {
    add(alias, province);
  }
  return index;
})();

/** 只认词表内的写法；认不出返回 null，交给主模型，绝不把原样输入当成省名。 */
function resolveProvince(raw: string): string | null {
  return PROVINCE_BY_TOKEN.get(raw.trim()) ?? null;
}

/**
 * 省份必须由名称枚举本身匹配。用通配汉字捕获会被回溯挑走「广东有」这类错误切分，
 * 长名优先才能让「广东省」不被「广东」截断。
 */
const PROVINCE_ALTERNATION = [...PROVINCE_BY_TOKEN.keys()]
  .sort((left, right) => right.length - left.length)
  .join("|");

/**
 * 任何带动作的措辞都直接放弃预路由，交给主模型。这里只是第二道闸：
 * 下面的意图正则本身整串锚定，「把城市字号调大」这类写请求根本无法命中。
 */
const WRITE_INTENT = /把|将|帮我|请帮|改|换|设|调|增|减|删|移|加大|加粗|放大|缩小|生成|导出|优化|修复|布局|排版|字号|字体|颜色|对齐|切换|视图|去重|合并|清理|隐藏掉|显示出/u;

const SCOPE = "(?:现在|目前|当前|这份|这个|名单|表格|表|数据|项目|画布)*(?:里面|里|中|上)?";
const TOTAL = "(?:一共|总共|总计|统共)?";
const ASK_COUNT = "(?:有多少|有几|多少|几)";
const PERSON = "(?:个|名|位)?(?:人|同学|学生)";
const DUPLICATE = "(?:重复|重名)(?:了)?(?:的)?(?:人|同学|学生|数据|记录|项)?";

function anchored(body: string): RegExp {
  return new RegExp(`^${body}$`, "u");
}

/** 顺序敏感：省份规则最宽，必须排在所有固定措辞规则之后。 */
const INTENT_PATTERNS: Array<{ kind: LocalStatIntentKind; pattern: RegExp }> = [
  { kind: "duplicate", pattern: anchored(`${SCOPE}(?:有没有|有|是否有|是否存在|存在)${DUPLICATE}(?:吗|么|呢)?`) },
  { kind: "duplicate", pattern: anchored(`${SCOPE}${DUPLICATE}(?:吗|么|呢|没有)`) },
  { kind: "duplicate", pattern: anchored(`${SCOPE}(?:有)?(?:多少|几)(?:个|条|组|对)?${DUPLICATE}`) },
  { kind: "duplicate", pattern: anchored(`${SCOPE}${DUPLICATE}(?:有)?(?:多少|几)(?:个|条|组|人)?`) },
  { kind: "hidden-count", pattern: anchored(`${SCOPE}隐藏(?:了|的)?${ASK_COUNT}${PERSON}?`) },
  { kind: "hidden-count", pattern: anchored(`${SCOPE}${ASK_COUNT}${PERSON}(?:被)?隐藏(?:了)?`) },
  { kind: "top-province", pattern: anchored(`${SCOPE}哪(?:个)?(?:省份|省)(?:的)?(?:人|学生|同学)?(?:数)?最多`) },
  { kind: "top-province", pattern: anchored(`${SCOPE}(?:人数|人|学生|同学)(?:数)?最多的(?:是)?(?:哪(?:个|里))?(?:省份|省)?(?:是)?(?:哪(?:个|里))?`) },
  { kind: "student-total", pattern: anchored(`${SCOPE}${TOTAL}${ASK_COUNT}${PERSON}`) },
  { kind: "student-total", pattern: anchored(`${SCOPE}${TOTAL}(?:有)?(?:学生|同学|人)?(?:总人数|总数|人数)(?:是|有)?(?:多少|几个|多少个)?`) },
  { kind: "province-count", pattern: anchored(`${SCOPE}(?<province>${PROVINCE_ALTERNATION})${ASK_COUNT}${PERSON}`) },
  { kind: "province-count", pattern: anchored(`(?<province>${PROVINCE_ALTERNATION})(?:的)?(?:人数|学生数|同学数|人)(?:是|有)?(?:多少|几个|几人)`) },
];

/** 只剥离纯语气词；吗/呢/么 在重复类规则里是有效的疑问标记，不能一起剥掉。 */
function normalizeMessage(raw: string): string {
  return raw
    .replace(/\s+/gu, "")
    .replace(/^请问/u, "")
    .replace(/[?？。.!！,，、~～]+$/u, "")
    .replace(/[啊呀哦嘛哈]+$/u, "");
}

/** 严格整串匹配；任何一点多余成分都判为未命中，宁可交给主模型。 */
export function matchLocalStatIntent(userMessage: string): LocalStatIntent | null {
  const normalized = normalizeMessage(userMessage ?? "");
  if (!normalized || WRITE_INTENT.test(normalized)) return null;
  for (const { kind, pattern } of INTENT_PATTERNS) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    if (kind !== "province-count") return { kind };
    const province = resolveProvince(match.groups?.province ?? "");
    if (province) return { kind, province };
  }
  return null;
}

interface StudentStats {
  total: number;
  hidden: number;
  duplicateGroups: number;
  duplicateStudentCount: number;
  topProvinces: Array<{ province: string; count: number }>;
  /** digest 只投影前 10 个省份，超出部分无法用「没查到就是 0」来回答。 */
  provincesTruncated: boolean;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function readStudentStats(digest: Record<string, unknown>): StudentStats | null {
  const students = digest.students;
  if (!isRecord(students)) return null;
  const total = nonNegativeInteger(students.total);
  if (total === null) return null;
  const rawProvinces = Array.isArray(students.topProvinces) ? students.topProvinces : [];
  const topProvinces: Array<{ province: string; count: number }> = [];
  for (const entry of rawProvinces) {
    if (!isRecord(entry) || typeof entry.province !== "string") return null;
    const count = nonNegativeInteger(entry.count);
    if (count === null) return null;
    topProvinces.push({ province: entry.province, count });
  }
  return {
    total,
    hidden: nonNegativeInteger(students.hidden) ?? 0,
    duplicateGroups: nonNegativeInteger(students.duplicateGroups) ?? 0,
    duplicateStudentCount: nonNegativeInteger(students.duplicateStudentCount) ?? 0,
    topProvinces,
    provincesTruncated: topProvinces.length >= 10,
  };
}

/** 省份计数来自可见学生，隐藏行不计入，回答里必须说明差额来源。 */
function hiddenNote(stats: StudentStats): string {
  return stats.hidden > 0 ? `（未计入 ${stats.hidden} 名已隐藏同学）` : "";
}

function answerFor(intent: LocalStatIntent, stats: StudentStats): string | null {
  if (intent.kind === "student-total") {
    if (stats.total === 0) return "当前名单里还没有学生数据。";
    return `当前名单共 ${stats.total} 名同学${stats.hidden > 0 ? `，其中 ${stats.hidden} 名已隐藏` : ""}。`;
  }
  if (intent.kind === "hidden-count") {
    return `当前共 ${stats.total} 名同学，其中 ${stats.hidden} 名已隐藏。`;
  }
  if (intent.kind === "duplicate") {
    if (stats.duplicateGroups === 0) return "未检测到重复的同学。";
    return `检测到 ${stats.duplicateGroups} 组重复，共涉及 ${stats.duplicateStudentCount} 名同学。`;
  }
  if (intent.kind === "top-province") {
    const top = stats.topProvinces[0];
    if (!top) return "当前还没有可统计的省份分布。";
    return `人数最多的是${top.province}，共 ${top.count} 名同学${hiddenNote(stats)}。`;
  }
  const wanted = intent.province;
  if (!wanted) return null;
  const hit = stats.topProvinces.find((entry) => resolveProvince(entry.province) === wanted);
  if (hit) return `${hit.province}目前有 ${hit.count} 名同学${hiddenNote(stats)}。`;
  // 榜单被截断时「不在榜上」既可能是 0 也可能是第 11 名，这种不确定性交给主模型。
  if (stats.provincesTruncated) return null;
  return `${wanted}目前没有同学${hiddenNote(stats)}。`;
}

function hasToolRoundTrip(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.role === "tool" || (message.role === "assistant" && (message.tool_calls?.length ?? 0) > 0));
}

/**
 * 只有「当前这条用户消息之后」已经有工具往返，才算 agent 循环进行中，此时不预路由以免打断多步任务。
 * 边界取第一条内容等于 userMessage 的 user 消息：parseAgentRequest 会把 userMessage 补写到末尾，
 * 取最后一条会把本轮之前的历史也算进当前段，导致做过一次工具任务的会话再也用不上预路由。
 * 找不到边界（本轮消息尚未进历史，说明还在同一段任务的内部轮次里）就保持保守的全局口径。
 * 回滚：去掉 userMessage 参数、改回对整段 messages 判断即可。
 */
function isFreshQuestion(messages: ChatMessage[] | undefined, userMessage: string): boolean {
  if (!messages?.length) return true;
  const boundary = messages.findIndex((message) => message.role === "user" && message.content === userMessage);
  return !hasToolRoundTrip(boundary < 0 ? messages : messages.slice(boundary + 1));
}

export function tryLocalPreroute(input: LocalPrerouteInput): LocalPrerouteAnswer | null {
  if (!isFreshQuestion(input.messages, input.userMessage)) return null;
  const intent = matchLocalStatIntent(input.userMessage);
  if (!intent) return null;
  const stats = readStudentStats(input.digest ?? {});
  if (!stats) return null;
  const summary = answerFor(intent, stats);
  return summary ? { intent: intent.kind, summary } : null;
}
