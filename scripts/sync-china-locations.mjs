/**
 * Synchronize the checked-in China province/city catalog from the
 * `province-city-china` npm package (MIT).
 *
 * Reads ONLY `package/dist/province.json` and `package/dist/city.json` from the
 * package tarball — district and town payloads are never touched. Validates the
 * whole result in memory before overwriting the target module, so a bad upstream
 * release can never corrupt the checked-in catalog.
 *
 * Usage:
 *   npm run data:sync:china-locations            # latest release
 *   npm run data:sync:china-locations -- --version 8.5.8
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

/** npm registry metadata endpoint for the upstream package. */
export const REGISTRY_URL = "https://registry.npmjs.org/province-city-china";

const PROVINCE_ENTRY = "package/dist/province.json";
const CITY_ENTRY = "package/dist/city.json";

/**
 * Upstream rows that are administrative placeholder buckets rather than
 * prefecture-level cities. `province-city-china` ships one row per province
 * whose name denotes the province/region directly administered county-level
 * divisions (e.g. `河南省-省直辖县级行政区划`). They exist only so the upstream
 * district data can group county-level divisions, so they must not appear in a
 * province/city catalog — keeping them would make search surface a fake
 * "city" row. Rows whose name contains this marker are excluded from the
 * generated catalog; the marker matches both 省直辖 and 自治区直辖 variants.
 */
const DIRECTLY_ADMINISTERED_COUNTY_MARKER = "直辖县级行政区划";

/**
 * Municipality / special-region / Taiwan compatibility rows. The upstream
 * `city.json` ships no city rows for these provinces, while consumers have long
 * relied on these canonical city names and aliases. Rows are only synthesized
 * when the matching province exists upstream; an existing upstream city row is
 * enriched with the aliases instead of being duplicated.
 */
const COMPATIBILITY_CITIES = [
  { provinceName: "北京市", cityName: "北京市", aliases: ["北京", "帝都"] },
  { provinceName: "上海市", cityName: "上海市", aliases: ["上海", "魔都"] },
  { provinceName: "天津市", cityName: "天津市", aliases: ["天津", "津"] },
  { provinceName: "重庆市", cityName: "重庆市", aliases: ["重庆", "渝"] },
  { provinceName: "香港特别行政区", cityName: "香港特别行政区", aliases: ["香港", "HongKong", "HK"] },
  { provinceName: "澳门特别行政区", cityName: "澳门特别行政区", aliases: ["澳门", "Macao"] },
  { provinceName: "台湾省", cityName: "台北市", aliases: ["台北"] },
];

/**
 * Aliases from the deleted hand-maintained catalog (baseline commit 49e462b,
 * `src/data/china-cities.ts`), keyed by canonical city name. Each entry is
 * merged into the matching upstream/synthesized city row at generation time;
 * a key without an upstream match never synthesizes a row. Suffix-free aliases
 * (e.g. `杭州` for `杭州市`) are kept deliberately — the old catalog exposed
 * them and consumers may read alias data directly, even though
 * `toShortProvinceName` derives the same short form at runtime.
 */
const LEGACY_CITY_ALIASES = [
// 162 legacy city entries (162 aliases) from the deleted hand-maintained catalog
// whose rows still exist upstream. The six historical labels without an upstream
// prefecture row (莱芜/济源/敦煌/格尔木/喀什/伊宁) live in
// LEGACY_CITY_COMPATIBILITY below instead.
  { cityName: "杭州市", aliases: ["杭州"] },
  { cityName: "宁波市", aliases: ["宁波"] },
  { cityName: "温州市", aliases: ["温州"] },
  { cityName: "绍兴市", aliases: ["绍兴"] },
  { cityName: "金华市", aliases: ["金华"] },
  { cityName: "南京市", aliases: ["南京"] },
  { cityName: "苏州市", aliases: ["苏州"] },
  { cityName: "无锡市", aliases: ["无锡"] },
  { cityName: "常州市", aliases: ["常州"] },
  { cityName: "徐州市", aliases: ["徐州"] },
  { cityName: "扬州市", aliases: ["扬州"] },
  { cityName: "武汉市", aliases: ["武汉"] },
  { cityName: "宜昌市", aliases: ["宜昌"] },
  { cityName: "襄阳市", aliases: ["襄阳"] },
  { cityName: "成都市", aliases: ["成都"] },
  { cityName: "绵阳市", aliases: ["绵阳"] },
  { cityName: "德阳市", aliases: ["德阳"] },
  { cityName: "广州市", aliases: ["广州"] },
  { cityName: "深圳市", aliases: ["深圳"] },
  { cityName: "珠海市", aliases: ["珠海"] },
  { cityName: "佛山市", aliases: ["佛山"] },
  { cityName: "东莞市", aliases: ["东莞"] },
  { cityName: "中山市", aliases: ["中山"] },
  { cityName: "惠州市", aliases: ["惠州"] },
  { cityName: "汕头市", aliases: ["汕头"] },
  { cityName: "江门市", aliases: ["江门"] },
  { cityName: "湛江市", aliases: ["湛江"] },
  { cityName: "西安市", aliases: ["西安"] },
  { cityName: "咸阳市", aliases: ["咸阳"] },
  { cityName: "宝鸡市", aliases: ["宝鸡"] },
  { cityName: "哈尔滨市", aliases: ["哈尔滨"] },
  { cityName: "大庆市", aliases: ["大庆"] },
  { cityName: "齐齐哈尔市", aliases: ["齐齐哈尔"] },
  { cityName: "厦门市", aliases: ["厦门"] },
  { cityName: "福州市", aliases: ["福州"] },
  { cityName: "泉州市", aliases: ["泉州"] },
  { cityName: "漳州市", aliases: ["漳州"] },
  { cityName: "莆田市", aliases: ["莆田"] },
  { cityName: "宁德市", aliases: ["宁德"] },
  { cityName: "龙岩市", aliases: ["龙岩"] },
  { cityName: "南平市", aliases: ["南平"] },
  { cityName: "三明市", aliases: ["三明"] },
  { cityName: "长沙市", aliases: ["长沙"] },
  { cityName: "株洲市", aliases: ["株洲"] },
  { cityName: "湘潭市", aliases: ["湘潭"] },
  { cityName: "衡阳市", aliases: ["衡阳"] },
  { cityName: "岳阳市", aliases: ["岳阳"] },
  { cityName: "常德市", aliases: ["常德"] },
  { cityName: "青岛市", aliases: ["青岛"] },
  { cityName: "济南市", aliases: ["济南"] },
  { cityName: "烟台市", aliases: ["烟台"] },
  { cityName: "威海市", aliases: ["威海"] },
  { cityName: "潍坊市", aliases: ["潍坊"] },
  { cityName: "临沂市", aliases: ["临沂"] },
  { cityName: "淄博市", aliases: ["淄博"] },
  { cityName: "泰安市", aliases: ["泰安"] },
  { cityName: "济宁市", aliases: ["济宁"] },
  { cityName: "日照市", aliases: ["日照"] },
  { cityName: "德州市", aliases: ["德州"] },
  { cityName: "聊城市", aliases: ["聊城"] },
  { cityName: "菏泽市", aliases: ["菏泽"] },
  { cityName: "滨州市", aliases: ["滨州"] },
  { cityName: "东营市", aliases: ["东营"] },
  { cityName: "枣庄市", aliases: ["枣庄"] },
  { cityName: "合肥市", aliases: ["合肥"] },
  { cityName: "芜湖市", aliases: ["芜湖"] },
  { cityName: "蚌埠市", aliases: ["蚌埠"] },
  { cityName: "南昌市", aliases: ["南昌"] },
  { cityName: "赣州市", aliases: ["赣州"] },
  { cityName: "九江市", aliases: ["九江"] },
  { cityName: "上饶市", aliases: ["上饶"] },
  { cityName: "郑州市", aliases: ["郑州"] },
  { cityName: "洛阳市", aliases: ["洛阳"] },
  { cityName: "新乡市", aliases: ["新乡"] },
  { cityName: "南阳市", aliases: ["南阳"] },
  { cityName: "开封市", aliases: ["开封"] },
  { cityName: "安阳市", aliases: ["安阳"] },
  { cityName: "平顶山市", aliases: ["平顶山"] },
  { cityName: "焦作市", aliases: ["焦作"] },
  { cityName: "许昌市", aliases: ["许昌"] },
  { cityName: "漯河市", aliases: ["漯河"] },
  { cityName: "驻马店市", aliases: ["驻马店"] },
  { cityName: "商丘市", aliases: ["商丘"] },
  { cityName: "周口市", aliases: ["周口"] },
  { cityName: "信阳市", aliases: ["信阳"] },
  { cityName: "濮阳市", aliases: ["濮阳"] },
  { cityName: "三门峡市", aliases: ["三门峡"] },
  { cityName: "鹤壁市", aliases: ["鹤壁"] },
  { cityName: "石家庄市", aliases: ["石家庄"] },
  { cityName: "唐山市", aliases: ["唐山"] },
  { cityName: "保定市", aliases: ["保定"] },
  { cityName: "廊坊市", aliases: ["廊坊"] },
  { cityName: "秦皇岛市", aliases: ["秦皇岛"] },
  { cityName: "沈阳市", aliases: ["沈阳"] },
  { cityName: "大连市", aliases: ["大连"] },
  { cityName: "鞍山市", aliases: ["鞍山"] },
  { cityName: "抚顺市", aliases: ["抚顺"] },
  { cityName: "本溪市", aliases: ["本溪"] },
  { cityName: "丹东市", aliases: ["丹东"] },
  { cityName: "锦州市", aliases: ["锦州"] },
  { cityName: "营口市", aliases: ["营口"] },
  { cityName: "阜新市", aliases: ["阜新"] },
  { cityName: "辽阳市", aliases: ["辽阳"] },
  { cityName: "铁岭市", aliases: ["铁岭"] },
  { cityName: "朝阳市", aliases: ["朝阳"] },
  { cityName: "盘锦市", aliases: ["盘锦"] },
  { cityName: "葫芦岛市", aliases: ["葫芦岛"] },
  { cityName: "长春市", aliases: ["长春"] },
  { cityName: "吉林市", aliases: ["吉林"] },
  { cityName: "延边朝鲜族自治州", aliases: ["延边"] },
  { cityName: "四平市", aliases: ["四平"] },
  { cityName: "通化市", aliases: ["通化"] },
  { cityName: "白山市", aliases: ["白山"] },
  { cityName: "辽源市", aliases: ["辽源"] },
  { cityName: "白城市", aliases: ["白城"] },
  { cityName: "松原市", aliases: ["松原"] },
  { cityName: "海口市", aliases: ["海口"] },
  { cityName: "三亚市", aliases: ["三亚"] },
  { cityName: "三沙市", aliases: ["三沙"] },
  { cityName: "儋州市", aliases: ["儋州"] },
  { cityName: "昆明市", aliases: ["昆明"] },
  { cityName: "大理白族自治州", aliases: ["大理"] },
  { cityName: "丽江市", aliases: ["丽江"] },
  { cityName: "西双版纳傣族自治州", aliases: ["西双版纳"] },
  { cityName: "贵阳市", aliases: ["贵阳"] },
  { cityName: "遵义市", aliases: ["遵义"] },
  { cityName: "六盘水市", aliases: ["六盘水"] },
  { cityName: "南宁市", aliases: ["南宁"] },
  { cityName: "桂林市", aliases: ["桂林"] },
  { cityName: "柳州市", aliases: ["柳州"] },
  { cityName: "北海市", aliases: ["北海"] },
  { cityName: "兰州市", aliases: ["兰州"] },
  { cityName: "天水市", aliases: ["天水"] },
  { cityName: "酒泉市", aliases: ["酒泉"] },
  { cityName: "张掖市", aliases: ["张掖"] },
  { cityName: "银川市", aliases: ["银川"] },
  { cityName: "石嘴山市", aliases: ["石嘴山"] },
  { cityName: "中卫市", aliases: ["中卫"] },
  { cityName: "西宁市", aliases: ["西宁"] },
  { cityName: "海东市", aliases: ["海东"] },
  { cityName: "乌鲁木齐市", aliases: ["乌鲁木齐"] },
  { cityName: "克拉玛依市", aliases: ["克拉玛依"] },
  { cityName: "拉萨市", aliases: ["拉萨"] },
  { cityName: "日喀则市", aliases: ["日喀则"] },
  { cityName: "林芝市", aliases: ["林芝"] },
  { cityName: "昌都市", aliases: ["昌都"] },
  { cityName: "呼和浩特市", aliases: ["呼和浩特"] },
  { cityName: "包头市", aliases: ["包头"] },
  { cityName: "鄂尔多斯市", aliases: ["鄂尔多斯"] },
  { cityName: "赤峰市", aliases: ["赤峰"] },
  { cityName: "呼伦贝尔市", aliases: ["呼伦贝尔"] },
  { cityName: "太原市", aliases: ["太原"] },
  { cityName: "大同市", aliases: ["大同"] },
  { cityName: "晋中市", aliases: ["晋中"] },
  { cityName: "忻州市", aliases: ["忻州"] },
  { cityName: "吕梁市", aliases: ["吕梁"] },
  { cityName: "长治市", aliases: ["长治"] },
  { cityName: "晋城市", aliases: ["晋城"] },
  { cityName: "临汾市", aliases: ["临汾"] },
  { cityName: "运城市", aliases: ["运城"] },
  { cityName: "朔州市", aliases: ["朔州"] },
  { cityName: "阳泉市", aliases: ["阳泉"] },
];

/**
 * Historical/county-level city labels preserved ONLY for backwards-compatible
 * student-data importing. The six labels below existed in the deleted
 * hand-maintained catalog (baseline commit 49e462b) but have no upstream
 * prefecture-level city row in `province-city-china@8.5.8`, so without them the
 * catalog would silently stop resolving these inputs.
 *
 * Each entry carries the canonical compatibility `name`, the canonical map
 * `province`, the accepted `aliases`, and the official administrative `code`
 * where one is known (documentation only for mapped rows).
 *
 * - `mapsToCity`: the alias set is merged into that canonical upstream
 *   prefecture row (same province); it never synthesizes a new row, so the
 *   catalog stays province/prefecture-level and district/town payloads are
 *   never read. Entries are skipped when the anchor prefecture is absent,
 *   mirroring COMPATIBILITY_CITIES; consumer resolveCity tests guard the
 *   checked-in catalog against silent regression.
 * - no `mapsToCity`: the label is kept as a standalone legacy compatibility row
 *   with its official code. This is used only for 济源, whose real
 *   county-level status (directly administered by 河南省) cannot be represented
 *   by any upstream prefecture without false geography.
 */
const LEGACY_CITY_COMPATIBILITY = [
  {
    // 莱芜市 was a prefecture-level city (code 371200) until it merged into
    // 济南市 in 2019. The input alias must keep resolving to the successor.
    name: "莱芜市",
    province: "山东省",
    aliases: ["莱芜"],
    code: "371200",
    mapsToCity: "济南市",
  },
  {
    // 济源市 is a county-level city directly administered by 河南省 (national
    // code 419001). No upstream prefecture can represent it without false
    // geography, so it stays a standalone legacy compatibility record only.
    name: "济源市",
    province: "河南省",
    aliases: ["济源"],
    code: "419001",
  },
  {
    // 敦煌市 (county-level, code 620982) belongs to 酒泉市.
    name: "敦煌市",
    province: "甘肃省",
    aliases: ["敦煌"],
    code: "620982",
    mapsToCity: "酒泉市",
  },
  {
    // 格尔木市 (county-level, code 632801) belongs to 海西蒙古族藏族自治州.
    name: "格尔木市",
    province: "青海省",
    aliases: ["格尔木"],
    code: "632801",
    mapsToCity: "海西蒙古族藏族自治州",
  },
  {
    // 喀什市 (county-level, code 653101) belongs to 喀什地区.
    name: "喀什市",
    province: "新疆维吾尔自治区",
    aliases: ["喀什"],
    code: "653101",
    mapsToCity: "喀什地区",
  },
  {
    // 伊宁市 (county-level, code 654002) belongs to 伊犁哈萨克自治州.
    name: "伊宁市",
    province: "新疆维吾尔自治区",
    aliases: ["伊宁"],
    code: "654002",
    mapsToCity: "伊犁哈萨克自治州",
  },
];

/**
 * Resolve which release to sync. A pinned `version` must exist in the registry;
 * otherwise the `latest` dist-tag is used. Returns the resolved version string
 * and its tarball URL.
 */
async function resolveRelease({ version, fetch }) {
  const response = await fetch(REGISTRY_URL, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`failed to fetch ${REGISTRY_URL}: HTTP ${response.status}`);
  }
  let metadata;
  try {
    metadata = await response.json();
  } catch (error) {
    throw new Error(`invalid registry metadata for province-city-china: ${error.message}`);
  }
  if (!metadata || typeof metadata !== "object" || !metadata.versions || typeof metadata.versions !== "object") {
    throw new Error("invalid registry metadata: missing versions map");
  }
  const release = version ?? metadata["dist-tags"]?.latest;
  const entry = release ? metadata.versions[release] : undefined;
  const tarball = entry?.dist?.tarball;
  if (typeof release !== "string" || typeof tarball !== "string") {
    throw new Error(`version "${version ?? metadata["dist-tags"]?.latest ?? ""}" not found in the province-city-china registry`);
  }
  return { version: release, tarball };
}

async function fetchTarball(tarballUrl, fetch) {
  const response = await fetch(tarballUrl);
  if (!response.ok) {
    throw new Error(`failed to fetch tarball ${tarballUrl}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

const textDecoder = new TextDecoder();

function readString(buffer, start, maxLength) {
  const terminator = buffer.indexOf(0, start);
  const end = terminator === -1 || terminator > start + maxLength ? start + maxLength : terminator;
  return textDecoder.decode(buffer.subarray(start, end));
}

/** Extract PAX `path=` overrides from an extended header payload. */
function parsePaxPath(text) {
  let path = null;
  for (const record of text.split("\n")) {
    const match = /^\d+ path=(.*)$/.exec(record);
    if (match) path = match[1];
  }
  return path;
}

/**
 * Minimal gzip-tar reader (ustar, plus GNU long-name and PAX path headers for
 * robustness). Returns a map of entry path -> file bytes.
 */
function parseTar(buffer) {
  const files = new Map();
  let offset = 0;
  let longName = null;
  let paxPath = null;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readString(header, 0, 100);
    const size = Number.parseInt(readString(header, 124, 12).trim() || "0", 8) || 0;
    const typeflag = String.fromCharCode(header[156]);
    const prefix = readString(header, 345, 155);
    const data = buffer.subarray(offset + 512, offset + 512 + size);
    const padded = Math.ceil(size / 512) * 512;
    if (typeflag === "L") {
      longName = readString(data, 0, size);
    } else if (typeflag === "x") {
      paxPath = parsePaxPath(readString(data, 0, size));
    } else if (typeflag === "0" || typeflag === "\0") {
      const fullName = paxPath ?? longName ?? (prefix ? `${prefix}/${name}` : name);
      files.set(fullName, data);
    }
    if (typeflag !== "L" && typeflag !== "x") {
      longName = null;
      paxPath = null;
    }
    offset += 512 + padded;
  }
  return files;
}

function parseJsonPayload(buffer, entryPath) {
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch (error) {
    throw new Error(`could not parse ${entryPath}: ${error.message}`);
  }
}

/** Unpack the tarball and return only the province and city payload rows. */
function extractProvinceCity(tarballBuffer) {
  const files = parseTar(gunzipSync(tarballBuffer));
  const province = files.get(PROVINCE_ENTRY);
  const city = files.get(CITY_ENTRY);
  if (!province) throw new Error(`tarball is missing ${PROVINCE_ENTRY}`);
  if (!city) throw new Error(`tarball is missing ${CITY_ENTRY}`);
  return {
    provinceRows: parseJsonPayload(province, PROVINCE_ENTRY),
    cityRows: parseJsonPayload(city, CITY_ENTRY),
  };
}

function assertRow(row, label) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`invalid ${label}: expected an object row`);
  }
  for (const field of ["code", "name", "province"]) {
    if (typeof row[field] !== "string" || row[field].trim() === "") {
      throw new Error(`invalid ${label}: missing ${field}`);
    }
  }
}

function assertUnique(entries, kind, getKey) {
  const seen = new Set();
  for (const entry of entries) {
    const key = getKey(entry);
    if (seen.has(key)) throw new Error(`duplicate ${kind} code "${key}"`);
    seen.add(key);
  }
}

/**
 * Validate upstream rows, attach canonical province names to cities, and
 * synthesize compatibility entries. Throws before anything is written whenever
 * the upstream data is inconsistent.
 */
function normalizeLocationRows(provinceRows, cityRows) {
  if (!Array.isArray(provinceRows)) throw new Error("invalid province.json: expected an array");
  if (!Array.isArray(cityRows)) throw new Error("invalid city.json: expected an array");

  const provinces = provinceRows.map((row, index) => {
    assertRow(row, `province row ${index}`);
    return { code: String(row.code), name: String(row.name), prefix: String(row.province) };
  });
  assertUnique(provinces, "province", (entry) => entry.code);
  assertUnique(provinces, "province", (entry) => entry.name);

  // Every city's explicit `province` field must map to an existing province and
  // match the leading digits of its own code; the code-prefix fallback must not
  // paper over an inconsistent upstream row.
  const prefixToProvince = new Map();
  for (const province of provinces) {
    prefixToProvince.set(province.prefix, province);
    prefixToProvince.set(province.code.slice(0, 2), province);
  }

  const cities = cityRows
    .map((row, index) => {
      assertRow(row, `city row ${index}`);
      const code = String(row.code);
      const name = String(row.name);
      const explicitProvince = String(row.province);
      const province = prefixToProvince.get(explicitProvince);
      if (!province || explicitProvince !== code.slice(0, 2)) {
        throw new Error(`city "${code} ${name}" references province "${row.province}" inconsistent with its code`);
      }
      return { code, name, province: province.name, aliases: [] };
    })
    // Drop province/region directly administered county-level placeholder rows
    // (see DIRECTLY_ADMINISTERED_COUNTY_MARKER) so the catalog only contains
    // real prefecture-level cities.
    .filter((city) => !city.name.includes(DIRECTLY_ADMINISTERED_COUNTY_MARKER));

  // Municipality / special-region / Taiwan compatibility entries.
  const provinceByName = new Map(provinces.map((province) => [province.name, province]));
  for (const spec of COMPATIBILITY_CITIES) {
    const province = provinceByName.get(spec.provinceName);
    if (!province) continue;
    const existing = cities.find((city) => city.name === spec.cityName && city.province === province.name);
    if (existing) {
      for (const alias of spec.aliases) {
        if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
      }
    } else {
      cities.push({ code: province.code, name: spec.cityName, province: province.name, aliases: [...spec.aliases] });
    }
  }

  // Legacy aliases from the deleted hand-maintained catalog, keyed by canonical
  // city name. Merged only into matching rows — never synthesized — so the
  // prefecture-level scope of the catalog is preserved and city codes stay
  // unique. Suffix-free aliases are kept as-is (never suppressed).
  const legacyAliasesByCityName = new Map(
    LEGACY_CITY_ALIASES.map(({ cityName, aliases }) => [cityName, aliases]),
  );
  for (const city of cities) {
    const legacyAliases = legacyAliasesByCityName.get(city.name);
    if (!legacyAliases) continue;
    for (const alias of legacyAliases) {
      if (!city.aliases.includes(alias)) city.aliases.push(alias);
    }
  }

  // Legacy county-level/historical city labels preserved for backwards-compatible
  // importing. Mapped entries attach their aliases to the canonical upstream
  // prefecture; the standalone entry (济源) is synthesized only when its province
  // exists. This never reads district/town payloads and never invents rows that
  // could collide with upstream data (uniqueness is asserted below).
  for (const legacy of LEGACY_CITY_COMPATIBILITY) {
    if (legacy.mapsToCity) {
      // Attach the historical aliases to the canonical upstream prefecture. If
      // that prefecture is absent the entry is skipped, mirroring how
      // COMPATIBILITY_CITIES behaves for a missing anchor province; the
      // checked-in catalog is guarded by consumer resolveCity tests, so a
      // regression upstream can never silently break existing import resolution.
      const target = cities.find(
        (city) => city.name === legacy.mapsToCity && city.province === legacy.province,
      );
      if (!target) continue;
      for (const alias of legacy.aliases) {
        if (!target.aliases.includes(alias)) target.aliases.push(alias);
      }
    } else {
      if (!provinceByName.has(legacy.province)) continue;
      const existing = cities.find(
        (city) => city.name === legacy.name && city.province === legacy.province,
      );
      const row = existing ?? {
        code: legacy.code,
        name: legacy.name,
        province: legacy.province,
        aliases: [],
      };
      if (!existing) cities.push(row);
      for (const alias of legacy.aliases) {
        if (!row.aliases.includes(alias)) row.aliases.push(alias);
      }
    }
  }

  // City codes must stay unique after ALL upstream, municipality/SAR/Taipei and
  // legacy compatibility rows have been added — they share one namespace.
  assertUnique(cities, "city", (entry) => entry.code);

  provinces.sort(compareByCode);
  cities.sort(compareByCode);
  return {
    provinces: provinces.map(({ prefix: _prefix, ...entry }) => entry),
    cities,
  };
}

function compareByCode(left, right) {
  return left.code.localeCompare(right.code) || left.name.localeCompare(right.name);
}

function quote(value) {
  return JSON.stringify(value);
}

function formatProvince({ code, name }) {
  return `{ code: ${quote(code)}, name: ${quote(name)} }`;
}

function formatCity({ code, name, province, aliases }) {
  const aliasText = aliases.length === 0 ? "[]" : `[${aliases.map(quote).join(", ")}]`;
  return `{ code: ${quote(code)}, name: ${quote(name)}, province: ${quote(province)}, aliases: ${aliasText} }`;
}

/** Deterministic TypeScript module text for the validated catalog. */
function renderCatalog({ provinces, cities }, version) {
  return `/**
 * China province/city catalog generated from the \`province-city-china\` npm package.
 *
 * This file is checked in and ships to browsers as static data. It contains
 * province and prefecture-level city/prefecture data; district and town data is
 * never loaded during synchronization. Province/region directly administered
 * county-level placeholder rows (e.g. \`河南省-省直辖县级行政区划\`) are excluded
 * from the city catalog. A narrowly scoped set of historic/county-level
 * compatibility rows (e.g. \`济源市\`, code 419001) is kept solely so legacy
 * imported city names keep resolving; these rows are not prefecture-level.
 * Regenerate it with:
 *
 *   npm run data:sync:china-locations [-- --version <semver>]
 */

export interface ProvinceCatalogEntry {
  /** Six-digit national administrative division code, e.g. "330000". */
  code: string;
  /** Canonical province name, e.g. "浙江省". */
  name: string;
}

export interface CityCatalogEntry {
  /** Six-digit national administrative division code, e.g. "330100". Not always a prefecture-level code: legacy compatibility rows carry their official county-level codes (e.g. "419001" for 济源市). */
  code: string;
  /** Canonical city/prefecture name, e.g. "杭州市", or a legacy import-compatibility label (e.g. "济源市"). */
  name: string;
  /** Canonical province name the city belongs to, e.g. "浙江省". */
  province: string;
  /** Common aliases (北京, 上海, HongKong, ...) used by search and compat code. */
  aliases: string[];
}

/** Upstream package and exact release that generated this file. */
export const chinaLocationSource = { registry: ${quote("province-city-china")}, version: ${quote(version)} };

export const chinaProvinces: ProvinceCatalogEntry[] = [
${provinces.map((entry) => `  ${formatProvince(entry)},`).join("\n")}
];

export const chinaCities: CityCatalogEntry[] = [
${cities.map((entry) => `  ${formatCity(entry)},`).join("\n")}
];
`;
}

/**
 * Resolve a release, fetch and validate the upstream province/city payloads, and
 * write the generated catalog module. The target file is only overwritten once
 * the entire result has been validated.
 *
 * `fetch` and `outputPath` are injectable so unit tests run fully offline.
 *
 * @returns {{ version: string, provinces: number, cities: number }}
 */
export async function syncChinaLocations({ version, fetch = globalThis.fetch, outputPath } = {}) {
  const release = await resolveRelease({ version, fetch });
  const tarball = await fetchTarball(release.tarball, fetch);
  const { provinceRows, cityRows } = extractProvinceCity(tarball);
  const catalog = normalizeLocationRows(provinceRows, cityRows);
  const target = outputPath ?? new URL("../src/data/china-locations.ts", import.meta.url);
  await writeFile(target, renderCatalog(catalog, release.version), "utf8");
  return {
    version: release.version,
    provinces: catalog.provinces.length,
    cities: catalog.cities.length,
  };
}

function parseCliArgs(argv) {
  let version;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--version") {
      version = argv[index + 1];
      if (version === undefined) throw new Error("--version requires a semver value");
      index += 1;
    } else if (arg.startsWith("--version=")) {
      version = arg.slice("--version=".length);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return { version };
}

const isCli = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const { version } = parseCliArgs(process.argv.slice(2));
    const result = await syncChinaLocations({ version });
    console.log(
      `[data:sync:china-locations] wrote src/data/china-locations.ts from province-city-china@${result.version} ` +
        `(${result.provinces} provinces, ${result.cities} cities)`,
    );
  } catch (error) {
    console.error(`[data:sync:china-locations] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
