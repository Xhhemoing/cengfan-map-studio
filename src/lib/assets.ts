import { createId } from "./ids";

export type AssetKind = "background" | "regional" | "decoration" | "province-texture";
type StoredAssetKind = AssetKind | "scenery";

export interface SystemAsset {
  id: string;
  label: string;
  kind: AssetKind;
  src: string;
  provinceIds: string[];
  source: "system";
}

export interface UserAsset {
  id: string;
  label: string;
  kind: AssetKind;
  src: string;
  provinceIds: string[];
  source: "user";
  mattingApplied?: boolean;
}

export type StudioAsset = SystemAsset | UserAsset;

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const USER_ASSETS_KEY = "cengfan-map-studio:user-assets";

const SYSTEM_PROVINCE_TEXTURES: SystemAsset[] = [
  {
    id: "system-texture-beijing",
    label: "北京·城墙",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f8efe4"/><path d="M10 100 H110 V110 H10 Z" fill="#a65c3b"/><path d="M20 45 H100 L90 100 H30 Z" fill="#c27a52"/><rect x="35" y="60" width="12" height="20" fill="#7a3f27"/><rect x="73" y="60" width="12" height="20" fill="#7a3f27"/><circle cx="60" cy="28" r="10" fill="#e8b87d"/></svg>`),
    provinceIds: ["北京市"],
    source: "system",
  },
  {
    id: "system-texture-zhejiang",
    label: "浙江·西湖",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e8f4ef"/><circle cx="60" cy="60" r="34" fill="#9ed0bf"/><path d="M20 95 C40 75 80 75 100 95" stroke="#3f7d68" stroke-width="4" fill="none"/><path d="M25 30 L35 50 L45 30 Z" fill="#6bb39e"/><path d="M75 25 L85 45 L95 25 Z" fill="#6bb39e"/></svg>`),
    provinceIds: ["浙江省"],
    source: "system",
  },
  {
    id: "system-texture-sichuan",
    label: "四川·熊猫",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#eaf4ea"/><circle cx="60" cy="64" r="26" fill="#fff"/><circle cx="48" cy="46" r="10" fill="#333"/><circle cx="72" cy="46" r="10" fill="#333"/><circle cx="54" cy="60" r="4" fill="#333"/><circle cx="66" cy="60" r="4" fill="#333"/><ellipse cx="60" cy="70" rx="5" ry="3" fill="#333"/><path d="M40 85 Q60 100 80 85" stroke="#7cb342" stroke-width="4" fill="none"/></svg>`),
    provinceIds: ["四川省"],
    source: "system",
  },
  {
    id: "system-texture-guangdong",
    label: "广东·早茶",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff5f0"/><circle cx="40" cy="55" r="18" fill="#f4c29d"/><circle cx="80" cy="55" r="18" fill="#f4c29d"/><rect x="30" y="80" width="60" height="8" rx="2" fill="#d49a6a"/><circle cx="40" cy="50" r="3" fill="#8b5a2b"/><circle cx="80" cy="50" r="3" fill="#8b5a2b"/></svg>`),
    provinceIds: ["广东省"],
    source: "system",
  },
  {
    id: "system-texture-shandong",
    label: "山东·泰山",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f0f4ea"/><path d="M20 95 L50 30 L80 95 Z" fill="#9bb38e"/><path d="M55 95 L85 45 L110 95 Z" fill="#7fa070"/><circle cx="95" cy="25" r="10" fill="#f2d07a"/></svg>`),
    provinceIds: ["山东省"],
    source: "system",
  },
  {
    id: "system-texture-shaanxi",
    label: "陕西·兵马俑",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f4efe6"/><rect x="40" y="30" width="40" height="70" rx="8" fill="#bfa67a"/><circle cx="60" cy="48" r="10" fill="#bfa67a"/><rect x="48" y="55" width="24" height="4" fill="#8c7a55"/><rect x="45" y="72" width="30" height="4" fill="#8c7a55"/></svg>`),
    provinceIds: ["陕西省"],
    source: "system",
  },
  {
    id: "system-texture-yunnan",
    label: "云南·孔雀",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f2f8f4"/><path d="M30 60 Q45 30 60 60 Q75 30 90 60" stroke="#4a9b8c" stroke-width="5" fill="none"/><circle cx="60" cy="70" r="8" fill="#2e7d6e"/><circle cx="60" cy="70" r="3" fill="#f2d07a"/><path d="M40 85 Q60 105 80 85" stroke="#6bb39e" stroke-width="4" fill="none"/></svg>`),
    provinceIds: ["云南省"],
    source: "system",
  },
  {
    id: "system-texture-jiangsu",
    label: "江苏·园林",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f0f6f4"/><circle cx="60" cy="50" r="28" fill="#d4e6e1"/><path d="M30 95 H90 V105 H30 Z" fill="#8eac9e"/><path d="M40 55 H80" stroke="#5c8a7a" stroke-width="3"/><circle cx="60" cy="50" r="4" fill="#5c8a7a"/></svg>`),
    provinceIds: ["江苏省"],
    source: "system",
  },
  {
    id: "system-texture-hunan",
    label: "湖南·辣椒",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff5f5"/><path d="M40 30 C70 30 90 60 75 95 C60 95 45 80 35 55 C30 40 35 30 40 30" fill="#e74c3c"/><path d="M55 40 C80 45 95 70 80 95 C70 90 55 75 50 55" fill="#c0392b"/><circle cx="35" cy="55" r="3" fill="#2ecc71"/></svg>`),
    provinceIds: ["湖南省"],
    source: "system",
  },
  {
    id: "system-texture-xinjiang",
    label: "新疆·瓜果",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff9e6"/><circle cx="45" cy="55" r="22" fill="#2ecc71"/><circle cx="75" cy="55" r="22" fill="#f1c40f"/><path d="M40 45 H50 V50 H40 Z" fill="#333"/><path d="M70 45 H80 V50 H70 Z" fill="#333"/></svg>`),
    provinceIds: ["新疆维吾尔自治区"],
    source: "system",
  },
  {
    id: "system-texture-tibet",
    label: "西藏·雪山",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e8f2f8"/><path d="M10 95 L35 35 L60 95 Z" fill="#b8cdd9"/><path d="M45 95 L75 20 L105 95 Z" fill="#9bb8c9"/><circle cx="95" cy="25" r="8" fill="#fff"/></svg>`),
    provinceIds: ["西藏自治区"],
    source: "system",
  },
  {
    id: "system-texture-fujian",
    label: "福建·土楼",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f8f2e8"/><ellipse cx="60" cy="65" rx="38" ry="28" fill="#d9a87e"/><ellipse cx="60" cy="65" rx="24" ry="18" fill="#f3e3cd"/><ellipse cx="60" cy="65" rx="10" ry="8" fill="#b07d55"/></svg>`),
    provinceIds: ["福建省"],
    source: "system",
  },
  {
    id: "system-texture-henan",
    label: "河南·牡丹",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fdf2f4"/><circle cx="60" cy="60" r="18" fill="#e91e63"/><circle cx="45" cy="50" r="12" fill="#f06292"/><circle cx="75" cy="50" r="12" fill="#f06292"/><circle cx="45" cy="72" r="12" fill="#f06292"/><circle cx="75" cy="72" r="12" fill="#f06292"/><circle cx="60" cy="60" r="6" fill="#fff176"/></svg>`),
    provinceIds: ["河南省"],
    source: "system",
  },
  {
    id: "system-texture-hubei",
    label: "湖北·黄鹤楼",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f7f4ea"/><rect x="45" y="70" width="30" height="25" fill="#b56a43"/><rect x="40" y="55" width="40" height="15" fill="#c27a52"/><rect x="35" y="40" width="50" height="15" fill="#d49a6a"/><path d="M35 40 L60 20 L85 40 Z" fill="#8d4e32"/></svg>`),
    provinceIds: ["湖北省"],
    source: "system",
  },
  {
    id: "system-texture-liaoning",
    label: "辽宁·海浪",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#e8f4f8"/><path d="M0 70 C30 50 60 90 90 70 C105 60 120 75 120 75 V120 H0 Z" fill="#5dade2"/><path d="M0 90 C30 80 60 110 90 90 C105 85 120 95 120 95 V120 H0 Z" fill="#2e86c1"/></svg>`),
    provinceIds: ["辽宁省"],
    source: "system",
  },
  {
    id: "system-texture-heilongjiang",
    label: "黑龙江·冰雪",
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#eef7fb"/><circle cx="40" cy="40" r="12" fill="#fff"/><circle cx="80" cy="55" r="10" fill="#fff"/><circle cx="55" cy="80" r="14" fill="#fff"/><path d="M60 30 L63 45 L78 45 L66 54 L70 69 L60 60 L50 69 L54 54 L42 45 L57 45 Z" fill="#aed6f1"/></svg>`),
    provinceIds: ["黑龙江省"],
    source: "system",
  },
];

const ADDITIONAL_PROVINCE_FEATURES: Array<[id: string, province: string, label: string, color: string]> = [
  ["tianjin", "天津市", "海河", "#5b9bd5"], ["hebei", "河北省", "长城", "#82995d"], ["shanxi", "山西省", "古建", "#b67855"],
  ["inner-mongolia", "内蒙古自治区", "草原", "#79a96c"], ["jilin", "吉林省", "雾凇", "#86b9c9"], ["shanghai", "上海市", "外滩", "#6d8ec0"],
  ["anhui", "安徽省", "黄山", "#769d73"], ["jiangxi", "江西省", "瓷韵", "#7aa8a0"], ["guangxi", "广西壮族自治区", "山水", "#68a69b"],
  ["hainan", "海南省", "椰风", "#48aab2"], ["chongqing", "重庆市", "山城", "#a26b78"], ["guizhou", "贵州省", "苗岭", "#739c80"],
  ["gansu", "甘肃省", "飞天", "#c1905f"], ["qinghai", "青海省", "青湖", "#5b9fc0"], ["ningxia", "宁夏回族自治区", "枸杞", "#ae6f57"],
  ["taiwan", "台湾省", "山海", "#579fa1"], ["hong-kong", "香港特别行政区", "维港", "#7f7ab5"], ["macao", "澳门特别行政区", "海湾", "#a67b62"],
];

function createDefaultProvinceFeature([id, province, label, color]: typeof ADDITIONAL_PROVINCE_FEATURES[number]): SystemAsset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#f7faf8"/><circle cx="60" cy="54" r="33" fill="${color}" opacity=".22"/><path d="M18 88 C34 60 46 76 60 45 C74 76 86 60 102 88" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/><circle cx="60" cy="54" r="12" fill="${color}"/></svg>`;
  return {
    id: `system-texture-${id}`,
    label: `${province.replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/, "")}·${label}`,
    kind: "province-texture",
    src: "data:image/svg+xml," + encodeURIComponent(svg),
    provinceIds: [province],
    source: "system",
  };
}

const SYSTEM_ASSETS: SystemAsset[] = [
  {
    id: "system-scenery-mountain",
    label: "远山淡影",
    kind: "decoration",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" fill="#edf3e9"/><path d="M0 90 L40 50 L80 80 L120 35 L170 78 L210 45 L240 70 V120 H0Z" fill="#a8c7ad"/><circle cx="190" cy="30" r="16" fill="#f2d07a"/></svg>`),
    provinceIds: [],
    source: "system",
  },
  {
    id: "system-scenery-river",
    label: "江河水色",
    kind: "decoration",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" fill="#e8f3f6"/><path d="M0 70 C40 50 80 90 120 70 S200 50 240 75 V120 H0Z" fill="#7fb7c4"/><path d="M0 90 C50 80 90 110 140 90 S210 80 240 95 V120 H0Z" fill="#5e9eae" opacity=".7"/></svg>`),
    provinceIds: [],
    source: "system",
  },
  {
    id: "system-regional-zhejiang",
    label: "浙江·西湖剪影",
    kind: "regional",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="12" fill="#e8f4ef"/><circle cx="60" cy="58" r="28" fill="#9ed0bf"/><path d="M20 90 C40 70 80 70 100 90" stroke="#3f7d68" stroke-width="4" fill="none"/></svg>`),
    provinceIds: ["浙江省"],
    source: "system",
  },
  {
    id: "system-regional-beijing",
    label: "北京·城门剪影",
    kind: "regional",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="12" fill="#f8efe4"/><path d="M20 80 H100 V92 H20Z M30 50 H90 L80 80 H40Z" fill="#b56a43"/><rect x="54" y="60" width="12" height="20" fill="#7a3f27"/></svg>`),
    provinceIds: ["北京市"],
    source: "system",
  },
  {
    id: "system-background-paper",
    label: "宣纸底纹",
    kind: "background",
    src: "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><defs><pattern id="p" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 18H18M18 0V18" stroke="#e7dccb" stroke-width="1"/></pattern></defs><rect width="240" height="160" fill="#fbf6ee"/><rect width="240" height="160" fill="url(#p)" opacity=".55"/></svg>`),
    provinceIds: [],
    source: "system",
  },
];

const CACHED_SYSTEM_ASSETS: SystemAsset[] = [
  ...SYSTEM_PROVINCE_TEXTURES,
  ...ADDITIONAL_PROVINCE_FEATURES.map(createDefaultProvinceFeature),
  ...SYSTEM_ASSETS,
].map((asset) => ({ ...asset, provinceIds: [...asset.provinceIds] }));

export function listSystemAssets(): SystemAsset[] {
  // Historical landmark/decorative records remain migratable, but invalid built-ins
  // are no longer offered for new projects.
  return CACHED_SYSTEM_ASSETS
    .filter((asset) => asset.kind !== "regional" && asset.kind !== "decoration")
    .map((asset) => ({ ...asset, provinceIds: [...asset.provinceIds] }));
}

export function createUserAsset(input: {
  label: string;
  src: string;
  kind: AssetKind;
  provinceIds?: string[];
  mattingApplied?: boolean;
}): UserAsset {
  return {
    id: createId("asset-user"),
    label: input.label.trim() || "未命名素材",
    src: input.src,
    kind: input.kind,
    provinceIds: Array.isArray(input.provinceIds)
      ? input.provinceIds.filter((province) => typeof province === "string" && province)
      : [],
    source: "user",
    ...(input.mattingApplied ? { mattingApplied: true } : {}),
  };
}

export function saveUserAssets(
  assets: UserAsset[],
  storage: StorageAdapter = localStorage,
): void {
  storage.setItem(USER_ASSETS_KEY, JSON.stringify(assets));
}

export function loadUserAssets(
  storage: StorageAdapter = localStorage,
): UserAsset[] {
  const raw = storage.getItem(USER_ASSETS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Omit<UserAsset, "kind"> & { kind?: StoredAssetKind }>;
    if (!Array.isArray(parsed)) return [];
    const assets: UserAsset[] = [];
    const ids = new Set<string>();
    const byContent = new Map<string, UserAsset>();
    for (const item of parsed) {
      if (!item || typeof item.id !== "string" || typeof item.src !== "string" || !item.src || ids.has(item.id)) continue;
      ids.add(item.id);
      const kind = item.kind === "background" || item.kind === "regional" || item.kind === "province-texture" ? item.kind : "decoration";
      const provinces = Array.isArray(item.provinceIds)
        ? [...new Set(item.provinceIds.filter((province): province is string => typeof province === "string" && Boolean(province)))]
        : [];
      const contentKey = `${kind}\0${item.src}`;
      const existing = byContent.get(contentKey);
      if (existing) {
        existing.provinceIds = [...new Set([...existing.provinceIds, ...provinces])];
        continue;
      }
      const asset: UserAsset = {
        id: item.id,
        label: typeof item.label === "string" ? item.label : "未命名素材",
        src: item.src,
        kind,
        provinceIds: provinces,
        source: "user",
        ...(item.mattingApplied === true ? { mattingApplied: true } : {}),
      };
      assets.push(asset);
      byContent.set(contentKey, asset);
    }
    return assets;
  } catch {
    return [];
  }
}
