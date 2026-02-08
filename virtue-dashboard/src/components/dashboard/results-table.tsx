'use client';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  VisibilityState,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { FacilityWithDerived } from '@/types';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, formatConfidence, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronDown, Filter, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ResultsTableProps {
  facilities: FacilityWithDerived[];
  isLoading: boolean;
  onRowSelect: (facilityId: string) => void;
  selectedFacilityId?: string | null;
  onRefresh?: () => void;
}

export function ResultsTable({ facilities, isLoading, onRowSelect, selectedFacilityId, onRefresh }: ResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'confidence', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<FacilityWithDerived>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Facility',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-white">{row.original.name}</p>
            <p className="text-xs text-white/50">{row.original.region}</p>
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => <span className="text-sm text-white/80">{row.original.type ?? '—'}</span>,
      },
      {
        accessorKey: 'specialties',
        header: 'Specialties',
        cell: ({ row }) => <span className="text-xs text-white/60">{row.original.specialties ?? 'n/a'}</span>,
      },
      {
        accessorKey: 'capabilities',
        header: 'Capabilities',
        cell: ({ row }) => (
          <span className="text-xs text-white/70 line-clamp-3">{row.original.capabilities ?? 'n/a'}</span>
        ),
      },
      {
        id: 'flags',
        header: 'Signals',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.flags.length ? (
              row.original.flags.map((flag) => (
                <Badge key={flag.message} variant="warning" className="text-[10px] uppercase tracking-wide">
                  {flag.type.replace('-', ' ')}
                </Badge>
              ))
            ) : (
              <Badge variant="success">Clear</Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'confidence',
        header: 'Confidence',
        cell: ({ row }) => <span className="text-sm text-white/80">{formatConfidence(row.original.confidence)}</span>,
      },
      {
        accessorKey: 'lastUpdated',
        header: 'Last Updated',
        cell: ({ row }) => <span className="text-xs text-white/60">{timeAgo(row.original.lastUpdated)}</span>,
      },
    ],
    []
  );

  const table = useReactTable({
    data: facilities,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Search facilities, capabilities, anomalies"
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="bg-white/5"
          />
          {onRefresh && (
            <Button variant="ghost" size="icon" onClick={onRefresh} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
        <details className="group rounded-2xl border border-white/10 bg-white/5 p-2 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-white/80">
            <Filter className="h-4 w-4" />
            Columns
            <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-1 text-xs text-white/70">
            {table.getAllLeafColumns().map((column) => (
              <label key={column.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-accent-blue"
                  checked={column.getIsVisible()}
                  onChange={(event) => column.toggleVisibility(event.target.checked)}
                />
                {column.columnDef.header as string}
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="flex-1 overflow-hidden rounded-2xl border border-white/5 bg-white/10">
        <ScrollArea className="h-full">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface-soft/80 backdrop-blur">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="text-xs uppercase tracking-wide text-white/60">
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-medium">
                      {header.isPlaceholder ? null : (
                        <button
                          className="flex items-center gap-2"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? null}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'cursor-pointer border-b border-white/5 transition hover:bg-white/5',
                    selectedFacilityId === row.original.id && 'bg-accent-blue/10'
                  )}
                  onClick={() => onRowSelect(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {!table.getRowModel().rows.length && !isLoading && (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-white/60">
                    No facilities match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    </div>
  );
}
