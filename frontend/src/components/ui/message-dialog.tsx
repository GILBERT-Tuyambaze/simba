'use client'

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type MessageDialogVariant = 'default' | 'success' | 'error' | 'warning';

const variantStyles: Record<MessageDialogVariant, string> = {
  default: 'border-border/60 bg-white text-foreground',
  success: 'border-emerald-300/60 bg-emerald-50 text-foreground',
  error: 'border-destructive-300/60 bg-destructive-50 text-foreground',
  warning: 'border-amber-300/60 bg-amber-50 text-foreground',
};

export interface MessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actionLabel?: string;
  variant?: MessageDialogVariant;
}

export function MessageDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel = 'Okay',
  variant = 'default',
}: MessageDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="mx-auto mb-4 w-full max-w-lg rounded-2xl border p-5 shadow-2xl transition duration-200 sm:max-w-xl">
      <div
        className={cn(
          'rounded-2xl border p-5 shadow-2xl text-foreground',
          variantStyles[variant],
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'icon' }),
              'h-9 w-9 p-0'
            )}
            aria-label="Close message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={buttonVariants()}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
