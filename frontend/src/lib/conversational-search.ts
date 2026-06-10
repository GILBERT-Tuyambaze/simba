import type { Product } from './types';
export * from './simba-intelligence';

export function buildShopSearchUrl(query: string, products: Product[] = []): string {
  const params = new URLSearchParams();
  params.set('q', query.trim());
  const ids = products
    .map((product) => product.id)
    .filter((id) => Number.isFinite(id));
  if (ids.length > 0) {
    params.set('ids', ids.join(','));
  }
  return `/shop?${params.toString()}`;
}
