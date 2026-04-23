import { getAPIBaseURL } from './config';

export type BranchReviewSummary = {
  branch: string;
  rating: number;
  review_count: number;
  recent_orders: number;
};

export async function fetchBranchReviewSummaries(): Promise<BranchReviewSummary[]> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/entities/orders/branch-summary`);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const data = (await response.json()) as { items?: BranchReviewSummary[] };
  return data.items || [];
}
