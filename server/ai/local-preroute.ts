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

const PROVINCE_NAMES = [
  "北京市", "天津市", "河北省", "山西省", "内蒙古自治区", "辽宁省", "吉林省", "黑龙江省",
  "上海市", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "河南省",
  "湖北省", "湖南省", "广东省", "广西壮族自治区", "海南省", "重庆市", "四川省", "贵州省",
  "云南省", "西藏自治区", "陕西省", "甘肃省", "青海省", "宁夏回族自治区", "新疆维吾尔自治区",
  "香港特别行政区", "澳门特别行政区", "台湾省",
];

function provinceKey(name: string): string {
  return name
    .replace(/(?:特别行政区|自治区|省|市)$/u, "")
    .replace(/(?:壮族|回族|维吾尔族|维吾尔)$/u, "");
}

const PROVINCE_BY_KEY = new Map(PROVINCE_NAMES.map((name) => [provinceKey(name), name]));
const PROVINCE_ALIASES = new Map([["内蒙", "内蒙古自治区"]]);

function resolveProvince(raw: string): string | null {
  return PROVINCE_BY_KEY.get(provinceKey(raw)) ?? PROVINCE_ALIASES.get(raw) ?? null;
}

/**
 * 省份必须由名称枚举本身匹配。用通配汉字捕获会被回溯挑走「广东有」这类错误切分，
 * 长名优先才能让「广东省」不被「广东」截断。
 */
const PROVINCE_ALTERNATION = [...new Set([
  ...PROVINCE_NAMES,
  ...PROVINCE_NAMES.map(provinceKey),
  ...PROVINCE_ALIASES.keys(),
])].sort((left, right) => right.length - left.length).join("|");

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

/** agent 循环进行中（已有工具往返）时不预路由，避免打断多步任务。 */
function isFreshQuestion(messages: ChatMessage[] | undefined): boolean {
  if (!messages?.length) return true;
  return !messages.some((message) => message.role === "tool" || (message.role === "assistant" && (message.tool_calls?.length ?? 0) > 0));
}

export function tryLocalPreroute(input: LocalPrerouteInput): LocalPrerouteAnswer | null {
  if (!isFreshQuestion(input.messages)) return null;
  const intent = matchLocalStatIntent(input.userMessage);
  if (!intent) return null;
  const stats = readStudentStats(input.digest ?? {});
  if (!stats) return null;
  const summary = answerFor(intent, stats);
  return summary ? { intent: intent.kind, summary } : null;
}
