#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const DEFAULT_INPUTS_FILE = 'fixtures/smoke-inputs.txt';
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_PACE_MS = 250;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value, limit) {
  if (!value || value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}...`;
}

async function loadInputsFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function formatDateStamp(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-geocode.mjs [options]

Options:
  --url <url>           Geocode endpoint (required or set GEOCODE_URL)
  --origin <origin>     Origin header (optional)
  --api-key <key>       API key (or set API_KEY / GEOCODE_API_KEY)
  --inputs-file <path>  File with one input per line (default: ${DEFAULT_INPUTS_FILE})
  --out <path>          Output JSON file (default: fixtures/smoke-outputs-YYYYMMDD.json)
  --pace-ms <ms>        Delay between requests (default: ${DEFAULT_PACE_MS})
  --timeout <ms>        Client timeout per request (default: ${DEFAULT_TIMEOUT_MS})
  --host-header <host>  Optional Host header override
  --help                Show this message
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.get('help')) {
  printHelp();
  process.exit(0);
}

const url = args.get('url') ?? process.env.GEOCODE_URL;
if (!url) {
  console.error('Missing --url or GEOCODE_URL for the live smoke test.');
  process.exit(1);
}

const origin = args.get('origin') ?? process.env.GEOCODE_ORIGIN ?? undefined;
const apiKey =
  args.get('api-key') ?? process.env.GEOCODE_API_KEY ?? process.env.API_KEY;
const inputsFile = args.get('inputs-file') ?? DEFAULT_INPUTS_FILE;
const timeoutMs = Math.max(1000, toInt(args.get('timeout') ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS));
const paceMs = Math.max(0, toInt(args.get('pace-ms') ?? DEFAULT_PACE_MS, DEFAULT_PACE_MS));
const hostHeader = args.get('host-header');

if (!apiKey) {
  console.error('Missing API key. Provide --api-key or set API_KEY/GEOCODE_API_KEY.');
  process.exit(1);
}

let inputs;
try {
  inputs = await loadInputsFile(inputsFile);
} catch (error) {
  console.error(
    `Failed to read inputs file: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
  process.exit(1);
}

if (inputs.length === 0) {
  console.error('Inputs file is empty. Provide at least one input line.');
  process.exit(1);
}

const outputPath = args.get('out') ?? `fixtures/smoke-outputs-${formatDateStamp(new Date())}.json`;

async function fetchOnce(inputText) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const payload = JSON.stringify({ text: inputText });
    const headers = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    };
    if (origin) {
      headers.origin = origin;
    }
    if (hostHeader) {
      headers.host = hostHeader;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    let responseBody = null;
    let responseText = null;

    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseText = await response.text();
    }

    return {
      input: inputText,
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - start,
      response: responseBody ?? undefined,
      responseText: responseText ? truncate(responseText, 2048) : undefined,
    };
  } catch (error) {
    return {
      input: inputText,
      ok: false,
      status: 0,
      durationMs: performance.now() - start,
      error: error instanceof Error ? error.message : 'Unknown client error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

const results = [];
for (let i = 0; i < inputs.length; i += 1) {
  const result = await fetchOnce(inputs[i]);
  results.push(result);
  if (paceMs > 0 && i < inputs.length - 1) {
    await sleep(paceMs);
  }
}

const statusCounts = {};
let okCount = 0;
let ambiguousCount = 0;
for (const result of results) {
  const statusKey = String(result.status);
  statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;
  if (result.ok) {
    okCount += 1;
  }
  if (result.response?.flags?.ambiguous) {
    ambiguousCount += 1;
  }
}

const output = {
  runAt: new Date().toISOString(),
  url,
  origin: origin ?? null,
  inputsFile,
  inputs,
  summary: {
    ok: okCount,
    failed: results.length - okCount,
    ambiguous: ambiguousCount,
    statuses: statusCounts,
  },
  results,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

console.log(`Smoke test complete. Results saved to ${outputPath}.`);
console.log(
  `Inputs: ${inputs.length}, OK: ${okCount}, Failed: ${results.length - okCount}, Ambiguous: ${ambiguousCount}`
);
