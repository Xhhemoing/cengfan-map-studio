import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const DEFAULT_API_PORT = 8787;

function resolveApiPort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_API_PORT;
}

function resolvePublicBasePath(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/" || trimmed === "./") return "/";
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = resolveApiPort(process.env.API_PORT ?? process.env.PORT ?? env.API_PORT ?? env.PORT);
  return {
  plugins: [react()],
  base: resolvePublicBasePath(process.env.BASE_PATH ?? env.BASE_PATH),
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name(moduleId: string): string | null {
                if (/node_modules\/(react|react-dom|scheduler)\//.test(moduleId)) return "react-vendor";
                return null;
              },
            },
            {
              name(moduleId: string): string | null {
                if (/node_modules\/(@mui|@emotion)\//.test(moduleId)) return "mui-vendor";
                return null;
              },
            },
            {
              name(moduleId: string): string | null {
                if (/node_modules\/(d3-geo|d3-array|d3-dsv|internmap|pinyin-pro|lucide-react)\//.test(moduleId)) return "vendor";
                return null;
              },
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "server/**/*.test.ts", "scripts/**/*.test.ts"],
    testTimeout: 20_000,
  },
  };
});
