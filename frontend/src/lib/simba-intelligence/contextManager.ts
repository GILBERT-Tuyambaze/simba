import type { Product } from '@/lib/types';

export type SimbaUserContext = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  default_branch?: string | null;
};

export type SimbaConversationMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  query?: string;
  products?: Product[];
};

export type SimbaContext = {
  branch?: string;
  user?: SimbaUserContext;
  history: SimbaConversationMessage[];
};

const MAX_HISTORY = 20;

export function createSimbaContext(params: Partial<SimbaContext> = {}): SimbaContext {
  return {
    branch: params.branch,
    user: params.user,
    history: params.history ? params.history.slice(-MAX_HISTORY) : [],
  };
}

export function appendSimbaMessage(
  context: SimbaContext,
  message: SimbaConversationMessage
): SimbaContext {
  return {
    ...context,
    history: [...context.history, message].slice(-MAX_HISTORY),
  };
}

export function clearSimbaHistory(context: SimbaContext): SimbaContext {
  return {
    ...context,
    history: [],
  };
}

export function getUserRole(context: SimbaContext): string | undefined {
  return context.user?.role;
}

export function getBranchFromContext(context: SimbaContext): string | undefined {
  return context.branch;
}
