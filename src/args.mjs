import { resolve } from "node:path";

export function parseArgs(argv, cwd = process.cwd()) {
  let chunkLines;
  let concurrency;
  let template;
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "-l" || token === "--lines") {
      chunkLines = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "-c" || token === "--concurrency") {
      concurrency = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "-t" || token === "--template") {
      template = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "-h" || token === "--help") {
      return { help: true };
    }
    if (token === "-" || !token.startsWith("-")) {
      positional.push(token);
    }
  }

  const inputPath = positional[0];
  const instructions = positional.length > 1 ? positional.slice(1).join(" ") : undefined;

  if (!inputPath) {
    return { help: true };
  }

  return {
    help: false,
    chunkLines,
    concurrency,
    template,
    instructions,
    inputPath,
    resolvedInputPath: inputPath === "-" ? "-" : resolve(cwd, inputPath),
  };
}

export function printHelp() {
  process.stdout.write(
    [
      "Usage:",
      "  pllm [-l <lines>] [-c <concurrency>] [-t <template>] <file> [instructions]",
      "  cat <file> | pllm [-l <lines>] [-c <concurrency>] [-t <template>] - [instructions]",
      "",
      "Options:",
      "  -l, --lines         Lines per chunk (default: 100)",
      "  -c, --concurrency   Max parallel subagents (default: 10)",
      "  -t, --template      Agent template name (default: chunker)",
      "  -h, --help          Show this help",
      "",
    ].join("\n")
  );
}
