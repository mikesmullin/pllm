import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

function pipeFileToStdout(path) {
  return new Promise((resolvePipe, rejectPipe) => {
    const reader = createReadStream(path);
    reader.on("error", rejectPipe);
    reader.on("end", resolvePipe);
    reader.pipe(process.stdout, { end: false });
  });
}

export async function streamOrderedOutputs(outputDir) {
  const files = await readdir(outputDir);
  const ordered = files
    .filter((name) => name.endsWith(".out"))
    .map((name) => ({ name, index: Number(name.replace(/\.out$/, "")) }))
    .filter((entry) => Number.isFinite(entry.index))
    .sort((a, b) => a.index - b.index);

  for (let i = 0; i < ordered.length; i++) {
    if (i > 0) process.stdout.write("---\n");
    await pipeFileToStdout(resolve(outputDir, ordered[i].name));
  }
}
