import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { REGISTRY_URL, syncChinaLocations } from "./sync-china-locations.mjs";

type ProvinceRow = { code: string; name: string; province: string };
type CityRow = { code: string; name: string; province: string; city: string };
type TarFiles = Record<string, string>;

/** Deliberately broken payloads: if the generator ever read town/area data it would fail. */
const TOWN_JUNK = "{ intentionally invalid JSON";
const AREA_JUNK = "[ intentionally invalid JSON";

/** Minimal ustar tar writer so fixtures behave like a real npm package tarball. */
function encodeTarEntry(path: string, content: string): Buffer {
  const data = Buffer.from(content, "utf8");
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.write("        ", 148, 8, "ascii");
  header[156] = 0x30; // typeflag '0': regular file
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  const padding = Buffer.alloc(data.length % 512 === 0 ? 0 : 512 - (data.length % 512));
  return Buffer.concat([header, data, padding]);
}

function buildTar(files: TarFiles): Buffer {
  const blocks = Object.entries(files).map(([path, content]) => encodeTarEntry(path, content));
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

function makeRegistry(options: {
  provinceRows?: ProvinceRow[];
  cityRows?: CityRow[];
  files?: TarFiles;
  version?: string;
  latest?: string;
  metadataStatus?: number;
  tarballStatus?: number;
}) {
  const version = options.version ?? "8.5.8";
  const latest = options.latest ?? version;
  const tarballUrl = `https://registry.example/province-city-china/-/province-city-china-${version}.tgz`;
  const files = options.files ?? {
    "package/dist/province.json": JSON.stringify(options.provinceRows ?? []),
    "package/dist/city.json": JSON.stringify(options.cityRows ?? []),
    "package/dist/town.json": TOWN_JUNK,
    "package/dist/area.json": AREA_JUNK,
  };
  const metadata = {
    "dist-tags": { latest },
    versions: {
      [version]: { name: "province-city-china", version, dist: { tarball: tarballUrl } },
    },
  };
  const tarball = gzipSync(buildTar(files));
  const fetch = async (input: string | URL | Request) => {
    const url = String(input);
    if (url === REGISTRY_URL) {
      if (options.metadataStatus && options.metadataStatus >= 400) {
        return new Response("nope", { status: options.metadataStatus });
      }
      return new Response(JSON.stringify(metadata), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url === tarballUrl) {
      if (options.tarballStatus && options.tarballStatus >= 400) {
        return new Response("nope", { status: options.tarballStatus });
      }
      return new Response(new Uint8Array(tarball), { status: 200 });
    }
    throw new Error(`unexpected fetch url: ${url}`);
  };
  return { fetch, tarballUrl };
}

describe("sync-china-locations generator", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "china-locations-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const outputPath = () => join(dir, "china-locations.ts");

  it("writes province and city data from an injected upstream release", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [
        { code: "330000", name: "浙江省", province: "33" },
        { code: "440000", name: "广东省", province: "44" },
      ],
      cityRows: [
        { code: "330100", name: "杭州市", province: "33", city: "01" },
        { code: "330200", name: "宁波市", province: "33", city: "02" },
        { code: "440300", name: "深圳市", province: "44", city: "03" },
      ],
    });

    const result = await syncChinaLocations({ version: "8.5.8", fetch, outputPath: outputPath() });

    expect(result).toEqual({ version: "8.5.8", provinces: 2, cities: 3 });
    const output = await readFile(outputPath(), "utf8");
    expect(output).toContain('name: "杭州市"');
    expect(output).toContain('province: "浙江省"');
    expect(output).toContain('code: "330100"');
    expect(output).toContain('version: "8.5.8"');
    expect(output).toContain('registry: "province-city-china"');
    expect(output).toContain("export const chinaLocationSource");
    expect(output).not.toContain(TOWN_JUNK);
    expect(output).not.toContain(AREA_JUNK);
  });

  it("resolves the latest release when no version is requested", async () => {
    const { fetch } = makeRegistry({
      latest: "8.5.8",
      provinceRows: [{ code: "330000", name: "浙江省", province: "33" }],
      cityRows: [{ code: "330100", name: "杭州市", province: "33", city: "01" }],
    });

    const result = await syncChinaLocations({ fetch, outputPath: outputPath() });

    expect(result.version).toBe("8.5.8");
  });

  it("rejects a version absent from the registry", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [{ code: "330000", name: "浙江省", province: "33" }],
      cityRows: [],
    });

    await expect(
      syncChinaLocations({ version: "9.9.9", fetch, outputPath: outputPath() }),
    ).rejects.toThrow(/9\.9\.9/);
  });

  it("rejects a failing registry response", async () => {
    const { fetch } = makeRegistry({ provinceRows: [], cityRows: [], metadataStatus: 503 });

    await expect(syncChinaLocations({ fetch, outputPath: outputPath() })).rejects.toThrow(/503/);
  });

  it("rejects a failing tarball response", async () => {
    const { fetch } = makeRegistry({ provinceRows: [], cityRows: [], tarballStatus: 404 });

    await expect(syncChinaLocations({ fetch, outputPath: outputPath() })).rejects.toThrow(/404/);
  });

  it("synthesizes municipality and special-region entries with compatibility aliases", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [
        { code: "110000", name: "北京市", province: "11" },
        { code: "310000", name: "上海市", province: "31" },
        { code: "500000", name: "重庆市", province: "50" },
        { code: "710000", name: "台湾省", province: "71" },
        { code: "810000", name: "香港特别行政区", province: "81" },
        { code: "820000", name: "澳门特别行政区", province: "82" },
        { code: "330000", name: "浙江省", province: "33" },
      ],
      cityRows: [{ code: "330100", name: "杭州市", province: "33", city: "01" }],
    });

    const result = await syncChinaLocations({ version: "8.5.8", fetch, outputPath: outputPath() });

    expect(result).toEqual({ version: "8.5.8", provinces: 7, cities: 7 });
    const output = await readFile(outputPath(), "utf8");
    expect(output).toContain('{ code: "110000", name: "北京市", province: "北京市", aliases: ["北京", "帝都"] }');
    expect(output).toContain('{ code: "310000", name: "上海市", province: "上海市", aliases: ["上海", "魔都"] }');
    expect(output).toContain('{ code: "500000", name: "重庆市", province: "重庆市", aliases: ["重庆", "渝"] }');
    expect(output).toContain('{ code: "710000", name: "台北市", province: "台湾省", aliases: ["台北"] }');
    expect(output).toContain('{ code: "810000", name: "香港特别行政区", province: "香港特别行政区", aliases: ["香港", "HongKong", "HK"] }');
    expect(output).toContain('{ code: "820000", name: "澳门特别行政区", province: "澳门特别行政区", aliases: ["澳门", "Macao"] }');
  });

  it("adds compatibility aliases to an upstream municipality row instead of duplicating it", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [{ code: "110000", name: "北京市", province: "11" }],
      cityRows: [{ code: "110100", name: "北京市", province: "11", city: "01" }],
    });

    const result = await syncChinaLocations({ version: "8.5.8", fetch, outputPath: outputPath() });

    expect(result.cities).toBe(1);
    const output = await readFile(outputPath(), "utf8");
    expect(output).toContain('{ code: "110100", name: "北京市", province: "北京市", aliases: ["北京", "帝都"] }');
    expect(output).toMatch(/name: "北京市", province: "北京市"/g);
    expect(output.match(/name: "北京市", province: "北京市"/g)).toHaveLength(1);
  });

  it("merges legacy aliases into matching normal city rows without synthesizing new rows", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [
        { code: "220000", name: "吉林省", province: "22" },
        { code: "330000", name: "浙江省", province: "33" },
        { code: "530000", name: "云南省", province: "53" },
      ],
      cityRows: [
        { code: "222400", name: "延边朝鲜族自治州", province: "22", city: "24" },
        { code: "330100", name: "杭州市", province: "33", city: "01" },
        { code: "532900", name: "大理白族自治州", province: "53", city: "29" },
      ],
    });

    const result = await syncChinaLocations({ version: "8.5.8", fetch, outputPath: outputPath() });

    // Legacy aliases land on the matching normal (non-compatibility) city rows;
    // legacy keys without an upstream match never synthesize extra rows, and
    // suffix-free aliases (杭州) are preserved rather than suppressed.
    expect(result.cities).toBe(3);
    const output = await readFile(outputPath(), "utf8");
    expect(output).toContain('{ code: "222400", name: "延边朝鲜族自治州", province: "吉林省", aliases: ["延边"] }');
    expect(output).toContain('{ code: "532900", name: "大理白族自治州", province: "云南省", aliases: ["大理"] }');
    expect(output).toContain('{ code: "330100", name: "杭州市", province: "浙江省", aliases: ["杭州"] }');
    expect(output.match(/name: "延边朝鲜族自治州"/g)).toHaveLength(1);
    expect(output).not.toContain("敦煌市");
  });

  it("emits each legacy compatibility alias exactly once on its canonical prefecture", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [
        { code: "370000", name: "山东省", province: "37" },
        { code: "410000", name: "河南省", province: "41" },
        { code: "620000", name: "甘肃省", province: "62" },
        { code: "630000", name: "青海省", province: "63" },
        { code: "650000", name: "新疆维吾尔自治区", province: "65" },
      ],
      cityRows: [
        { code: "370100", name: "济南市", province: "37", city: "01" },
        { code: "410100", name: "郑州市", province: "41", city: "01" },
        { code: "620900", name: "酒泉市", province: "62", city: "09" },
        { code: "632800", name: "海西蒙古族藏族自治州", province: "63", city: "28" },
        { code: "653100", name: "喀什地区", province: "65", city: "31" },
        { code: "654000", name: "伊犁哈萨克自治州", province: "65", city: "40" },
      ],
    });

    const result = await syncChinaLocations({ version: "8.5.8", fetch, outputPath: outputPath() });

    // The five naturally-mapped legacy labels land as aliases on their canonical
    // upstream prefecture rows (codes stay upstream); 济源 has no natural upstream
    // prefecture, so it is synthesized as a standalone legacy compatibility row
    // with its official national code 419001.
    expect(result).toEqual({ version: "8.5.8", provinces: 5, cities: 7 });
    const output = await readFile(outputPath(), "utf8");
    expect(output).toContain('{ code: "370100", name: "济南市", province: "山东省", aliases: ["济南", "莱芜"] }');
    expect(output).toContain('{ code: "620900", name: "酒泉市", province: "甘肃省", aliases: ["酒泉", "敦煌"] }');
    expect(output).toContain('{ code: "632800", name: "海西蒙古族藏族自治州", province: "青海省", aliases: ["格尔木"] }');
    expect(output).toContain('{ code: "653100", name: "喀什地区", province: "新疆维吾尔自治区", aliases: ["喀什"] }');
    expect(output).toContain('{ code: "654000", name: "伊犁哈萨克自治州", province: "新疆维吾尔自治区", aliases: ["伊宁"] }');
    expect(output).toContain('{ code: "419001", name: "济源市", province: "河南省", aliases: ["济源"] }');
    // Every legacy compatibility alias appears exactly once in the generated catalog.
    for (const alias of ["莱芜", "敦煌", "格尔木", "喀什", "伊宁", "济源"]) {
      expect(output.match(new RegExp(`"${alias}"`, "g"))).toHaveLength(1);
    }
  });

  it("rejects a legacy compatibility code that collides with an existing row", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [{ code: "410000", name: "河南省", province: "41" }],
      // A pre-existing row claims the 济源 compatibility code 419001; uniqueness
      // must be asserted after compatibility AND legacy rows are added.
      cityRows: [{ code: "419001", name: "河南省直辖县级市", province: "41", city: "01" }],
    });

    await expect(syncChinaLocations({ fetch, outputPath: outputPath() })).rejects.toThrow(/duplicate city code/);
  });

  it("excludes province/region directly administered county-level placeholder rows from the city catalog", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [
        { code: "410000", name: "河南省", province: "41" },
        { code: "420000", name: "湖北省", province: "42" },
        { code: "460000", name: "海南省", province: "46" },
        { code: "650000", name: "新疆维吾尔自治区", province: "65" },
      ],
      cityRows: [
        { code: "410100", name: "郑州市", province: "41", city: "01" },
        // Upstream administrative placeholder buckets, NOT prefecture-level cities.
        { code: "419000", name: "河南省-省直辖县级行政区划", province: "41", city: "90" },
        { code: "429000", name: "湖北省-自治区直辖县级行政区划", province: "42", city: "90" },
        { code: "469000", name: "海南省-自治区直辖县级行政区划", province: "46", city: "90" },
        { code: "659000", name: "新疆维吾尔自治区-自治区直辖县级行政区划", province: "65", city: "90" },
      ],
    });

    const result = await syncChinaLocations({ version: "8.5.8", fetch, outputPath: outputPath() });

    // Real prefecture-level cities stay; rows whose name denotes directly
    // administered county-level divisions (contains 直辖县级行政区划) are
    // dropped so search never surfaces a fake "city". The 济源 legacy
    // compatibility row (official code 419001, distinct from the dropped 419000
    // placeholder) is synthesized because its 河南省 province is present.
    expect(result).toEqual({ version: "8.5.8", provinces: 4, cities: 2 });
    const output = await readFile(outputPath(), "utf8");
    expect(output).toContain('name: "郑州市"');
    expect(output).toContain('{ code: "419001", name: "济源市", province: "河南省", aliases: ["济源"] }');
    expect(output).not.toMatch(/name: ".*直辖县级行政区划/);
    expect(output).not.toContain("419000");
  });

  it("orders provinces and cities deterministically by code", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [
        { code: "440000", name: "广东省", province: "44" },
        { code: "330000", name: "浙江省", province: "33" },
      ],
      cityRows: [
        { code: "440300", name: "深圳市", province: "44", city: "03" },
        { code: "330200", name: "宁波市", province: "33", city: "02" },
        { code: "330100", name: "杭州市", province: "33", city: "01" },
      ],
    });

    await syncChinaLocations({ version: "8.5.8", fetch, outputPath: outputPath() });

    const output = await readFile(outputPath(), "utf8");
    const provinceCodes = [...output.slice(output.indexOf("chinaProvinces"), output.indexOf("chinaCities")).matchAll(/code: "(\d{6})"/g)].map((match) => match[1]);
    expect(provinceCodes).toEqual(["330000", "440000"]);
    const cityCodes = [...output.slice(output.indexOf("chinaCities")).matchAll(/code: "(\d{6})"/g)].map((match) => match[1]);
    expect(cityCodes).toEqual([...cityCodes].sort());
  });

  it("does not overwrite the existing catalog when upstream data is invalid", async () => {
    const existing = "// pre-existing catalog content\n";
    await writeFile(outputPath(), existing, "utf8");
    const { fetch } = makeRegistry({
      provinceRows: [{ code: "330000", name: "浙江省", province: "33" }],
      cityRows: [
        { code: "330100", name: "杭州市", province: "33", city: "01" },
        { code: "990100", name: "无主市", province: "99", city: "01" },
      ],
    });

    await expect(syncChinaLocations({ fetch, outputPath: outputPath() })).rejects.toThrow(/inconsistent with its code/);
    expect(await readFile(outputPath(), "utf8")).toBe(existing);
  });

  it("rejects a city whose explicit province does not match its code prefix", async () => {
    const existing = "// pre-existing catalog content\n";
    await writeFile(outputPath(), existing, "utf8");
    const { fetch } = makeRegistry({
      provinceRows: [{ code: "330000", name: "浙江省", province: "33" }],
      cityRows: [{ code: "330100", name: "杭州市", province: "99", city: "01" }],
    });

    await expect(syncChinaLocations({ fetch, outputPath: outputPath() })).rejects.toThrow(/province/);
    expect(await readFile(outputPath(), "utf8")).toBe(existing);
  });

  it("rejects duplicate province codes without touching the output file", async () => {
    const existing = "// keep me\n";
    await writeFile(outputPath(), existing, "utf8");
    const { fetch } = makeRegistry({
      provinceRows: [
        { code: "110000", name: "北京市", province: "11" },
        { code: "110000", name: "北京市(重复)", province: "11" },
      ],
      cityRows: [],
    });

    await expect(syncChinaLocations({ fetch, outputPath: outputPath() })).rejects.toThrow(/duplicate province code/);
    expect(await readFile(outputPath(), "utf8")).toBe(existing);
  });

  it("rejects duplicate city codes", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [{ code: "330000", name: "浙江省", province: "33" }],
      cityRows: [
        { code: "330100", name: "杭州市", province: "33", city: "01" },
        { code: "330100", name: "杭州市(重复)", province: "33", city: "01" },
      ],
    });

    await expect(syncChinaLocations({ fetch, outputPath: outputPath() })).rejects.toThrow(/duplicate city code/);
  });

  it("rejects a malformed province payload", async () => {
    const { fetch } = makeRegistry({
      files: {
        "package/dist/province.json": '{"code":"110000"}',
        "package/dist/city.json": "[]",
      },
    });

    await expect(syncChinaLocations({ fetch, outputPath: outputPath() })).rejects.toThrow(/province/);
  });

  it("rejects a tarball that is missing the city payload", async () => {
    const { fetch } = makeRegistry({
      files: {
        "package/dist/province.json": JSON.stringify([{ code: "330000", name: "浙江省", province: "33" }]),
      },
    });

    await expect(syncChinaLocations({ fetch, outputPath: outputPath() })).rejects.toThrow(/city\.json/);
  });

  it("rejects province rows with missing required fields", async () => {
    const { fetch } = makeRegistry({
      provinceRows: [{ code: "330000", name: "浙江省" }],
      cityRows: [],
    });

    await expect(syncChinaLocations({ fetch, outputPath: outputPath() })).rejects.toThrow(/missing province/);
  });
});
