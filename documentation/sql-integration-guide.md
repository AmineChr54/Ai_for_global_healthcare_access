# SQL Database Integration Guide

> **Purpose**: Step-by-step instructions for connecting this React frontend to the local PostgreSQL database, replacing all mock data with live queries.

---

## Architecture Overview

The app uses a **swappable service layer** (`src/data/api.ts`) that currently imports from mock data files. All components consume data exclusively through this API layer — **no component ever imports mock data directly**. To connect to the real database, you only need to modify `src/data/api.ts` and add a backend API.

```
Components (pages) → src/data/api.ts → [currently: mock arrays] → [target: REST/RPC API → PostgreSQL]
```

---

## Step-by-Step Instructions

### 1. Set Up a Backend API Layer

- Create a lightweight REST API (e.g., Express, Fastify, or Supabase Edge Functions) that connects to the local PostgreSQL database.
- The API must expose the following endpoints (matching the functions in `src/data/api.ts`):

| Endpoint | Method | Maps to function | Description |
|---|---|---|---|
| `/api/organizations` | GET | `getAllOrganizations()` | Returns all orgs; supports query params for filtering |
| `/api/organizations/:id` | GET | `getOrganizationById(id)` | Single org by UUID |
| `/api/organizations/filter` | GET | `filterOrganizations(filters)` | Accepts query params: `search`, `region`, `organizationType`, `facilityType`, `operatorType`, `idpStatus` |
| `/api/organizations/:id/specialties` | GET | `getSpecialtiesForOrg(id)` | Returns `organization_specialties` rows for org |
| `/api/organizations/:id/facts` | GET | `getFactsForOrg(id)` | Returns `organization_facts` rows for org |
| `/api/organizations/:id/affiliations` | GET | `getAffiliationsForOrg(id)` | Returns `organization_affiliations` rows for org |
| `/api/organizations/:id/sources` | GET | `getSourcesForOrg(id)` | Returns `organization_sources` rows for org |
| `/api/organizations/:id/facility-view` | GET | `getFacilityView(id)` | Returns the denormalized `facilities` view row |
| `/api/dashboard/stats` | GET | `getDashboardStats()` | Aggregated counts, by-region, by-type, recent activity |
| `/api/activity-logs` | GET | `getActivityLogs()` | Returns activity log entries |
| `/api/uploads` | GET | `getMockUploadFiles()` | Returns upload/IDP job records |
| `/api/organizations` | POST | (new) | Insert a new organization |
| `/api/organizations/:id` | PUT | (new) | Update an existing organization |

### 2. Rewrite `src/data/api.ts` to Use `fetch()`

- Replace every function body that reads from mock arrays with an async `fetch()` call to the corresponding API endpoint above.
- Change all function signatures from synchronous to **`async`** (returning `Promise<T>` instead of `T`).
- Use an environment variable for the API base URL:
  ```ts
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";
  ```
- Add the `VITE_API_BASE_URL` variable to a `.env` file at the project root.

**Example transformation:**
```ts
// BEFORE (mock):
export function getAllOrganizations(): Organization[] {
  return mockOrganizations;
}

// AFTER (live):
export async function getAllOrganizations(): Promise<Organization[]> {
  const res = await fetch(`${API_BASE}/organizations`);
  if (!res.ok) throw new Error("Failed to fetch organizations");
  return res.json();
}
```

### 3. Update All Consuming Components to Handle Async Data

Every page/component that calls functions from `api.ts` must be updated because the functions become async. Use **React Query** (already installed as `@tanstack/react-query`).

- **Files to update:**
  - `src/pages/Dashboard.tsx` — calls `getDashboardStats()`
  - `src/pages/DatabaseView.tsx` — calls `filterOrganizations()`, `getSpecialtiesForOrg()`, `getFactsForOrg()`, `getAffiliationsForOrg()`
  - `src/pages/Verification.tsx` — calls `getAllOrganizations()`, `getOrganizationById()`
  - `src/pages/BulkUpload.tsx` — calls `getMockUploadFiles()`
  - `src/pages/FacilitySettings.tsx` — calls `getFacilityView()`
  - `src/pages/ActivityLogs.tsx` — calls `getActivityLogs()`

- **Pattern to follow** (wrap each call with `useQuery`):
  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import { getDashboardStats } from "@/data/api";

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: getDashboardStats,
  });

  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage />;
  ```

- Add loading skeletons and error states to each page.

### 4. Add Mutation Support for Create/Update

- Add `createOrganization()` and `updateOrganization()` functions to `api.ts` that POST/PUT to the backend.
- Use `useMutation` from React Query in `OrganizationFormDialog.tsx` and `PromptOrganizationDialog.tsx`.
- Invalidate the `["organizations"]` query cache on success so the table refreshes.

```ts
// In api.ts:
export async function createOrganization(org: Partial<Organization>): Promise<Organization> {
  const res = await fetch(`${API_BASE}/organizations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(org),
  });
  if (!res.ok) throw new Error("Failed to create organization");
  return res.json();
}

export async function updateOrganization(id: string, org: Partial<Organization>): Promise<Organization> {
  const res = await fetch(`${API_BASE}/organizations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(org),
  });
  if (!res.ok) throw new Error("Failed to update organization");
  return res.json();
}
```

### 5. Wire Up the `filterOrganizations` Endpoint

- The filter function currently accepts an `OrganizationFilters` object. Pass these as query params:
  ```
  GET /api/organizations/filter?search=korle&region=Greater+Accra+Region&organizationType=facility&facilityType=hospital&idpStatus=verified
  ```
- On the backend, build the SQL `WHERE` clause dynamically from these params.
- The TypeScript interface `OrganizationFilters` in `api.ts` (lines 39-46) defines the exact filter shape.

### 6. Handle the `facilities` Denormalized View

- The PostgreSQL database has a `facilities` VIEW that joins organizations with their specialties and facts.
- The `getFacilityView(id)` function should query this view: `SELECT * FROM facilities WHERE pk_unique_id = $1`.
- The TypeScript interface `FacilityView` in `src/data/types.ts` (lines 165-189) matches this view's columns exactly.

### 7. Environment & Configuration

- Add a `.env` file:
  ```
  VITE_API_BASE_URL=http://localhost:3001/api
  ```
- Ensure the backend API has CORS enabled for `http://localhost:5173` (Vite dev server) and `http://localhost:8080`.
- The backend should return JSON with `Content-Type: application/json`.

### 8. Remove Mock Data (After Verification)

- Once all endpoints are working and verified, delete:
  - `src/data/mockOrganizations.ts`
  - `src/data/mockData.ts` (legacy re-exports)
- Remove mock imports from `src/data/api.ts`.

---

## Files That Do NOT Need Changes

These files are already aligned with the database schema and require no modification:

| File | Reason |
|---|---|
| `src/data/types.ts` | TypeScript interfaces already mirror the PostgreSQL schema exactly |
| `src/contexts/AppContext.tsx` | Uses region strings and roles — no data layer dependency |
| `src/i18n/translations.ts` | UI strings only |
| `src/components/AppSidebar.tsx` | Reads regions from `types.ts` constants |
| `src/components/ui/*` | Design system primitives — no data awareness |

---

## TypeScript Types ↔ Database Mapping Reference

| TypeScript type (`types.ts`) | PostgreSQL table/view |
|---|---|
| `Organization` | `organizations` |
| `OrganizationSpecialty` | `organization_specialties` |
| `OrganizationFact` | `organization_facts` |
| `OrganizationAffiliation` | `organization_affiliations` |
| `OrganizationSource` | `organization_sources` |
| `FacilityView` | `facilities` (VIEW) |

---

## IDP (Intelligent Document Parsing) Readiness

The following IDP-related fields are already defined in the `Organization` type but are **not yet in the PostgreSQL schema**. When the IDP pipeline is ready:

- Add `idp_status TEXT` column to `organizations` — values: `'verified'`, `'pending'`, `'flagged'`
- Add `field_confidences JSONB` column to `organizations` — stores per-field confidence scores from the IDP engine
- The `PromptOrganizationDialog.tsx` component already produces extracted data in this shape and marks fields as "Extracted" vs "Needs input" based on confidence

---

## Checklist

- [ ] Backend API server is created and connects to PostgreSQL
- [ ] All endpoints listed in Step 1 are implemented
- [ ] `src/data/api.ts` functions are rewritten as async fetch calls
- [ ] `VITE_API_BASE_URL` env var is set
- [ ] All 6 page components are updated with `useQuery` wrappers
- [ ] Create/Update mutations are wired in the form dialogs
- [ ] Loading & error states are added to each page
- [ ] CORS is configured on the backend
- [ ] Mock data files are removed after verification
- [ ] IDP columns (`idp_status`, `field_confidences`) are added to the DB when ready
