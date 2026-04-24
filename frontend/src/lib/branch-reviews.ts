import { getAPIBaseURL } from './config';
import { getStoredSessionToken } from './auth';

export type BranchReviewSummary = {
  branch: string;
  rating: number;
  review_count: number;
  recent_orders: number;
};

export async function fetchBranchReviewSummaries(): Promise<BranchReviewSummary[]> {
  const token = getStoredSessionToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(`${getAPIBaseURL()}/api/v1/entities/orders/branch-summary`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const data = (await response.json()) as { items?: BranchReviewSummary[] };
  return data.items || [];
}
