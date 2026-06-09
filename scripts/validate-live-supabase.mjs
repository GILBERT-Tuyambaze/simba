import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(relativePath) {
  const envPath = path.join(root, relativePath);
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
}

loadEnvFile('frontend/.env.local');
loadEnvFile('frontend/.env');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceKey || /<.*>/.test(serviceKey)) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before validation.');
}

const checks = [
  ['branches', 'id'],
  ['profiles', 'user_id'],
  ['products', 'id'],
  ['product_inventory', 'product_id'],
  ['orders', 'id'],
  ['order_items', 'id'],
  ['cart_items', 'id'],
  ['invitations', 'id'],
  ['site_visits', 'client_key'],
  ['product_catalog', 'id'],
  ['branch_review_summary', 'branch'],
];

const report = [];

for (const [name, column] of checks) {
  const url = new URL(`/rest/v1/${name}`, supabaseUrl);
  url.searchParams.set('select', column);
  url.searchParams.set('limit', '1');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'count=exact',
    },
  });

  report.push({
    object: name,
    ok: response.ok,
    count: response.headers.get('content-range')?.split('/').at(1) ?? null,
    error: response.ok ? null : await response.text(),
  });
}

const storageBuckets = ['product-images', 'blog-media', 'private-documents'];
const storageReport = [];

for (const bucket of storageBuckets) {
  const url = new URL(`/storage/v1/bucket/${bucket}`, supabaseUrl);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });

  storageReport.push({
    bucket,
    ok: response.ok,
    error: response.ok ? null : await response.text(),
  });
}

const failed = report.filter((item) => !item.ok);
const failedStorage = storageReport.filter((item) => !item.ok);
console.log(JSON.stringify({ ok: failed.length === 0 && failedStorage.length === 0, report, storageReport }, null, 2));

if (failed.length > 0 || failedStorage.length > 0) {
  process.exitCode = 1;
}
