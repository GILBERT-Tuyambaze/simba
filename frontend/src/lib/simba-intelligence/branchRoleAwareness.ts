/**
 * SIMBA BRANCH & ROLE AWARENESS
 * Phases 6 & 8: Branch inventory management and role-based access control
 *
 * Capabilities:
 * - Branch-aware product recommendations
 * - Inventory by location
 * - Alternative branch suggestions
 * - Role-based capability control
 */

import type { Product } from '@/lib/types';
import { getProductStockForBranch } from '@/lib/product-stock';

export type UserRole = 'guest' | 'customer' | 'branch_staff' | 'branch_manager' | 'delivery_agent' | 'super_admin';

export interface BranchInfo {
  id: string;
  name: string;
  location: string;
  phone?: string;
  hours?: string;
  latitude?: number;
  longitude?: number;
}

export interface ProductAvailability {
  product: Product;
  inSelectedBranch: boolean;
  stockInSelectedBranch: number;
  totalStock: number;
  availableInBranches: Array<{ branch: string; stock: number; distance?: number }>;
  closestBranchWithStock?: { branch: string; stock: number; distance?: number };
}

export interface RoleCapabilities {
  role: UserRole;
  canSearch: boolean;
  canViewPrice: boolean;
  canAddToCart: boolean;
  canCheckout: boolean;
  canViewOrders: boolean;
  canViewInventory: boolean;
  canViewAnalytics: boolean;
  canManageBranch: boolean;
  canManageDeliveries: boolean;
  canAccessAdmin: boolean;
}

// ===== ROLE CAPABILITIES =====

const ROLE_CAPABILITIES: Record<UserRole, RoleCapabilities> = {
  guest: {
    role: 'guest',
    canSearch: true,
    canViewPrice: true,
    canAddToCart: false,
    canCheckout: false,
    canViewOrders: false,
    canViewInventory: false,
    canViewAnalytics: false,
    canManageBranch: false,
    canManageDeliveries: false,
    canAccessAdmin: false,
  },
  customer: {
    role: 'customer',
    canSearch: true,
    canViewPrice: true,
    canAddToCart: true,
    canCheckout: true,
    canViewOrders: true,
    canViewInventory: false,
    canViewAnalytics: false,
    canManageBranch: false,
    canManageDeliveries: false,
    canAccessAdmin: false,
  },
  branch_staff: {
    role: 'branch_staff',
    canSearch: true,
    canViewPrice: true,
    canAddToCart: false,
    canCheckout: false,
    canViewOrders: false,
    canViewInventory: true,
    canViewAnalytics: false,
    canManageBranch: false,
    canManageDeliveries: false,
    canAccessAdmin: false,
  },
  branch_manager: {
    role: 'branch_manager',
    canSearch: true,
    canViewPrice: true,
    canAddToCart: false,
    canCheckout: false,
    canViewOrders: true,
    canViewInventory: true,
    canViewAnalytics: true,
    canManageBranch: true,
    canManageDeliveries: false,
    canAccessAdmin: false,
  },
  delivery_agent: {
    role: 'delivery_agent',
    canSearch: true,
    canViewPrice: false,
    canAddToCart: false,
    canCheckout: false,
    canViewOrders: true,
    canViewInventory: false,
    canViewAnalytics: false,
    canManageBranch: false,
    canManageDeliveries: true,
    canAccessAdmin: false,
  },
  super_admin: {
    role: 'super_admin',
    canSearch: true,
    canViewPrice: true,
    canAddToCart: true,
    canCheckout: true,
    canViewOrders: true,
    canViewInventory: true,
    canViewAnalytics: true,
    canManageBranch: true,
    canManageDeliveries: true,
    canAccessAdmin: true,
  },
};

// ===== UTILITY FUNCTIONS =====

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ===== ROLE CAPABILITIES =====

/**
 * Get capabilities for a user role
 */
export function getRoleCapabilities(role: UserRole): RoleCapabilities {
  return ROLE_CAPABILITIES[role] || ROLE_CAPABILITIES.guest;
}

/**
 * Check if role can perform action
 */
export function canUserPerformAction(role: UserRole, action: keyof RoleCapabilities): boolean {
  const capabilities = getRoleCapabilities(role);
  if (action === 'role') return true;
  return (capabilities[action as Exclude<keyof RoleCapabilities, 'role'>] as boolean) ?? false;
}

/**
 * Validate action permission
 */
export function validateUserPermission(role: UserRole, action: string): { allowed: boolean; reason?: string } {
  const capabilities = getRoleCapabilities(role);

  if (action === 'search') {
    return { allowed: capabilities.canSearch, reason: capabilities.canSearch ? undefined : 'Not authorized to search' };
  }
  if (action === 'add_to_cart') {
    return { allowed: capabilities.canAddToCart, reason: capabilities.canAddToCart ? undefined : 'Not authorized to add to cart' };
  }
  if (action === 'checkout') {
    return { allowed: capabilities.canCheckout, reason: capabilities.canCheckout ? undefined : 'Not authorized to checkout' };
  }
  if (action === 'view_orders') {
    return { allowed: capabilities.canViewOrders, reason: capabilities.canViewOrders ? undefined : 'Not authorized to view orders' };
  }
  if (action === 'view_inventory') {
    return { allowed: capabilities.canViewInventory, reason: capabilities.canViewInventory ? undefined : 'Not authorized to view inventory' };
  }
  if (action === 'view_analytics') {
    return { allowed: capabilities.canViewAnalytics, reason: capabilities.canViewAnalytics ? undefined : 'Not authorized to view analytics' };
  }
  if (action === 'manage_branch') {
    return { allowed: capabilities.canManageBranch, reason: capabilities.canManageBranch ? undefined : 'Not authorized to manage branch' };
  }
  if (action === 'manage_deliveries') {
    return { allowed: capabilities.canManageDeliveries, reason: capabilities.canManageDeliveries ? undefined : 'Not authorized to manage deliveries' };
  }
  if (action === 'access_admin') {
    return { allowed: capabilities.canAccessAdmin, reason: capabilities.canAccessAdmin ? undefined : 'Not authorized to access admin' };
  }

  return { allowed: true };
}

// ===== BRANCH AWARENESS =====

/**
 * Get product availability across branches
 */
export function getProductAvailability(
  product: Product,
  selectedBranch: string,
  allBranches: BranchInfo[] = []
): ProductAvailability {
  const stockInSelectedBranch = getProductStockForBranch(product, selectedBranch);
  const inSelectedBranch = stockInSelectedBranch > 0;

  // Parse branch stock to get all available branches
  let availableInBranches: Array<{ branch: string; stock: number; distance?: number }> = [];

  if (typeof product.branch_stock === 'string') {
    try {
      const parsed = JSON.parse(product.branch_stock);
      availableInBranches = Object.entries(parsed)
        .map(([branch, stock]) => {
          const branchInfo = allBranches.find((b) => b.name === branch || b.id === branch);
          return {
            branch,
            stock: Number(stock) || 0,
            distance: branchInfo?.latitude && branchInfo?.longitude ? 0 : undefined, // Would calculate if coords available
          };
        })
        .filter((item) => item.stock > 0);
    } catch {
      // If parsing fails, use current branch stock
    }
  } else if (typeof product.branch_stock === 'object' && product.branch_stock) {
    availableInBranches = Object.entries(product.branch_stock)
      .map(([branch, stock]) => ({
        branch,
        stock: Number(stock) || 0,
      }))
      .filter((item) => item.stock > 0);
  }

  // If no branch stock parsed, use general in_stock flag
  if (availableInBranches.length === 0 && product.in_stock) {
    availableInBranches = [{ branch: selectedBranch, stock: product.stock_count || 1 }];
  }

  // Find closest branch with stock
  let closestBranchWithStock: { branch: string; stock: number; distance?: number } | undefined;
  if (!inSelectedBranch && availableInBranches.length > 0) {
    closestBranchWithStock = availableInBranches[0];
  }

  const totalStock = availableInBranches.reduce((sum, item) => sum + item.stock, 0);

  return {
    product,
    inSelectedBranch,
    stockInSelectedBranch,
    totalStock,
    availableInBranches,
    closestBranchWithStock,
  };
}

/**
 * Filter products available in selected branch
 */
export function filterByBranchAvailability(products: Product[], branch: string): Product[] {
  return products.filter((product) => {
    const stock = getProductStockForBranch(product, branch);
    return stock > 0;
  });
}

/**
 * Sort products by branch availability
 * Selected branch first, then by stock quantity
 */
export function sortByBranchAvailability(products: Product[], branch: string): Product[] {
  return [...products].sort((a, b) => {
    const stockA = getProductStockForBranch(a, branch);
    const stockB = getProductStockForBranch(b, branch);

    // Prioritize products available in selected branch
    if (stockA > 0 && stockB === 0) return -1;
    if (stockA === 0 && stockB > 0) return 1;

    // Then sort by stock quantity descending
    return stockB - stockA;
  });
}

/**
 * Suggest alternative branches if product unavailable
 */
export function suggestAlternativeBranches(
  product: Product,
  selectedBranch: string,
  branches: BranchInfo[] = []
): BranchInfo[] {
  const availability = getProductAvailability(product, selectedBranch, branches);

  if (availability.inSelectedBranch) {
    return []; // Already available in selected branch
  }

  return availability.availableInBranches
    .map((item) => branches.find((b) => b.name === item.branch || b.id === item.branch))
    .filter((b): b is BranchInfo => Boolean(b));
}

/**
 * Get notification for branch-unavailable products
 */
export function getBranchAvailabilityNotification(
  products: Product[],
  selectedBranch: string,
  branches: BranchInfo[] = []
): {
  available: number;
  unavailable: number;
  suggestions: Array<{ product: Product; suggestedBranch: string }>;
} {
  const available = products.filter((p) => getProductStockForBranch(p, selectedBranch) > 0).length;
  const unavailable = products.length - available;

  const suggestions: Array<{ product: Product; suggestedBranch: string }> = [];

  for (const product of products) {
    if (getProductStockForBranch(product, selectedBranch) === 0) {
      const alternatives = suggestAlternativeBranches(product, selectedBranch, branches);
      if (alternatives.length > 0) {
        suggestions.push({
          product,
          suggestedBranch: alternatives[0].name,
        });
      }
    }
  }

  return { available, unavailable, suggestions };
}

/**
 * Prioritize branch in recommendations
 * Always show selected branch inventory first
 */
export function prioritizeSelectedBranch(products: Product[], selectedBranch: string): Product[] {
  return sortByBranchAvailability(products, selectedBranch);
}

// ===== PERMISSIONS & FILTERING =====

/**
 * Filter recommendations based on user role
 */
export function filterRecommendationsByRole(products: Product[], role: UserRole): Product[] {
  const capabilities = getRoleCapabilities(role);

  if (!capabilities.canViewPrice) {
    // Remove or blur price for delivery agents
    return products.map((p) => ({
      ...p,
      price: 0,
    }));
  }

  return products;
}

/**
 * Build assistant context based on role
 */
export function buildRoleAwareContext(role: UserRole, branch?: string) {
  const capabilities = getRoleCapabilities(role);

  return {
    role,
    branch,
    capabilities,
    restrictions: {
      canSearch: capabilities.canSearch,
      canRecommendProducts: capabilities.canSearch,
      canAddToCart: capabilities.canAddToCart,
      canCheckout: capabilities.canCheckout,
      canViewOrders: capabilities.canViewOrders,
      canViewInventory: capabilities.canViewInventory,
    },
  };
}

/**
 * Get role-specific assistant behaviors
 */
export function getRoleSpecificBehavior(role: UserRole) {
  const behaviors: Record<UserRole, string[]> = {
    guest: [
      'Encourage browsing',
      'Highlight popular products',
      'Suggest creating account',
      'Show deals and promotions',
    ],
    customer: [
      'Assist with purchases',
      'Recommend complementary products',
      'Show cart optimization',
      'Provide order tracking',
    ],
    branch_staff: [
      'Assist with inventory questions',
      'Show stock levels',
      'Help with product information',
      'Support customer inquiries',
    ],
    branch_manager: [
      'Provide inventory analytics',
      'Show branch performance',
      'Support staff management',
      'Analyze customer trends',
    ],
    delivery_agent: [
      'Show delivery orders',
      'Provide delivery route info',
      'Update order status',
      'Share delivery notes',
    ],
    super_admin: [
      'Full system access',
      'Analytics and reporting',
      'User management',
      'System configuration',
    ],
  };

  return behaviors[role] || behaviors.guest;
}
