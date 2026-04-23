import type { Product } from './types';
import { BRANCHES } from './types';

function normalizeBranchStock(value: Product['branch_stock']): Record<string, number> {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([branch, count]) => [
          branch,
          Math.max(Number(count) || 0, 0),
        ])
      );
    } catch {
      return {};
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([branch, count]) => [branch, Math.max(Number(count) || 0, 0)])
  );
}

function buildFallbackBranchStock(product: Product): Record<string, number> {
  const explicitStock = Math.max(Number(product.stock_count || 0), 0);
  const perBranchStock = explicitStock > 0 ? explicitStock : product.in_stock ? 25 : 0;

  if (perBranchStock <= 0) {
    return {};
  }

  if (product.branch) {
    return { [product.branch]: perBranchStock };
  }

  return Object.fromEntries(BRANCHES.map((branch) => [branch, perBranchStock]));
}

function resolveBranchStock(product: Product): Record<string, number> {
  const branchStock = normalizeBranchStock(product.branch_stock);
  if (Object.keys(branchStock).length > 0) {
    return branchStock;
  }

  return buildFallbackBranchStock(product);
}

export function getProductStockForBranch(product: Product, branch?: string | null): number {
  const branchStock = resolveBranchStock(product);
  const stockCount = Object.values(branchStock).reduce((sum, count) => sum + count, 0);

  if (!branch || branch === 'all') {
    return stockCount;
  }

  if (Object.prototype.hasOwnProperty.call(branchStock, branch)) {
    return branchStock[branch] || 0;
  }

  return 0;
}

export function getProductStockLabel(product: Product, branch?: string | null): string {
  const stock = getProductStockForBranch(product, branch);
  return `${stock}`;
}

export function getAvailableBranchesForProduct(product: Product): Array<{ branch: string; stock: number }> {
  const branchStock = resolveBranchStock(product);
  const entries = Object.entries(branchStock)
    .map(([branch, stock]) => ({ branch, stock: Math.max(Number(stock) || 0, 0) }))
    .filter((entry) => entry.stock > 0)
    .sort((a, b) => b.stock - a.stock || a.branch.localeCompare(b.branch));

  return entries;
}
