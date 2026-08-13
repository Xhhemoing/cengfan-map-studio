import chinaFeatures from "../assets/china.geojson?raw";

/**
 * Lazily parsed once per page load; every consumer shares the same normalized
 * feature list instead of JSON.parse-ing the 582KB GeoJSON on each call.
 */
let cachedMapFeatures: MapFeature[] | null = null;

export function getChinaMapFeatures(): MapFeature[] {
  if (cachedMapFeatures) return cachedMapFeatures;
  const collection = JSON.parse(chinaFeatures) as unknown as { features: RawMapFeature[] };
  cachedMapFeatures = normalizeMapFeatures(collection.features);
  return cachedMapFeatures;
}

export type Position = [number, number];

export interface RawMapFeature {
  type: "Feature";
  properties?: {
    adcode?: number | string;
    name?: string;
    center?: Position;
    centroid?: Position;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
}

export interface MapFeature extends RawMapFeature {
  id: string;
  name: string;
  shortName: string;
  center: Position;
}

const suffixes = ["特别行政区", "维吾尔自治区", "壮族自治区", "回族自治区", "自治区", "省", "市"];

export function toShortProvinceName(name: string): string {
  return suffixes.reduce((shortName, suffix) => shortName.replace(suffix, ""), name);
}

export function normalizeMapFeatures(features: RawMapFeature[]): MapFeature[] {
  return features.flatMap((feature) => {
    const name = feature.properties?.name?.trim();
    const center = feature.properties?.center ?? feature.properties?.centroid;
    const adcode = feature.properties?.adcode;

    if (!name || !center || !adcode) {
      return [];
    }

    return [
      {
        ...feature,
        id: String(adcode),
        name,
        shortName: toShortProvinceName(name),
        center,
      },
    ];
  });
}

export function findProvinceFeature(
  features: readonly MapFeature[],
  province: string,
): MapFeature | undefined {
  const normalized = province.trim();
  if (!normalized) return undefined;
  return features.find((feature) =>
    feature.name === normalized
    || feature.shortName === normalized
    || toShortProvinceName(normalized) === feature.shortName,
  );
}

export function getProvinceNames(): string[] {
  return getChinaMapFeatures().map((feature) => feature.name);
}

/** Province-level land adjacency used to keep automatically inferred fills distinguishable. */
export const CHINA_PROVINCE_ADJACENCY: Record<string, readonly string[]> = {
  北京市: ["天津市", "河北省"],
  天津市: ["北京市", "河北省"],
  河北省: ["北京市", "天津市", "辽宁省", "内蒙古自治区", "山西省", "河南省", "山东省"],
  山西省: ["河北省", "内蒙古自治区", "陕西省", "河南省"],
  内蒙古自治区: ["黑龙江省", "吉林省", "辽宁省", "河北省", "山西省", "陕西省", "宁夏回族自治区", "甘肃省"],
  辽宁省: ["吉林省", "内蒙古自治区", "河北省"],
  吉林省: ["黑龙江省", "内蒙古自治区", "辽宁省"],
  黑龙江省: ["内蒙古自治区", "吉林省"],
  上海市: ["江苏省", "浙江省"],
  江苏省: ["山东省", "安徽省", "浙江省", "上海市"],
  浙江省: ["上海市", "江苏省", "安徽省", "江西省", "福建省"],
  安徽省: ["江苏省", "浙江省", "江西省", "湖北省", "河南省", "山东省"],
  福建省: ["浙江省", "江西省", "广东省"],
  江西省: ["安徽省", "浙江省", "福建省", "广东省", "湖南省", "湖北省"],
  山东省: ["河北省", "河南省", "安徽省", "江苏省"],
  河南省: ["河北省", "山西省", "陕西省", "湖北省", "安徽省", "山东省"],
  湖北省: ["河南省", "安徽省", "江西省", "湖南省", "重庆市", "陕西省"],
  湖南省: ["湖北省", "江西省", "广东省", "广西壮族自治区", "贵州省", "重庆市"],
  广东省: ["福建省", "江西省", "湖南省", "广西壮族自治区", "香港特别行政区", "澳门特别行政区"],
  广西壮族自治区: ["广东省", "湖南省", "贵州省", "云南省"],
  海南省: [],
  重庆市: ["湖北省", "湖南省", "贵州省", "四川省", "陕西省"],
  四川省: ["重庆市", "贵州省", "云南省", "西藏自治区", "青海省", "甘肃省", "陕西省"],
  贵州省: ["湖南省", "广西壮族自治区", "云南省", "四川省", "重庆市"],
  云南省: ["广西壮族自治区", "贵州省", "四川省", "西藏自治区"],
  西藏自治区: ["新疆维吾尔自治区", "青海省", "四川省", "云南省"],
  陕西省: ["内蒙古自治区", "山西省", "河南省", "湖北省", "重庆市", "四川省", "甘肃省", "宁夏回族自治区"],
  甘肃省: ["内蒙古自治区", "宁夏回族自治区", "陕西省", "四川省", "青海省", "新疆维吾尔自治区"],
  青海省: ["新疆维吾尔自治区", "甘肃省", "四川省", "西藏自治区"],
  宁夏回族自治区: ["内蒙古自治区", "陕西省", "甘肃省"],
  新疆维吾尔自治区: ["甘肃省", "青海省", "西藏自治区"],
  香港特别行政区: ["广东省"],
  澳门特别行政区: ["广东省"],
  台湾省: [],
};
