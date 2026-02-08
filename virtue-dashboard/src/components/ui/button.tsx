'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-r from-accent-blue/80 to-accent-teal/80 text-white hover:from-accent-blue hover:to-accent-teal shadow-glass',
        secondary:
          'border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] text-[color:var(--text-primary)] hover:bg-[color:var(--bg-panel)]',
        ghost: 'bg-transparent text-[color:var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5',
        outline:
          'border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5',
        subtle: 'bg-[color:var(--bg-panel)] text-[color:var(--text-primary)] hover:bg-[color:var(--bg-card)]',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';
