const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function color(text, r, g, b) {
  if (!process.stderr.isTTY) {
    return text;
  }
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

function formatElapsedCompact(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  }
  return `${seconds}s`;
}

function formatMs(ms) {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  }
  return `${ms}ms`;
}

function formatBytesCompact(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${bytes}B`;
}

function truncateList(list, maxItems = 8) {
  if (list.length <= maxItems) {
    return list.join(",");
  }
  const shown = list.slice(0, maxItems).join(",");
  return `${shown},+${list.length - maxItems}`;
}

export function createProgressReporter({ totalChunks, concurrency, avgChunkBytes }) {
  const state = {
    totalChunks,
    concurrency,
    avgChunkBytes,
    startAt: Date.now(),
    started: 0,
    finished: 0,
    failed: 0,
    apiCalls: 0,
    lastRttMs: 0,
    runningIds: new Set(),
    retrying: new Map(),
    timer: undefined,
    lastLineLength: 0,
    spinnerIndex: 0,
  };

  function render() {
    const elapsed = formatElapsedCompact(Date.now() - state.startAt);
    const running = state.runningIds.size;
    const rttDisplay = state.lastRttMs > 0 ? formatMs(state.lastRttMs) : "-";
    const runningIds = [...state.runningIds].sort((a, b) => a - b);
    const retryEntries = [...state.retrying.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, info]) => `${id}:${info.retry}/${info.maxRetries}@${formatMs(info.backoffMs)}`);

    const spinner = SPINNER_FRAMES[state.spinnerIndex % SPINNER_FRAMES.length];
    state.spinnerIndex += 1;

    const line = [
      `${color(spinner, 120, 200, 255)} ${color("🚀", 80, 170, 255)} ${color(elapsed, 145, 205, 255)}`,
      `${color("⚙️", 120, 220, 140)} ${color(`${running}/${state.concurrency}`, 120, 220, 140)}`,
      `${color("📦", 255, 200, 110)} ${color(`${state.finished}/${state.totalChunks}`, 255, 200, 110)}`,
      `${color("🧪", 175, 145, 255)} ${color(`${state.started}`, 175, 145, 255)}`,
      `${color("❌", 255, 110, 110)} ${color(`${state.failed}`, 255, 110, 110)}`,
      `${color("📏", 255, 170, 230)} ${color(formatBytesCompact(state.avgChunkBytes), 255, 170, 230)}`,
      `${color("🤖", 120, 230, 255)} ${color(`${state.apiCalls}`, 120, 230, 255)}`,
      `${color("⏱️", 255, 215, 120)} ${color(rttDisplay, 255, 215, 120)}`,
      `${color("▶️", 150, 210, 255)} ${color(`[${truncateList(runningIds)}]`, 150, 210, 255)}`,
      `${color("🔁", 255, 170, 120)} ${color(`[${truncateList(retryEntries, 4)}]`, 255, 170, 120)}`,
    ].join(" | ");

    const visibleLength = stripAnsi(line).length;
    const clearPad = state.lastLineLength > visibleLength ? " ".repeat(state.lastLineLength - visibleLength) : "";
    process.stderr.write(`\r${line}${clearPad}`);
    state.lastLineLength = Math.max(state.lastLineLength, visibleLength);
  }

  return {
    start() {
      render();
      state.timer = setInterval(render, 120);
    },
    onChunkStart(chunk) {
      state.started += 1;
      state.runningIds.add(chunk.iteration);
      state.retrying.delete(chunk.iteration);
      render();
    },
    onApiCall(chunk) {
      state.apiCalls += 1;
      state.retrying.delete(chunk.iteration);
      render();
    },
    onApiDone(chunk, rttMs) {
      state.lastRttMs = rttMs;
      render();
    },
    onRetry(chunk, retry, maxRetries, backoffMs) {
      state.retrying.set(chunk.iteration, { retry, maxRetries, backoffMs });
      render();
    },
    onChunkDone(chunk, status) {
      state.finished += 1;
      if (status === "failed") {
        state.failed += 1;
      }
      state.runningIds.delete(chunk.iteration);
      state.retrying.delete(chunk.iteration);
      render();
    },
    stopAndClear() {
      if (state.timer) {
        clearInterval(state.timer);
      }
      process.stderr.write("\r\x1b[2K\r");
      state.lastLineLength = 0;
    },
  };
}
