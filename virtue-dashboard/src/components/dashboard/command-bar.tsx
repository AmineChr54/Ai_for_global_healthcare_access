'use client';

import { useEffect } from 'react';
import type { AgentQueryMode, AgentQuery } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { History, Sparkles } from 'lucide-react';

const PROMPTS = [
  'Where are the largest cold spots for cataract surgery within 50km?',
  'Which facilities claim ICU but list no oxygen?',
  'What services does Tamale Teaching Hospital offer?',
];

interface CommandBarProps {
  queryText: string;
  mode: AgentQueryMode;
  onModeChange: (mode: AgentQueryMode) => void;
  onQueryChange: (text: string) => void;
  onRun: () => void;
  history: AgentQuery[];
  disabled?: boolean;
}

export function CommandBar({ queryText, mode, onModeChange, onQueryChange, onRun, history, disabled }: CommandBarProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'enter') {
        event.preventDefault();
        onRun();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onRun]);

  return (
    <div className="rounded-3xl border border-white/10 bg-surface-glass p-4 shadow-glass">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-white/80">
            <Sparkles className="h-5 w-5 text-accent-blue" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">Ask Virtue Agent</p>
              <p className="text-xs text-white/50">Plain language OK — evidence-backed answers in seconds.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60">
            Simple
            <Switch checked={mode === 'advanced'} onCheckedChange={(checked) => onModeChange(checked ? 'advanced' : 'simple')} />
            Advanced
          </div>
        </div>

        <div className="flex gap-3">
          <Input
            value={queryText}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Where are cold spots for cataract surgery within 50km?"
            className="h-14 flex-1 text-base"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onRun();
              }
            }}
          />
          <Button className="h-14 px-8 text-base" onClick={onRun} disabled={disabled}>
            Run ↵
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PROMPTS.map((prompt) => (
            <Chip key={prompt} onClick={() => onQueryChange(prompt)}>
              {prompt}
            </Chip>
          ))}
          <Chip disabled className="opacity-60">
            Cmd ⌘ + Enter to run
          </Chip>
        </div>

        {mode === 'advanced' && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
            <p className="text-xs uppercase tracking-wide text-white/40">Structured constraints</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">Radius 50km</Badge>
              <Badge variant="outline">Min confidence 70%</Badge>
              <Badge variant="outline">Include phone & oxygen references</Badge>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-white/50">
            <History className="h-3.5 w-3.5" /> Recent:
            {history.slice(0, 3).map((item) => (
              <button key={item.text} className="text-white/70 underline-offset-2 hover:underline" onClick={() => onQueryChange(item.text)}>
                {item.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
