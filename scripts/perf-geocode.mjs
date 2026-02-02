#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import { performance } from 'node:perf_hooks';

const DEFAULT_URL = 'http://127.0.0.1:8787/v1/geocode';
const DEFAULT_ORIGIN = 'http://localhost:3000';
const DEFAULT_TEXT = 'Riyadh, Saudi Arabia';

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, true);
      continue;
    }

    args.set(key, next);
    i += 1;
  }
  return args;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.ceil(p * sorted.length) - 1;
  const safeIndex = Math.min(Math.max(index, 0), sorted.length - 1);
  return sorted[safeIndex];
}

function formatMs(value) {
  if (value == null) {
    return 'n/a';
  }
  return value.toFixed(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadInputsFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function printHelp() {
  console.log(`Usage: node scripts/perf-geocode.mjs [options]

Options:
  --url <url>           Geocode endpoint (default: ${DEFAULT_URL})
  --origin <origin>     Origin header (default: ${DEFAULT_ORIGIN})
  --api-key <key>       API key (or set API_KEY / GEOCODE_API_KEY)
  --text <text>         Location text (default: ${DEFAULT_TEXT})
  --inputs-file <path>  File with one input per line (overrides --text)
  --runs <n>            Total measured requests (default: 30)
  --warmup <n>          Warmup requests (default: 1)
  --concurrency <n>     Parallel requests (default: 1)
  --pace-ms <ms>        Delay between batches to avoid rate limits (default: 0)
  --timeout <ms>        Client timeout per request (default: 12000)
  --help                Show this message
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.get('help')) {
  printHelp();
  process.exit(0);
}

const url = args.get('url') ?? process.env.GEOCODE_URL ?? DEFAULT_URL;
const origin = args.get('origin') ?? process.env.GEOCODE_ORIGIN ?? DEFAULT_ORIGIN;
const apiKey =
  args.get('api-key') ?? process.env.GEOCODE_API_KEY ?? process.env.API_KEY;
const text = args.get('text') ?? process.env.GEOCODE_TEXT ?? DEFAULT_TEXT;
const inputsFile = args.get('inputs-file');

const runs = Math.max(1, toInt(args.get('runs') ?? 30, 30));
const warmup = Math.max(0, toInt(args.get('warmup') ?? 1, 1));
const concurrency = Math.max(1, toInt(args.get('concurrency') ?? 1, 1));
const paceMs = Math.max(0, toInt(args.get('pace-ms') ?? 0, 0));
const timeoutMs = Math.max(1000, toInt(args.get('timeout') ?? 12000, 12000));

if (!apiKey) {
  console.error(
    'Missing API key. Provide --api-key or set API_KEY/GEOCODE_API_KEY.'
  );
  process.exit(1);
}

let inputs = [text];
if (inputsFile) {
  try {
    inputs = await loadInputsFile(inputsFile);
  } catch (error) {
    console.error(
      `Failed to read inputs file: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
    process.exit(1);
  }
}

if (inputs.length === 0) {
  console.error('Inputs file is empty. Provide at least one input line.');
  process.exit(1);
}

async function fetchOnce(inputText) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const payload = JSON.stringify({ text: inputText });
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        origin,
      },
      body: payload,
      signal: controller.signal,
    });

    let parsed = null;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      parsed = await response.json();
    } else {
      await response.arrayBuffer();
    }

    const durationMs = performance.now() - start;
    return {
      ok: response.ok,
      status: response.status,
      durationMs,
      cacheHit: parsed?.cache?.hit,
      normalizedKey: parsed?.normalizedKey,
    };
  } catch (error) {
    const durationMs = performance.now() - start;
    return {
      ok: false,
      status: 0,
      durationMs,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown client error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runBatch(batchTexts) {
  const tasks = [];
  for (const inputText of batchTexts) {
    tasks.push(fetchOnce(inputText));
  }

  const settled = await Promise.allSettled(tasks);
  return settled.map((result) =>
    result.status === 'fulfilled'
      ? result.value
      : {
          ok: false,
          status: 0,
          durationMs: 0,
          error: 'Unhandled promise rejection',
        }
  );
}

for (let i = 0; i < warmup; i += 1) {
  const inputText = inputs[i % inputs.length];
  await fetchOnce(inputText);
}

const results = [];
for (let i = 0; i < runs; i += concurrency) {
  const batchSize = Math.min(concurrency, runs - i);
  const batchTexts = [];
  for (let offset = 0; offset < batchSize; offset += 1) {
    batchTexts.push(inputs[(i + offset) % inputs.length]);
  }
  const batchResults = await runBatch(batchTexts);
  results.push(...batchResults);
  if (paceMs > 0 && i + batchSize < runs) {
    await sleep(paceMs);
  }
}

const okResults = results.filter((result) => result.ok);
const durations = okResults.map((result) => result.durationMs).sort((a, b) => a - b);

const statusCounts = new Map();
const cacheCounts = new Map();
const normalizedKeys = new Set();

for (const result of results) {
  statusCounts.set(
    result.status,
    (statusCounts.get(result.status) ?? 0) + 1
  );

  if (typeof result.cacheHit === 'boolean') {
    cacheCounts.set(result.cacheHit, (cacheCounts.get(result.cacheHit) ?? 0) + 1);
  }

  if (result.normalizedKey) {
    normalizedKeys.add(result.normalizedKey);
  }
}

const mean = durations.length
  ? durations.reduce((sum, value) => sum + value, 0) / durations.length
  : null;

const p50 = percentile(durations, 0.5);
const p95 = percentile(durations, 0.95);
const p99 = percentile(durations, 0.99);
const min = durations.length ? durations[0] : null;
const max = durations.length ? durations[durations.length - 1] : null;

console.log('Geocode performance results');
console.log(`URL: ${url}`);
console.log(`Origin: ${origin}`);
if (inputsFile) {
  console.log(`Inputs: ${inputsFile} (${inputs.length} entries)`);
} else {
  console.log(`Text: ${text}`);
}
console.log(`Runs: ${runs} (warmup ${warmup}, concurrency ${concurrency})`);
if (paceMs > 0) {
  console.log(`Pace: ${paceMs} ms between batches`);
}
console.log(`Success: ${okResults.length}, Failed: ${runs - okResults.length}`);
console.log(
  `Latency (ms, ok only): min ${formatMs(min)}, p50 ${formatMs(p50)}, p95 ${formatMs(
    p95
  )}, p99 ${formatMs(p99)}, max ${formatMs(max)}, mean ${formatMs(mean)}`
);

if (cacheCounts.size > 0) {
  const hit = cacheCounts.get(true) ?? 0;
  const miss = cacheCounts.get(false) ?? 0;
  console.log(`Cache hits: ${hit}, misses: ${miss}`);
}

if (normalizedKeys.size === 1) {
  const [onlyKey] = normalizedKeys;
  console.log(`Normalized key: ${onlyKey}`);
} else if (normalizedKeys.size > 1) {
  console.log(`Normalized keys: ${normalizedKeys.size}`);
}

if (statusCounts.size > 0) {
  const entries = Array.from(statusCounts.entries())
    .map(([status, count]) => `${status}:${count}`)
    .join(', ');
  console.log(`Status counts: ${entries}`);
}
