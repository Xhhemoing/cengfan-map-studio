/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_DEMO?: string;
}

declare module "*.geojson" {
  const value: {
    type: "FeatureCollection";
    features: unknown[];
  };
  export default value;
}

// ?raw imports return a JSON string for GeoJSON files in Vite.
declare module "*.geojson?raw" {
  const value: string;
  export default value;
}
