import { spawn } from "node:child_process";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function substituteTemplate(template, values) {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`$${key}`, String(value));
  }
  return output;
}

async function runCommand(command, env) {
  return await new Promise((resolveRun) => {
    const child = spawn(command, {
      shell: true,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolveRun({ code: Number(code ?? 1), stdout, stderr });
    });
  });
}

export async function processChunk({
  chunk,
  template,
  instructions,
  outputDir,
  subagentCommand,
  maxRetries,
  backoffMs,
  progress,
}) {
  await mkdir(outputDir, { recursive: true });

  const outputPath = resolve(outputDir, `${chunk.iteration}.out`);
  const templateVars = {
    BUFFER: chunk.path,
    TEMPLATE: template,
    INSTRUCTIONS: instructions ?? "",
  };

  const command = substituteTemplate(subagentCommand, templateVars);

  let attempt = 0;
  while (attempt <= maxRetries) {
    progress?.onApiCall?.(chunk);
    const apiStartMs = Date.now();
    const result = await runCommand(command, templateVars);
    const apiRttMs = Date.now() - apiStartMs;
    progress?.onApiDone?.(chunk, apiRttMs);
    if (result.code === 0) {
      const structured = [
        `${chunk.sourceFile}:${chunk.lineStart}-${chunk.lineEnd}: (summarizing ${chunk.wordCount} words, ${chunk.byteCount} bytes)`,
        result.stdout.trim(),
        "",
      ].join("\n");
      await writeFile(outputPath, structured, "utf8");
      await appendFile(chunk.path, `\n\n### SUBAGENT_OUTPUT\n${structured}`, "utf8");
      await rm(chunk.path, { force: true });
      return { status: "success", attempts: attempt + 1 };
    }

    if (attempt === maxRetries) {
      const failure = [
        `FAILED: chunk ${chunk.iteration} could not be completed successfully after ${maxRetries + 1} attempts.`,
        "----- STDOUT -----",
        result.stdout,
        "----- STDERR -----",
        result.stderr,
        "",
      ].join("\n");
      await writeFile(outputPath, failure, "utf8");
      await appendFile(chunk.path, `\n\n### SUBAGENT_OUTPUT\n${failure}`, "utf8");
      await rm(chunk.path, { force: true });
      return { status: "failed", attempts: attempt + 1 };
    }

    const waitMs = backoffMs * 2 ** attempt;
    progress?.onRetry?.(chunk, attempt + 1, maxRetries, waitMs);
    await delay(waitMs);
    attempt += 1;
  }

  return { status: "failed", attempts: maxRetries + 1 };
}

export async function processChunksWithConcurrency(chunks, limit, worker) {
  const queue = [...chunks];
  const running = new Set();

  async function runOne(chunk) {
    await worker(chunk);
  }

  while (queue.length > 0 || running.size > 0) {
    while (queue.length > 0 && running.size < limit) {
      const chunk = queue.shift();
      const promise = runOne(chunk).finally(() => running.delete(promise));
      running.add(promise);
    }

    if (running.size > 0) {
      await Promise.race(running);
    }
  }
}
