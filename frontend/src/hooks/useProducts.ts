import { useEffect, useState } from 'react';
import { Product } from '@/lib/types';
import { supabase } from '@/lib/supabase';

let cache: Product[] | null = null;

function normalizeProduct(product: Product): Product {
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

export const useProducts = () => {
  const [products, setProducts] = useState<Product[]>(cache || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let mounted = true;
    const loadProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('product_catalog')
          .select('*')
          .eq('discontinued', false)
          .order('id', { ascending: false })
          .limit(1000);

        if (error) {
          throw error;
        }

        cache = ((data || []) as Product[]).map(normalizeProduct);
        if (mounted) {
          setProducts(cache);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setProducts([]);
          setLoading(false);
        }
      }
    };

    void loadProducts();
    return () => {
      mounted = false;
    };
  }, []);

  return { products, loading };
};

export const useProduct = (id: number | string | undefined) => {
  const { products, loading } = useProducts();
  const pid = typeof id === 'string' ? parseInt(id, 10) : id;
  const product = products.find((p) => p.id === pid);
  return { product, loading };
};
