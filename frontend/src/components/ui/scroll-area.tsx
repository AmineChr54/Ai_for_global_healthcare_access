'use client';

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';

export const ScrollArea = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <ScrollAreaPrimitive.Root className={cn('overflow-hidden', className)}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full">{children}</ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar
      orientation="vertical"
      className="flex touch-none select-none border-l border-white/5 bg-white/5"
    >
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-white/20" />
    </ScrollAreaPrimitive.Scrollbar>
  </ScrollAreaPrimitive.Root>
);
