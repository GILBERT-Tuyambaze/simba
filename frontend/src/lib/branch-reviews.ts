import { supabase } from './supabase';

export type BranchReviewSummary = {
  branch: string;
  rating: number;
  review_count: number;
  recent_orders: number;
};

export async function fetchBranchReviewSummaries(): Promise<BranchReviewSummary[]> {
  const { data, error } = await supabase
    .from('branch_review_summary')
    .select('*')
    .order('branch', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map((item: any) => ({
    branch: item.branch,
    rating: Number(item.rating || 0),
    review_count: Number(item.review_count || 0),
    recent_orders: Number(item.recent_orders || 0),
  }));
}
