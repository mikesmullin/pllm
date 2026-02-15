import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

function parseValue(rawValue) {
  const value = rawValue.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  }
  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}

function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    const idx = trimmed.indexOf(":");
    if (idx === -1) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    const raw = trimmed.slice(idx + 1);

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;
    if (raw.trim() === "") {
      parent[key] = {};
      stack.push({ indent, obj: parent[key] });
    } else {
      parent[key] = parseValue(raw);
    }
  }

  return root;
}

export async function loadConfig() {
  const configPath = resolve(projectRoot, "config.yaml");
  const raw = await readFile(configPath, "utf8");
  const parsed = parseSimpleYaml(raw);

  const defaults = parsed.defaults ?? {};
  const paths = parsed.paths ?? {};
  const subagent = parsed.subagent ?? {};

  return {
    configPath,
    projectRoot,
    chunkLines: Number(defaults.chunkLines ?? 100),
    concurrency: Number(defaults.concurrency ?? 10),
    template: String(defaults.template ?? "chunker"),
    instructions: String(defaults.instructions ?? ""),
    maxRetries: Number(defaults.maxRetries ?? 3),
    backoffMs: Number(defaults.backoffMs ?? 500),
    chunkDir: resolve(projectRoot, String(paths.chunkDir ?? "./.work/chunks")),
    outputDir: resolve(projectRoot, String(paths.outputDir ?? "./.work/outputs")),
    subagentCommand: String(
      subagent.command ??
        "cat \"$BUFFER\" | subd -t \"$TEMPLATE\" -i \"Read stdin chunk report and output only: (1) one concise summary sentence, (2) one comma-separated list of unique glossary keywords. $INSTRUCTIONS\""
    ),
  };
}
