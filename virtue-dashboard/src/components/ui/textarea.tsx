import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-4 py-3 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
