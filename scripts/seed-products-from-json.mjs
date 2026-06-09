import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = process.argv[2] || path.join(root, 'simba_products.json');

function loadEnvFile(relativePath) {
  const envPath = path.join(root, relativePath);
  if (!fsSync.existsSync(envPath)) return;

  const raw = fsSync.readFileSync(envPath, 'utf8');
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.');
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname} failed: ${response.status} ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const raw = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const sourceProducts = Array.isArray(raw) ? raw : raw.products || [];

const products = sourceProducts.map((product) => ({
  id: product.id,
  name: product.name,
  price: Number(product.price || 0),
  category: product.category || 'Uncategorized',
  subcategory_id: product.subcategory_id ?? product.subcategoryId ?? null,
  image: product.image || null,
  unit: product.unit || null,
  description: product.description || null,
  brand: product.brand || null,
  rating: Number(product.rating || 0),
  discount: Number(product.discount || 0),
  tags: normalizeArray(product.tags),
  attributes: normalizeJson(product.attributes, {}),
  variations: normalizeJson(product.variations, []),
  options: normalizeArray(product.options),
  addons: normalizeArray(product.addons),
  modifiers: normalizeArray(product.modifiers),
  upsells: normalizeArray(product.upsells).map(Number).filter(Number.isFinite),
  cross_sells: normalizeArray(product.cross_sells).map(Number).filter(Number.isFinite),
  related_products: normalizeArray(product.related_products).map(Number).filter(Number.isFinite),
  recommended_products: normalizeArray(product.recommended_products).map(Number).filter(Number.isFinite),
  similar_products: normalizeArray(product.similar_products).map(Number).filter(Number.isFinite),
  frequently_bought_together: normalizeArray(product.frequently_bought_together).map(Number).filter(Number.isFinite),
  best_seller: Boolean(product.best_seller),
  new_arrival: Boolean(product.new_arrival),
  featured: Boolean(product.featured),
  on_sale: Boolean(product.on_sale || Number(product.discount || 0) > 0),
  backorder: Boolean(product.backorder),
  pre_order: Boolean(product.pre_order),
  discontinued: Boolean(product.discontinued),
}));

for (let index = 0; index < products.length; index += 500) {
  const batch = products.slice(index, index + 500);
  await supabaseRequest('products?on_conflict=id', {
    method: 'POST',
    body: JSON.stringify(batch),
  });
}

const branches = await supabaseRequest('branches?select=id,name&is_active=eq.true');
const branchRows = Array.isArray(branches) ? branches : [];
let inventoryCount = 0;

if (branchRows.length > 0) {
  const inventoryRows = [];

  for (const product of sourceProducts) {
    const productId = Number(product.id);
    if (!Number.isFinite(productId) || product.discontinued) {
      continue;
    }

    const explicitStock = product.stock_count ?? product.stockCount;
    const sourceInStock = product.in_stock ?? product.inStock;
    const stockCount =
      explicitStock !== undefined && explicitStock !== null
        ? Math.max(Number(explicitStock) || 0, 0)
        : sourceInStock === false
          ? 0
          : 25;
    const availableForDelivery = product.available_for_delivery ?? product.availableForDelivery ?? true;

    for (const branch of branchRows) {
      inventoryRows.push({
        product_id: productId,
        branch_id: branch.id,
        stock_count: stockCount,
        available_for_delivery: Boolean(availableForDelivery),
      });
    }
  }

  for (let index = 0; index < inventoryRows.length; index += 500) {
    const batch = inventoryRows.slice(index, index + 500);
    await supabaseRequest('product_inventory?on_conflict=product_id,branch_id', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
    inventoryCount += batch.length;
  }
}

console.log(`Seeded ${products.length} products and ${inventoryCount} inventory rows from ${sourcePath}`);
