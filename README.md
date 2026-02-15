# pllm

CLI for bulk processing using parallel subagents (like [subd](https://github.com/mikesmullin/subd)).

## Motivation

Often you want to bulk-process a (large) list (incl. big data), and could safely use one subagent per item to do so.  
With this tool, you no longer find yourself writing a bespoke solution/script for each individual situation.  
You can instead focus on the unique parts: the reusable agent template, and any extra prompt instructions for this case.

Use to analyze a large corpus of knowledge, refine/correlate long lists of emails, dispatch a backlog of outputs, etc.

## Install

```bash
bun link
```

# CLI Usage

```bash
$ pllm --help

Usage:
  pllm [-l <lines>] [-c <concurrency>] [-t <template>] <file> [instructions]
  cat <file> | pllm [-l <lines>] [-c <concurrency>] [-t <template>] - [instructions]

Options:
  -l, --lines         Lines per chunk (default: 100)
  -c, --concurrency   Max parallel subagents (default: 10)
  -t, --template      Agent template name (default: chunker)
  -h, --help          Show this help
```

## Example Usage

For example, process [Alice in Wonderland](https://www.gutenberg.org/files/11/11-0.txt).

`cat alice.txt | pllm -l 100 -c 10 -t chunker - "Focus only on anthropomorphized characters (talking/acting animals or personified beings); ignore purely human-centric details unless directly tied to those characters."`

Where `chunker.yaml` (subd agent template) might look like:
```yaml
---
apiVersion: daemon/v1
kind: Agent
metadata:
  name: chunker
  description: Summarizes a chunk of source text using stdin metadata and content.
  model: xai:grok-4-fast-reasoning
  labels:
    - subagent
spec:
  system_prompt: |
    You summarize chunked source text for downstream aggregation.

    The full input arrives via stdin and includes two sections:
    1) `CHUNK_METADATA` lines containing source_file, line_range, chunk_index, and counters.
    2) `CHUNK_TEXT` with the actual source lines for this chunk.

    Input:
    <stdin>
    ```
    <%= await readStdin() %>
    ```
    </stdin>

    Output rules (strict):
    - Return exactly 2 lines.
    - Line 1: one concise summary sentence about this chunk.
    - Line 2: `keywords: <comma-separated unique keywords>`.
    - Prefer content-bearing nouns/terms and omit filler/common words.
    - Do not repeat metadata prefixes; they are provided by the caller.
    - Do not add extra sections, bullets, or commentary.
```

Producing output like:
```yaml
/home/user/Documents/alice.txt:1-100: (summarizing 783 words, 4373 bytes)
Alice falls deeper into the rabbit hole, chats about her cat Dinah, lands in a locked hall, finds a tiny key and "DRINK ME" bottle, drinks it, and shrinks to ten inches high to enter a garden.
keywords: Alice, rabbit hole, Dinah, cat, bats, hall, doors, key, curtain, garden, bottle, drink me, poison, shrink, telescope
---
/home/user/Documents/alice.txt:101-200: (summarizing 1046 words, 5618 bytes)
Alice falls endlessly down the rabbit hole, converses with herself about her cat Dinah and bats, lands in a dimly lit hall, chases the White Rabbit, discovers locked doors and a tiny golden key, finds a small door to a lovely garden she cannot enter, drinks from a "DRINK ME" bottle, and shrinks to ten inches high like a telescope.
keywords: Alice, rabbit hole, Dinah, cat, bats, White Rabbit, hall, doors, golden key, small door, garden, bottle, Drink Me, shrink, telescope
---
...
```

## Configuration

[config.yaml](./config.yaml) is loaded relative to this package location (not current working directory).

| Field | Purpose |
|-------|---------|
| `defaults.chunkLines` | Chunk size (in lines) |
| `defaults.concurrency` | Max parallel subagents |
| `defaults.template` | Agent name to invoke |
| `defaults.instructions` | (optional) Extra prompt guidance injected to subagent cmd via `$INSTRUCTIONS` var |
| `defaults.maxRetries` | Retry attempts on subagent failure |
| `defaults.backoffMs` | Initial backoff delay for retries |
| `paths.chunkDir` | Directory for temporary chunk files |
| `paths.outputDir` | Directory for subagent output files |
| `subagent.command` | Shell command template (supports `$BUFFER`, `$TEMPLATE`, `$INSTRUCTIONS`) |

If a subagent call exits non-zero, `pllm` retries up to `defaults.maxRetries` with exponential backoff from `defaults.backoffMs`.
