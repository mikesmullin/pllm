#!/usr/bin/env bun
import { mkdir, rm } from "node:fs/promises";
import { parseArgs, printHelp } from "./args.mjs";
import { splitIntoChunkFiles } from "./chunker.mjs";
import { loadConfig } from "./config.mjs";
import { streamOrderedOutputs } from "./output.mjs";
import { createProgressReporter } from "./progress.mjs";
import { processChunk, processChunksWithConcurrency } from "./subagent.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const config = await loadConfig();
  const chunkLines = Number(args.chunkLines ?? config.chunkLines);
  const concurrency = Number(args.concurrency ?? config.concurrency);
  const template = String(args.template ?? config.template);
  const instructions = String(args.instructions ?? config.instructions ?? "");

  if (!Number.isInteger(chunkLines) || chunkLines <= 0) {
    throw new Error(`Invalid chunk line count: ${chunkLines}`);
  }

  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error(`Invalid concurrency: ${concurrency}`);
  }

  await mkdir(config.outputDir, { recursive: true });
  await rm(config.outputDir, { recursive: true, force: true });
  await mkdir(config.outputDir, { recursive: true });

  const chunks = await splitIntoChunkFiles({
    inputPath: args.resolvedInputPath,
    chunkLines,
    chunkDir: config.chunkDir,
  });

  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteCount, 0);
  const avgChunkBytes = chunks.length > 0 ? Math.round(totalBytes / chunks.length) : 0;
  const progress = createProgressReporter({
    totalChunks: chunks.length,
    concurrency,
    avgChunkBytes,
  });
  progress.start();

  try {
    await processChunksWithConcurrency(chunks, concurrency, async (chunk) => {
      progress.onChunkStart(chunk);
      const result = await processChunk({
        chunk,
        template,
        instructions,
        outputDir: config.outputDir,
        subagentCommand: config.subagentCommand,
        maxRetries: config.maxRetries,
        backoffMs: config.backoffMs,
        progress,
      });
      progress.onChunkDone(chunk, result.status);
    });
  } finally {
    progress.stopAndClear();
  }

  await streamOrderedOutputs(config.outputDir);
  await rm(config.chunkDir, { recursive: true, force: true });
  await rm(config.outputDir, { recursive: true, force: true });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    process.stderr.write(`${error?.stack ?? String(error)}\n`);
    process.exit(1);
  });
