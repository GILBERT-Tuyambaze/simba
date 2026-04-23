export interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  subcategory_id?: number | null;
  in_stock: boolean;
  image: string;
  unit?: string | null;
  description?: string | null;
  brand?: string | null;
  rating: number;
  discount: number;
  branch?: string | null;
  available_for_delivery?: boolean;
  stock_count?: number;
  branch_stock?: Record<string, number> | string;
  tags?: string[] | string;
  attributes?: Array<{ name: string; value: string }> | string;
  variations?: Array<{ name: string; values: string[] }> | string;
  options?: string[] | string;
  addons?: string[] | string;
  modifiers?: string[] | string;
  upsells?: number[];
  cross_sells?: number[];
  related_products?: number[];
  recommended_products?: number[];
  similar_products?: number[];
  frequently_bought_together?: number[];
  best_seller?: boolean;
  new_arrival?: boolean;
  featured?: boolean;
  on_sale?: boolean;
  out_of_stock?: boolean;
  low_stock?: boolean;
  backorder?: boolean;
  pre_order?: boolean;
  discontinued?: boolean;
}

export interface CartItem {
  product_id: number;
  product_name: string;
  price: number;
  image: string;
  quantity: number;
  branch?: string;
  unit?: string;
  max_quantity?: number;
}

export interface Order {
  id: number;
  user_id: string;
  branch: string;
  items: string;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  delivery_method: string;
  delivery_option?: string;
  address: string;
  phone: string;
  payment_method: string;
  status: string;
  tracking_number: string;
  assigned_branch?: string | null;
  assigned_staff_id?: string | null;
  assigned_staff_name?: string | null;
  assigned_delivery_agent_id?: string | null;
  assigned_delivery_agent_name?: string | null;
  pickup_time?: string | null;
  deposit_amount?: number;
  deposit_paid?: boolean;
  rating?: number | null;
  review_comment?: string | null;
  review_branch?: string | null;
  timeline?: Array<{ status: string; label: string; at?: string | null }>;
  created_at: string;
}

export interface UserProfile {
  id: number;
  user_id: string;
  display_name: string;
  phone: string;
  email: string;
  role: string;
  default_branch: string;
  addresses: string;
  preferred_payment_method?: string | null;
  staff_code?: string | null;
  no_show_flags?: number;
  created_at: string;
}

export interface Invitation {
  id?: number;
  token: string;
  role: string;
  branch?: string | null;
  invited_email?: string | null;
  note?: string | null;
  status: string;
  expires_at?: string | null;
  created_at?: string | null;
}

export const BRANCHES = [
  'Simba Supermarket Remera',
  'Simba Supermarket Kimironko',
  'Simba Supermarket Kacyiru',
  'Simba Supermarket Nyamirambo',
  'Simba Supermarket Gikondo',
  'Simba Supermarket Kanombe',
  'Simba Supermarket Kinyinya',
  'Simba Supermarket Kibagabaga',
  'Simba Supermarket Nyanza',
] as const;

export type Branch = typeof BRANCHES[number];

export const BRANCH_DETAILS: Array<{
  name: Branch;
  address: string;
  shortAddress: string;
  city: string;
  rating: number;
  reviewCount: number;
}> = [
  {
    name: 'Simba Supermarket Remera',
    address: '3336+MHV Union Trade Centre, 1 KN 4 Ave, Kigali',
    shortAddress: 'Union Trade Centre, KN 4 Ave',
    city: 'Kigali',
    rating: 4.8,
    reviewCount: 128,
  },
  {
    name: 'Simba Supermarket Kimironko',
    address: '342F+3V5, Kimironko, Kigali, RW',
    shortAddress: 'Kimironko, Kigali',
    city: 'Kigali',
    rating: 4.7,
    reviewCount: 142,
  },
  {
    name: 'Simba Supermarket Kacyiru',
    address: 'KN 5 Rd, Kigali',
    shortAddress: 'KN 5 Rd',
    city: 'Kigali',
    rating: 4.6,
    reviewCount: 96,
  },
  {
    name: 'Simba Supermarket Nyamirambo',
    address: '23H4+26V, Kigali',
    shortAddress: 'Nyamirambo, Kigali',
    city: 'Kigali',
    rating: 4.5,
    reviewCount: 88,
  },
  {
    name: 'Simba Supermarket Gikondo',
    address: '24G3+MCV, Kigali',
    shortAddress: 'Gikondo, Kigali',
    city: 'Kigali',
    rating: 4.6,
    reviewCount: 74,
  },
  {
    name: 'Simba Supermarket Kanombe',
    address: 'KK 35 Ave, Kigali',
    shortAddress: 'KK 35 Ave',
    city: 'Kigali',
    rating: 4.4,
    reviewCount: 61,
  },
  {
    name: 'Simba Supermarket Kinyinya',
    address: 'KG 541 St, Kigali',
    shortAddress: 'KG 541 St',
    city: 'Kigali',
    rating: 4.5,
    reviewCount: 69,
  },
  {
    name: 'Simba Supermarket Kibagabaga',
    address: '24Q5+R2R, Kigali',
    shortAddress: 'Kibagabaga, Kigali',
    city: 'Kigali',
    rating: 4.7,
    reviewCount: 81,
  },
  {
    name: 'Simba Supermarket Nyanza',
    address: '24XF+XVV, KG 192 St, Kigali',
    shortAddress: 'KG 192 St',
    city: 'Kigali',
    rating: 4.3,
    reviewCount: 55,
  },
];

export function getBranchDetails(branch: string) {
  return BRANCH_DETAILS.find((item) => item.name === branch) || null;
}

export const formatRWF = (amount: number): string => {
  return `RWF ${amount.toLocaleString('en-US')}`;
};
