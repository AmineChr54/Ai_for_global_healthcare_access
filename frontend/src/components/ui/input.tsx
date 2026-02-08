import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type = 'text', ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-4 text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:border-accent-blue/60 disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';
