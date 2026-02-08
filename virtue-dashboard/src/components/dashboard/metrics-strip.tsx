'use client';

import type { AgentResult } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface MetricsStripProps {
  result: AgentResult | null;
  loading?: boolean;
}

export function MetricsStrip({ result }: MetricsStripProps) {
  if (!result) {
    return (
      <Card className="bg-white/5 text-sm text-white/60">
        <p>Run a question to generate a living answer summary with citations.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
      <Card className="bg-gradient-to-br from-white/10 to-white/5 shadow-glass">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
            <Sparkles className="h-6 w-6 text-accent-blue" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Agent synthesis</p>
            <p className="mt-2 text-base text-white/80">{result.summary}</p>
            <p className="mt-3 text-xs text-white/40">Generated {new Date(result.createdAt).toLocaleTimeString()}</p>
          </div>
        </div>
      </Card>
      <Card className="flex flex-wrap gap-3 bg-white/5">
        {result.metrics.map((metric) => (
          <div key={metric.label} className="flex-1 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-white/50">{metric.label}</p>
            <p className={cn('text-2xl font-semibold', metric.tone === 'warning' ? 'text-amber-300' : 'text-white')}>
              {metric.value}
            </p>
          </div>
        ))}
      </Card>
    </div>
  );
}
