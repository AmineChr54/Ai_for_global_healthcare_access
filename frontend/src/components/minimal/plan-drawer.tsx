'use client';

import { useMemo } from 'react';
import type { PlanItem } from '@/types';
import { SlidePanel } from './slide-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download, FileJson, PlusCircle, Trash } from 'lucide-react';

interface PlanDrawerProps {
  isOpen: boolean;
  items: PlanItem[];
  onItemsChange: (items: PlanItem[]) => void;
  onClose: () => void;
  onGenerateFromInsights: () => void;
}

export function PlanDrawer({ isOpen, items, onItemsChange, onClose, onGenerateFromInsights }: PlanDrawerProps) {
  const addBlank = () => {
    onItemsChange([
      ...items,
      {
        id: `plan-${Math.random().toString(36).slice(2, 7)}`,
        title: 'New action',
        region: 'Unknown',
        priority: 'Medium',
        nextStep: 'Define next step',
        rationale: 'Derived from insights',
        status: 'todo',
      },
    ]);
  };

  const updateItem = (id: string, patch: Partial<PlanItem>) => {
    onItemsChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => onItemsChange(items.filter((item) => item.id !== id));

  const exportPlan = (format: 'json' | 'csv') => {
    if (!items.length) return;
    const date = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      triggerDownload(URL.createObjectURL(blob), `vf-plan-${date}.json`);
      return;
    }
    const headers = ['Title', 'Region', 'Priority', 'Next Step'];
    const rows = items.map((item) => [item.title, item.region, item.priority, item.nextStep].join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    triggerDownload(URL.createObjectURL(blob), `vf-plan-${date}.csv`);
  };

  return (
    <SlidePanel title="Plan" isOpen={isOpen} onClose={onClose} widthClassName="w-[400px]">
      <div className="flex h-full flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onGenerateFromInsights}>
            <PlusCircle className="h-4 w-4" /> Create plan from insights
          </Button>
          <Button variant="ghost" size="sm" onClick={addBlank}>
            Add item
          </Button>
          <Button variant="ghost" size="sm" onClick={() => exportPlan('json')}>
            <FileJson className="h-4 w-4" /> JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={() => exportPlan('csv')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {!items.length && <p className="text-sm text-[color:var(--text-muted)]">No plan items yet.</p>}
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <Input
                  value={item.title}
                  onChange={(event) => updateItem(item.id, { title: event.target.value })}
                  className="h-9 text-sm"
                />
                <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">{item.region}</Badge>
                <select
                  className="rounded-full border border-[color:var(--border-subtle)] bg-transparent px-2 py-1 text-xs text-[color:var(--text-primary)]"
                  value={item.priority}
                  onChange={(event) => updateItem(item.id, { priority: event.target.value as PlanItem['priority'] })}
                >
                  {['High', 'Medium', 'Low'].map((priority) => (
                    <option key={priority} value={priority} className="bg-[color:var(--bg-panel)]">
                      {priority}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                className="mt-2 h-9 text-xs"
                value={item.nextStep}
                onChange={(event) => updateItem(item.id, { nextStep: event.target.value })}
              />
            </div>
          ))}
        </div>
      </div>
    </SlidePanel>
  );
}

function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
