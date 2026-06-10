import { useEffect, useState } from 'react';
import { Product } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import type { ProductQueryOptions } from '@/lib/simba-intelligence/queryPlanner';

let cache: Product[] | null = null;

export type ProductFacets = {
  categories: string[];
  brands: string[];
};

export function normalizeProduct(product: Product): Product {
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
    available_for_delivery: product.available_for_delivery ?? true,
    stock_count: product.stock_count ?? (product.in_stock ? 25 : 0),
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

function applySort(query: any, sort?: string) {
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
  const [products, setProducts] = useState<Product[]>(serverFiltered ? [] : cache || []);
  const [loading, setLoading] = useState(serverFiltered || !cache);
  const [total, setTotal] = useState<number>(serverFiltered ? 0 : cache?.length || 0);
  const key = queryKey(options);

  useEffect(() => {
    if (!serverFiltered && cache) return;
    let mounted = true;
    const loadProducts = async () => {
      try {
        const limit = Math.max(1, Math.min(Number(options?.limit || 1000), 1000));
        const offset = Math.max(0, Number(options?.offset || 0));
        let request = supabase
          .from('product_catalog')
          .select('*', { count: 'exact' })
          .eq('discontinued', false);

        if (options?.ids?.length) {
          request = request.in('id', options.ids);
        }
        if (options?.category) {
          request = request.eq('category', options.category);
        }
        if (options?.brand) {
          request = request.eq('brand', options.brand);
        }
        if (options?.priceMax) {
          request = request.lte('price', options.priceMax);
        }
        if (options?.saleOnly) {
          request = request.gt('discount', 0);
        }
        if (options?.inStockOnly) {
          request = request.eq('in_stock', true);
        }
        if (options?.query?.trim()) {
          const value = options.query.trim().replace(/[%_]/g, '');
          request = request.or(
            `name.ilike.%${value}%,category.ilike.%${value}%,brand.ilike.%${value}%,description.ilike.%${value}%`
          );
        }

        const { data, error, count } = await applySort(request, options?.sort)
          .range(offset, offset + limit - 1);

        if (error) {
          throw error;
        }

        const nextProducts = ((data || []) as Product[]).map(normalizeProduct);
        if (!serverFiltered) {
          cache = nextProducts;
        }
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

        const categories = Array.from(new Set((data || []).map((item: any) => item.category).filter(Boolean))).sort();
        const brands = Array.from(new Set((data || []).map((item: any) => item.brand).filter(Boolean))).sort();
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
