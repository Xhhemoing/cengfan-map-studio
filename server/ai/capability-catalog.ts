import { isRecord } from "./agent-types";
import { AGENT_TOOLS, READ_ONLY_TOOLS } from "./tool-registry";
import { isSceneDomain, SCENE_DOMAIN_PROPS, SCENE_SCHEMAS, PROTECTED_SCENE_FIELDS, validateScenePatch } from "./patch-validator";

/** Discovery, not authorization. Actual edits still pass the browser's shadow/landing guards. */
export function buildCapabilityCatalog() {
  return {
    version: 1,
    execution: "browser-shadow-preview",
    approval: "existing-agent-risk-and-landing-policy",
    unsupported: ["export_file", "publish", "send_message", "run_code", "import_file"],
    scene: SCENE_DOMAIN_PROPS,
    sceneSchemas: SCENE_SCHEMAS,
    protectedFields: PROTECTED_SCENE_FIELDS,
    tools: AGENT_TOOLS.filter((tool) => tool.function.name !== "finish").map(({ function: fn }) => ({
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
      effect: READ_ONLY_TOOLS.has(fn.name) ? "read" : "preview-write",
      confirmation: ["manage_students", "auto_layout"].includes(fn.name) ? "context-dependent-high-risk" : "existing-policy",
    })),
  };
}

/** Small validator for the JSON-schema subset actually used in our tool registry. */
function schemaError(schema: Record<string, unknown>, value: unknown, path: string): string | null {
  if (schema.type === "object") {
    if (!isRecord(value)) return `${path} 必须是对象`;
    const props = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (required.some((key) => typeof key === "string" && !Object.hasOwn(value, key))) return `${path} 缺少必填字段`;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(props, key))) return `${path} 包含未知字段`;
    for (const [key, child] of Object.entries(value)) {
      const childSchema = props[key];
      if (isRecord(childSchema)) {
        const error = schemaError(childSchema, child, `${path}.${key}`);
        if (error) return error;
      }
    }
  }
  if (schema.type === "string" && (typeof value !== "string" || !value.trim())) return `${path} 必须是非空字符串`;
  if (schema.type === "boolean" && typeof value !== "boolean") return `${path} 必须是布尔值`;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return `${path} 不在允许值中`;
  return null;
}

export function isSafePlanValue(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 2048 && !/data:[^\s]{257,}/i.test(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every((item) => isSafePlanValue(item, depth + 1));
  return isRecord(value) && Object.keys(value).length <= 100 && Object.entries(value).every(([key, child]) =>
    !["__proto__", "prototype", "constructor"].includes(key) && isSafePlanValue(child, depth + 1));
}

export function validatePlannedArguments(name: string, args: unknown): string | null {
  const tool = AGENT_TOOLS.find((item) => item.function.name === name && name !== "finish");
  if (!tool || !isRecord(args) || !isSafePlanValue(args)) return "未知工具或不安全的参数";
  const error = schemaError(tool.function.parameters, args, name);
  if (error) return error;
  if (name === "inspect_project" && String(args.path).split(".").some((part) => !part || ["__proto__", "prototype", "constructor"].includes(part))) return "工程路径无效";
  if (name.startsWith("update_")) {
    const domain = name.slice(7);
    if (isSceneDomain(domain)) {
      const patch = args.patch === undefined ? args : args.patch;
      if (!isRecord(patch) || !Object.keys(patch).length) return "补丁必须是非空对象";
      if (args.patch !== undefined && !["update_text", "update_asset", "update_province"].includes(name) && Object.keys(args).some((key) => key !== "patch")) return "补丁包装包含未知字段";
      const checked = validateScenePatch(domain, patch);
      if (!checked.ok) return `补丁字段或值无效：${[...checked.error.unknownProps, ...checked.error.protectedProps, ...checked.error.invalidValues].join(",")}`;
    }
  }
  if (name === "manage_students") {
    if (args.action !== "remove_duplicate" && !args.studentId && !args.name) return "名单操作必须明确学生目标";
    if (args.action === "update_fact") {
      if (!isRecord(args.fields) || !Object.keys(args.fields).length) return "事实修改缺少字段";
      if (Object.entries(args.fields).some(([key, value]) => !["name", "university", "city"].includes(key) || typeof value !== "string" || !value.trim() || value.trim().length > 200)) return "事实修改字段或值无效";
    }
  }
  return null;
}
