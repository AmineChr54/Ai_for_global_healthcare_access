'use client';

import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitives.Root
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-white/15 bg-white/10 transition data-[state=checked]:bg-accent-blue/50',
        className
      )}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb className="pointer-events-none block h-4 w-4 translate-x-1 rounded-full bg-white shadow transition data-[state=checked]:translate-x-6" />
    </SwitchPrimitives.Root>
  )
);
Switch.displayName = 'Switch';
