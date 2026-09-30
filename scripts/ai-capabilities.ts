import { buildCapabilityCatalog } from "../server/ai/capability-catalog";

// Read-only discovery. No keys, network, project data or production writes.
const catalog = buildCapabilityCatalog();
if (process.argv.includes("--human")) {
  console.log("蹭饭图 AI 能力目录 v1（所有写入先进入影子预览）");
  for (const tool of catalog.tools) console.log(`${tool.name} [${tool.effect}] ${tool.description}`);
  console.log(`未提供的自动操作：${catalog.unsupported.join(", ")}`);
} else {
  console.log(JSON.stringify(catalog, null, 2));
}
