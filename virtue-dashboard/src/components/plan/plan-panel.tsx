'use client';

import { useMemo } from 'react';
import type { PlanItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { randomId } from '@/lib/utils';
import { CalendarClock, Check, Download, FileJson, PlusCircle, Trash } from 'lucide-react';

interface PlanPanelProps {
  items: PlanItem[];
  onItemsChange: (items: PlanItem[]) => void;
  onGenerateFromResults: () => void;
  regions: string[];
}

const PLAN_TEMPLATES: Omit<PlanItem, 'id'>[] = [
  {
    title: 'Field visit validation',
    region: 'Northern',
    facilityId: undefined,
    priority: 'High',
    rationale: 'Verify infrastructure gaps flagged by agent',
    nextStep: 'Coordinate with regional health directorate',
    owner: 'Field Ops',
    dueDate: '',
    status: 'todo',
  },
  {
    title: 'Partner outreach',
    region: 'Greater Accra',
    facilityId: undefined,
    priority: 'Medium',
    rationale: 'Engage NGO partners for oxygen support',
    nextStep: 'Share Living Map insights with CHAG',
    owner: 'Partnerships',
    dueDate: '',
    status: 'todo',
  },
  {
    title: 'Equipment verification',
    region: 'Ashanti',
    facilityId: undefined,
    priority: 'High',
    rationale: 'Claims ICU but no oxygen reference',
    nextStep: 'Request photographic proof & maintenance logs',
    owner: 'Clinical QA',
    dueDate: '',
    status: 'todo',
  },
  {
    title: 'Training initiative',
    region: 'Savannah',
    facilityId: undefined,
    priority: 'Low',
    rationale: 'Support cataract capabilities in rural north',
    nextStep: 'Design weekend surgical blitz with partners',
    owner: 'Programs',
    dueDate: '',
    status: 'todo',
  },
];

export function PlanPanel({ items, onItemsChange, onGenerateFromResults, regions }: PlanPanelProps) {
  const sortedRegions = useMemo(() => Array.from(new Set(regions)).filter(Boolean).sort(), [regions]);

  const addTemplate = (template: Omit<PlanItem, 'id'>) => {
    onItemsChange([...items, { ...template, id: randomId('plan') }]);
  };

  const updateItem = (itemId: string, patch: Partial<PlanItem>) => {
    onItemsChange(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  };

  const removeItem = (itemId: string) => onItemsChange(items.filter((item) => item.id !== itemId));

  const exportPlan = (format: 'json' | 'csv') => {
    if (!items.length) return;
    const date = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      triggerDownload(URL.createObjectURL(blob), `virtue-plan-${date}.json`);
      return;
    }
    const headers = ['Title', 'Region', 'Priority', 'Rationale', 'Next Step', 'Owner', 'Due Date', 'Status'];
    const rows = items.map((item) =>
      [item.title, item.region, item.priority, item.rationale, item.nextStep, item.owner ?? '', item.dueDate ?? '', item.status].join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    triggerDownload(URL.createObjectURL(blob), `virtue-plan-${date}.csv`);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" className="gap-2" onClick={onGenerateFromResults}>
          <PlusCircle className="h-4 w-4" />
          Create plan from results
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => exportPlan('json')}>
            <FileJson className="h-4 w-4" /> JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={() => exportPlan('csv')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-white/60">Templates</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PLAN_TEMPLATES.map((template) => (
            <button
              key={template.title}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-white/70 transition hover:border-white/30"
              onClick={() => addTemplate(template)}
            >
              <p className="font-semibold text-white">{template.title}</p>
              <p>{template.rationale}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/60">
            No plan items yet. Generate from agent results or add from a template.
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            <div className="flex items-center justify-between">
              <Input
                value={item.title}
                onChange={(event) => updateItem(item.id, { title: event.target.value })}
                className="bg-transparent text-base font-semibold"
              />
              <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <select
                className="rounded-2xl border border-white/15 bg-transparent px-2 py-2"
                value={item.region ?? ''}
                onChange={(event) => updateItem(item.id, { region: event.target.value })}
              >
                <option value="">Region</option>
                {sortedRegions.map((region) => (
                  <option key={region} value={region} className="bg-surface-soft text-black">
                    {region}
                  </option>
                ))}
              </select>
              <select
                className="rounded-2xl border border-white/15 bg-transparent px-2 py-2"
                value={item.priority}
                onChange={(event) => updateItem(item.id, { priority: event.target.value as PlanItem['priority'] })}
              >
                {['High', 'Medium', 'Low'].map((priority) => (
                  <option key={priority} value={priority} className="bg-surface-soft text-black">
                    {priority}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Owner"
                value={item.owner ?? ''}
                onChange={(event) => updateItem(item.id, { owner: event.target.value })}
              />
              <div className="flex items-center gap-2 rounded-2xl border border-white/15 px-3">
                <CalendarClock className="h-4 w-4 text-white/50" />
                <input
                  type="date"
                  className="flex-1 bg-transparent text-xs text-white"
                  value={item.dueDate ?? ''}
                  onChange={(event) => updateItem(item.id, { dueDate: event.target.value })}
                />
              </div>
            </div>
            <Textarea
              className="mt-3"
              placeholder="Rationale"
              value={item.rationale}
              onChange={(event) => updateItem(item.id, { rationale: event.target.value })}
            />
            <Textarea
              className="mt-2"
              placeholder="Next step"
              value={item.nextStep}
              onChange={(event) => updateItem(item.id, { nextStep: event.target.value })}
            />
            <div className="mt-3 flex items-center justify-between text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.status === 'done'}
                  onChange={(event) => updateItem(item.id, { status: event.target.checked ? 'done' : 'todo' })}
                />
                Mark complete
              </label>
              <Badge variant={item.status === 'done' ? 'success' : 'outline'} className="flex items-center gap-1">
                <Check className="h-3 w-3" /> {item.status}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
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
