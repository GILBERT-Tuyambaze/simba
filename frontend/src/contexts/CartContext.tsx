import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { BRANCHES, CartItem } from '@/lib/types';
import { toast } from 'sonner';

interface CartContextValue {
  items: CartItem[];
  branch: string;
  setBranch: (b: string) => void;
  addItem: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  updateQty: (productId: number, qty: number) => void;
  syncStockLimit: (productId: number, maxQuantity?: number) => void;
  removeItem: (productId: number) => void;
  clear: () => void;
  totalItems: number;
  subtotal: number;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = 'simba_cart_v1';
const BRANCH_KEY = 'simba_branch_v1';

function getStorage(): Storage {
  try {
    // Test if localStorage is available
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return localStorage;
  } catch {
    // Fallback to sessionStorage if localStorage is not available
    return sessionStorage;
  }
}

function clampQuantity(quantity: number, maxQuantity?: number): number {
  const nextQuantity = Math.max(Math.floor(quantity) || 0, 0);
  if (typeof maxQuantity !== 'number' || !Number.isFinite(maxQuantity) || maxQuantity <= 0) {
    return nextQuantity;
  }

  return Math.min(nextQuantity, Math.floor(maxQuantity));
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [branch, setBranchState] = useState<string>(BRANCHES[0]);
  const storage = getStorage();

  // Load from storage
  useEffect(() => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
        }
      }
      const b = storage.getItem(BRANCH_KEY);
      if (b && BRANCHES.includes(b)) {
        setBranchState(b);
      }
    } catch (error) {
      console.warn('Failed to load cart from storage:', error);
      // Clear corrupted data
      storage.removeItem(STORAGE_KEY);
      storage.removeItem(BRANCH_KEY);
    }
  }, [storage]);

  // Persist
  useEffect(() => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.warn('Failed to save cart to storage:', error);
    }
  }, [items, storage]);

  // Persist branch
  useEffect(() => {
    try {
      storage.setItem(BRANCH_KEY, branch);
    } catch (error) {
      console.warn('Failed to save branch to storage:', error);
    }
  }, [branch, storage]);

  const setBranch = useCallback((b: string) => {
    setBranchState(b);
    try {
      storage.setItem(BRANCH_KEY, b);
    } catch (error) {
      console.warn('Failed to save branch to storage:', error);
    }
    toast.success(`Branch set: ${b}`);
  }, [storage]);

  const addItem = useCallback((item: Omit<CartItem, 'quantity'>, qty = 1) => {
    let added = false;
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === item.product_id);
      const maxQuantity = item.max_quantity;
      const nextQty = clampQuantity(qty, maxQuantity);

      if (maxQuantity && nextQty <= 0) {
        toast.error(`Only ${maxQuantity} left in stock.`);
        return prev;
      }

      if (existing) {
        const cappedQuantity = clampQuantity(existing.quantity + nextQty, existing.max_quantity || maxQuantity);
        if (existing.max_quantity && existing.quantity >= existing.max_quantity) {
          toast.error(`Only ${existing.max_quantity} left in stock.`);
          return prev;
        }
        if (cappedQuantity === existing.quantity) {
          toast.error(`Only ${existing.max_quantity || maxQuantity} left in stock.`);
          return prev;
        }
        added = true;
        return prev.map((i) =>
          i.product_id === item.product_id
            ? { ...i, quantity: cappedQuantity, max_quantity: i.max_quantity || maxQuantity }
            : i
        );
      }

      added = true;
      return [...prev, { ...item, quantity: nextQty, max_quantity: maxQuantity }];
    });
    if (added) {
      toast.success(`> ${item.product_name} added to cart`);
    }
  }, []);

  const updateQty = useCallback((productId: number, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.product_id !== productId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => {
        if (i.product_id !== productId) {
          return i;
        }

        const nextQuantity = clampQuantity(qty, i.max_quantity);
        if (i.max_quantity && qty > i.max_quantity) {
          toast.error(`Only ${i.max_quantity} left in stock.`);
        }

        if (nextQuantity <= 0) {
          return null;
        }

        return { ...i, quantity: nextQuantity };
      })
      .filter(Boolean) as CartItem[]
    );
  }, []);

  const syncStockLimit = useCallback((productId: number, maxQuantity?: number) => {
    setItems((prev) => {
      const next = prev
        .map((item) => {
          if (item.product_id !== productId) {
            return item;
          }

          if (typeof maxQuantity === 'number' && maxQuantity <= 0) {
            return null;
          }

          const safeMax = typeof maxQuantity === 'number' ? maxQuantity : item.max_quantity;
          const nextQuantity = clampQuantity(item.quantity, safeMax);
          if (nextQuantity <= 0) {
            return null;
          }

          return { ...item, quantity: nextQuantity, max_quantity: safeMax };
        })
        .filter(Boolean) as CartItem[];

      return next;
    });
  }, []);

  const removeItem = useCallback((productId: number) => {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
    toast.info('Item removed');
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((a, b) => a + b.quantity, 0);
  const subtotal = items.reduce((a, b) => a + b.price * b.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, branch, setBranch, addItem, updateQty, syncStockLimit, removeItem, clear, totalItems, subtotal }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextValue => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
};
