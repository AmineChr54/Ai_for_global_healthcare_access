# Virtue Foundation Living Map

A glassmorphic, minimal geospatial intelligence workspace for the Virtue Foundation Ghana Initiative. The dashboard lets NGO planners ask natural-language questions, review evidence-backed answers, inspect facilities on a “Living Map,” and spin up action plans instantly.

## Getting started

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Run the dev server**
   ```bash
   npm run dev
   ```
3. Open http://localhost:3000/dashboard and load the CSV-backed Living Map.

> **Mapbox token:** add `NEXT_PUBLIC_MAPBOX_TOKEN=your-token` to `.env.local` for the interactive map. Without it, the rest of the UI still works with a friendly placeholder.

## Data sources

- Default dataset (dev): `/mnt/data/Virtue Foundation Ghana v0.3 - Sheet1.csv` (loaded via `/api/csv`).
- Fallback mock bundle: `public/data/mock-facilities.json` (used when the CSV path is unavailable).

You can point the app at another CSV by updating `src/app/dashboard/page.tsx` and placing the file under `public/data`. The loader uses client-side parsing (PapaParse) with heuristics for coordinates (regional centroids + jitter when lat/lng are missing).

## Local “agent” logic

Everything runs locally—no backend required:

- `src/lib/data-loader.ts` harmonizes CSV rows into the `Facility` type, infers coordinates, specialties, capabilities, and equipment, and attaches a synthetic confidence score if the source lacks one.
- `src/lib/agent.ts` performs naive keyword + filter matching across facilities, computes anomaly flags (e.g., ICU claim without oxygen references), and emits an `AgentResult` with:
  - Summary sentence, key metrics, and created timestamp
  - Facility subset with derived flags/highlights
  - Row-level `Citation` objects (field, snippet, confidence)
  - Mocked `AgentTraceStep[]` to visualize reasoning

Because the agent is synchronous and deterministic, React Query simply caches the facility dataset while the agent itself runs instantly on the client.

## UI architecture

- **App Router + TypeScript** (Next.js 14)
- **State / data**: TanStack Query for CSV loading, component state for UI flows
- **Design system**: TailwindCSS + custom shadcn-inspired primitives (see `src/components/ui`)
- **Map**: Mapbox GL via `react-map-gl` + `supercluster` with mock layers from `src/lib/map-data/get-map-layers.ts`
- **Table**: TanStack Table with column picker, global search, anomaly badges
- **Charts / metrics**: Lightweight metric chips + card summary (Recharts-ready hook-up point in `MetricsStrip`)
- **Planning**: `PlanPanel` converts query insights into checklist-style plan items with JSON/CSV export
- **Evidence**: Sliding `EvidenceDrawer` exposes citations, trace steps, and the planner tab in one premium drawer
- **Minimal UI**: `src/components/minimal/minimal-dashboard.tsx` powers the current demo layout (chat + map + facility list)

## Key files & folders

```
src/
  app/
    dashboard/page.tsx         # Route entry point
    layout.tsx, globals.css    # Root layout + theme
  components/
    dashboard/                 # Legacy components (kept for reference)
    minimal/                   # Minimal chat + map + facilities experience
    evidence/                  # Evidence & trace drawer
    map/                       # LivingMap (Mapbox + layers)
    plan/                      # Plan builder
    providers/                 # React Query provider
    ui/                        # Tailwind + shadcn-inspired primitives
  hooks/use-facilities-data.ts # React Query data hook
  lib/                         # CSV loader, agent logic, utilities, insights, map-data adapters
  types/                       # Shared TypeScript contracts
public/data/                   # CSV + mock JSON bundles
```

## Accessibility & polish checklist

- High-contrast Dark Mode 2.0 palette with glassmorphic panels, focus rings, keyboard-friendly controls
- Animated drawers, hover states, skeleton loaders, empty/error states
- Map/table synchronization (row select ↔ map focus), facility drawer with copy-ready summary
- Evidence tab with citations + trace; Planner tab with templates and export controls

## Customizing / extending

- **New filters**: extend `AgentQueryFilters` and wire new controls in `Sidebar`
- **Agent logic**: enhance `runAgent` with embeddings, scoring, or backend calls—UI already expects structured citations & trace
- **Datasets**: swap CSV path + coordinate heuristics; loader is centralized in `src/lib/data-loader.ts`
- **Map layers**: update `src/lib/map-data/get-map-layers.ts` to swap mock polygons for real geospatial layers
- **Components**: shadcn-style primitives live in `src/components/ui` for quick iteration

The minimal UI prioritizes chat, map, and facility cards. Citations, trace, and planning live in lightweight drawers. Theme toggle persists in localStorage.
