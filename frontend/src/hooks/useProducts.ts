import { useEffect, useState } from 'react';
import { Product } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import type { ProductQueryOptions } from '@/lib/simba-intelligence/queryPlanner';

export type ProductFacets = {
  categories: string[];
  brands: string[];
};

type ProductQueryKey = Required<Pick<ProductQueryOptions, 'ids'>> & {
  category: string;
  brand: string;
  query: string;
  priceMax: number;
  saleOnly: boolean;
  inStockOnly: boolean;
  sort: string;
  limit: number;
  offset: number;
};

type SortableProductQuery<T> = {
  order: (column: string, options: { ascending: boolean }) => T;
};

type ProductFacetRow = {
  category: string | null;
  brand: string | null;
};

export function normalizeProduct(product: Product): Product {
  const parseNumber = (value: unknown): number => {
    const normalized = typeof value === 'string' ? value.replace(/,/g, '') : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const parsedBranchStock =
    typeof product.branch_stock === 'string'
      ? (() => {
          try {
            return JSON.parse(product.branch_stock) as Record<string, number>;
          } catch {
            return {};
          }
        })()
      : product.branch_stock || {};

  const parseStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : value.split(',').map((item) => item.trim()).filter(Boolean);
      } catch {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
      }
    }
    return [];
  };

  return {
    ...product,
    price: parseNumber(product.price),
    rating: parseNumber(product.rating),
    discount: parseNumber(product.discount),
    available_for_delivery: product.available_for_delivery ?? true,
    stock_count: parseNumber(product.stock_count ?? (product.in_stock ? 25 : 0)),
    branch_stock: parsedBranchStock,
    tags: parseStringArray(product.tags),
    attributes: Array.isArray(product.attributes) ? product.attributes : [],
    variations: Array.isArray(product.variations) ? product.variations : [],
    options: parseStringArray(product.options),
    addons: parseStringArray(product.addons),
    modifiers: parseStringArray(product.modifiers),
    upsells: product.upsells || [],
    cross_sells: product.cross_sells || [],
    related_products: product.related_products || [],
    recommended_products: product.recommended_products || [],
    similar_products: product.similar_products || [],
    frequently_bought_together: product.frequently_bought_together || [],
  };
}

function hasQueryOptions(options?: ProductQueryOptions): boolean {
  return Boolean(
    options &&
    (
      options.category ||
      options.brand ||
      options.query ||
      options.ids?.length ||
      options.priceMax ||
      options.saleOnly ||
      options.inStockOnly ||
      options.sort ||
      options.limit ||
      options.offset
    )
  );
}

function queryKey(options?: ProductQueryOptions): string {
  return JSON.stringify({
    category: options?.category || '',
    brand: options?.brand || '',
    query: options?.query || '',
    ids: options?.ids || [],
    priceMax: options?.priceMax || 0,
    saleOnly: Boolean(options?.saleOnly),
    inStockOnly: Boolean(options?.inStockOnly),
    sort: options?.sort || '',
    limit: options?.limit || 0,
    offset: options?.offset || 0,
  });
}

function parseQueryKey(key: string): ProductQueryKey {
  return JSON.parse(key) as ProductQueryKey;
}

function applySort<T extends SortableProductQuery<T>>(query: T, sort?: string): T {
  switch (sort) {
    case 'price-asc':
      return query.order('price', { ascending: true });
    case 'price-desc':
      return query.order('price', { ascending: false });
    case 'rating':
      return query.order('rating', { ascending: false });
    case 'discount':
      return query.order('discount', { ascending: false });
    default:
      return query.order('rating', { ascending: false }).order('discount', { ascending: false }).order('id', { ascending: false });
  }
}

export const useProducts = (options?: ProductQueryOptions) => {
  const serverFiltered = hasQueryOptions(options);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number>(0);
  const key = queryKey(options);

  useEffect(() => {
    let mounted = true;
    const loadProducts = async () => {
      try {
        const currentOptions = parseQueryKey(key);
        const limit = Math.max(1, Math.min(Number(currentOptions.limit || 1000), 1000));
        const offset = Math.max(0, Number(currentOptions.offset || 0));
        let request = supabase
          .from('product_catalog')
          .select('*', { count: 'exact' })
          .eq('discontinued', false);

        if (currentOptions.ids.length) {
          request = request.in('id', currentOptions.ids);
        }
        if (currentOptions.category) {
          request = request.eq('category', currentOptions.category);
        }
        if (currentOptions.brand) {
          request = request.eq('brand', currentOptions.brand);
        }
        if (currentOptions.priceMax) {
          request = request.lte('price', currentOptions.priceMax);
        }
        if (currentOptions.saleOnly) {
          request = request.gt('discount', 0);
        }
        if (currentOptions.inStockOnly) {
          request = request.eq('in_stock', true);
        }
        if (currentOptions.query.trim()) {
          const value = currentOptions.query.trim().replace(/[%_]/g, '');
          request = request.or(
            `name.ilike.%${value}%,category.ilike.%${value}%,brand.ilike.%${value}%,description.ilike.%${value}%`
          );
        }

        const { data, error, count } = await applySort(request, currentOptions.sort)
          .range(offset, offset + limit - 1);

        if (error) {
          throw error;
        }

        const nextProducts = ((data || []) as Product[]).map(normalizeProduct);
        if (mounted) {
          setProducts(nextProducts);
          setTotal(count || nextProducts.length);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setProducts([]);
          setTotal(0);
          setLoading(false);
        }
      }
    };

    void loadProducts();
    return () => {
      mounted = false;
    };
  }, [key, serverFiltered]);

  return { products, loading, total };
};

export const useProduct = (id: number | string | undefined) => {
  const pid = typeof id === 'string' ? parseInt(id, 10) : id;
  const { products, loading } = useProducts(pid ? { ids: [pid], limit: 1 } : undefined);
  const product = products.find((p) => p.id === pid);
  return { product, loading };
};

export const useProductFacets = () => {
  const [facets, setFacets] = useState<ProductFacets>({ categories: [], brands: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadFacets = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('category,brand')
          .eq('discontinued', false)
          .limit(2000);

        if (error) {
          throw error;
        }

        const rows = (data || []) as ProductFacetRow[];
        const categories = Array.from(new Set(rows.map((item) => item.category).filter(Boolean) as string[])).sort();
        const brands = Array.from(new Set(rows.map((item) => item.brand).filter(Boolean) as string[])).sort();
        if (mounted) {
          setFacets({ categories, brands });
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setFacets({ categories: [], brands: [] });
          setLoading(false);
        }
      }
    };

    void loadFacets();
    return () => {
      mounted = false;
    };
  }, []);

  return { ...facets, loading };
};
