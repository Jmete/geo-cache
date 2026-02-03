#!/usr/bin/env node
import { randomBytes, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ALLOWED_TIERS = new Set(['demo', 'basic', 'pro', 'scale']);
const ALLOWED_STATUSES = new Set(['active', 'revoked']);

function parseArgs(argv) {
  let command = 'issue';
  const args = [...argv];
  if (args[0] && !args[0].startsWith('--')) {
    command = args.shift();
  }

  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }

  return { command, flags };
}

function escapeSql(value) {
  return value.replace(/'/g, "''");
}

function buildWranglerArgs(dbName, sql, options) {
  const args = ['d1', 'execute', dbName, '--command', sql];
  if (options.env) {
    args.push('--env', options.env);
  }
  if (options.remote) {
    args.push('--remote');
  }
  return args;
}

function runWrangler(sql, options) {
  const dbName = options.db ?? 'geo-cache-db';
  const result = spawnSync('wrangler', buildWranglerArgs(dbName, sql, options), {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hashApiKey(apiKey, secret) {
  return createHmac('sha256', secret).update(apiKey).digest('hex');
}

function createApiKey() {
  return `gc_${randomBytes(32).toString('base64url')}`;
}

const { command, flags } = parseArgs(process.argv.slice(2));
const secret = process.env.API_KEY_HMAC_SECRET;

if (!secret) {
  console.error('Missing API_KEY_HMAC_SECRET in environment.');
  process.exit(1);
}

const tier = flags.tier ?? 'basic';
if (!ALLOWED_TIERS.has(tier)) {
  console.error(`Invalid tier "${tier}". Expected one of: demo, basic, pro, scale.`);
  process.exit(1);
}

if (command === 'issue') {
  const status = flags.status ?? 'active';
  if (!ALLOWED_STATUSES.has(status)) {
    console.error('Invalid status. Expected "active" or "revoked".');
    process.exit(1);
  }

  const apiKey = createApiKey();
  const keyHash = hashApiKey(apiKey, secret);
  const label = flags.label ? `'${escapeSql(flags.label)}'` : 'NULL';

  const sql = [
    'INSERT INTO api_keys (key_hash, tier, status, label)',
    `VALUES ('${keyHash}', '${tier}', '${status}', ${label});`,
  ].join(' ');

  runWrangler(sql, flags);
  console.log('API key (store this now, it will not be shown again):');
  console.log(apiKey);
  process.exit(0);
}

if (command === 'revoke') {
  const apiKey = flags.key;
  if (!apiKey) {
    console.error('Missing --key for revoke.');
    process.exit(1);
  }
  const keyHash = hashApiKey(apiKey, secret);
  const sql = `UPDATE api_keys SET status='revoked' WHERE key_hash='${keyHash}';`;
  runWrangler(sql, flags);
  console.log('API key revoked.');
  process.exit(0);
}

if (command === 'rotate') {
  const apiKey = flags.key;
  if (!apiKey) {
    console.error('Missing --key for rotate.');
    process.exit(1);
  }

  const oldHash = hashApiKey(apiKey, secret);
  const revokeSql = `UPDATE api_keys SET status='revoked' WHERE key_hash='${oldHash}';`;
  runWrangler(revokeSql, flags);

  const newKey = createApiKey();
  const newHash = hashApiKey(newKey, secret);
  const label = flags.label ? `'${escapeSql(flags.label)}'` : 'NULL';
  const status = flags.status ?? 'active';
  if (!ALLOWED_STATUSES.has(status)) {
    console.error('Invalid status. Expected "active" or "revoked".');
    process.exit(1);
  }
  const insertSql = [
    'INSERT INTO api_keys (key_hash, tier, status, label)',
    `VALUES ('${newHash}', '${tier}', '${status}', ${label});`,
  ].join(' ');

  runWrangler(insertSql, flags);
  console.log('API key rotated. New key (store this now, it will not be shown again):');
  console.log(newKey);
  process.exit(0);
}

console.error(`Unknown command "${command}". Use: issue | revoke | rotate`);
process.exit(1);
