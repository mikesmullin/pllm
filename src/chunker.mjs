import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

function countWords(text) {
  const tokens = text.trim().match(/\S+/g);
  return tokens ? tokens.length : 0;
}

async function writeChunk(chunkDir, lines, iteration, sourceLabel, lineStart, lineEnd) {
  const textBody = `${lines.join("\n")}\n`;
  const textSha1 = createHash("sha1").update(textBody).digest("hex");
  const wordCount = countWords(textBody);
  const byteCount = Buffer.byteLength(textBody, "utf8");

  const metadataHeader = [
    "### CHUNK_METADATA",
    `source_file: ${sourceLabel}`,
    `line_range: ${lineStart}-${lineEnd}`,
    `chunk_index: ${iteration}`,
    `line_count: ${lines.length}`,
    `word_count: ${wordCount}`,
    `byte_count: ${byteCount}`,
    `chunk_sha1: ${textSha1}`,
    "### CHUNK_TEXT",
    "",
    "### REPORT_FORMAT",
    `report_id: ${sourceLabel}:${lineStart}-${lineEnd}`,
    "summary: ",
    "keywords: ",
    "",
  ].join("\n");

  const content = `${metadataHeader}${textBody}`;
  const fileSha1 = createHash("sha1").update(content).digest("hex");
  const filePath = resolve(chunkDir, `${fileSha1}.txt`);
  const writer = createWriteStream(filePath, { encoding: "utf8" });

  await new Promise((resolveWrite, rejectWrite) => {
    writer.on("error", rejectWrite);
    writer.on("finish", resolveWrite);
    writer.end(content);
  });

  return {
    iteration,
    path: filePath,
    sha1: fileSha1,
    sourceFile: sourceLabel,
    lineStart,
    lineEnd,
    lineCount: lines.length,
    wordCount,
    byteCount,
    chunkTextSha1: textSha1,
  };
}

export async function splitIntoChunkFiles({ inputPath, chunkLines, chunkDir }) {
  await mkdir(chunkDir, { recursive: true });

  const stream = inputPath === "-" ? process.stdin : createReadStream(inputPath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });

  const chunks = [];
  let buffer = [];
  let iteration = 0;
  let lineNumber = 0;
  let rangeStart = 1;
  const sourceLabel = inputPath === "-" ? "stdin" : inputPath;

  for await (const line of reader) {
    lineNumber += 1;
    buffer.push(line);
    if (buffer.length >= chunkLines) {
      chunks.push(await writeChunk(chunkDir, buffer, iteration, sourceLabel, rangeStart, lineNumber));
      buffer = [];
      iteration += 1;
      rangeStart = lineNumber + 1;
    }
  }

  if (buffer.length > 0) {
    chunks.push(await writeChunk(chunkDir, buffer, iteration, sourceLabel, rangeStart, lineNumber));
  }

  return chunks;
}
