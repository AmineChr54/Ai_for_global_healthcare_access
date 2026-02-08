

# Healthcare Data Ingestion Platform

A comprehensive, multi-lingual healthcare data ingestion dashboard with mock data — designed with a clean, clinical "Trustworthy Medical" blue & white theme.

---

## 1. Design System & Layout Shell

- **Color palette**: Medical blue (#1E40AF range) primary, clean whites, light gray cards, with amber for warnings and green/red for confidence indicators
- **Typography**: High-contrast, large readable fonts with generous whitespace
- **Card-based layout** throughout with subtle shadows and rounded corners
- **Sidebar navigation** with: Logo, Facility Switcher, main navigation links, language selector (Globe icon), and connection status indicator
- **Top header bar** with user avatar, role badge, and sidebar toggle

---

## 2. Internationalization (i18n)

- Full translation support for **English, Arabic (with RTL), German, and French**
- Language selector in the sidebar with a Globe icon
- RTL layout flips correctly for Arabic — all margins, paddings, and icons mirror properly
- All UI labels, buttons, tooltips, and status messages translated

---

## 3. Dashboard / Home Page (Admin view)

- **Summary cards**: Total facilities, records processed today, pending reviews, average confidence score
- **Recent activity feed** showing latest uploads and verifications
- **Mini chart** (recharts) showing records processed over the past 7 days
- Role-aware: Viewers see a simplified read-only version; Maintainers see upload shortcuts

---

## 4. Bulk Upload Page

- Drag-and-drop zone + file picker for PDFs and images
- **Queue list view** showing each file with:
  - File name and type icon
  - Upload progress bar
  - AI processing status (Queued → Processing → Complete → Needs Review)
  - Overall confidence score (color-coded dot: green/yellow/red)
- Simulated processing with mock timers
- Batch actions: retry failed, remove completed

---

## 5. AI Verification Split-View

- Clicking a processed record opens a **split-screen**:
  - **Left panel**: Original document preview (mock PDF/image viewer)
  - **Right panel**: Editable form with AI-extracted fields (Patient Name, DOB, Diagnosis, Doctor, Facility, etc.)
- Each field shows a **confidence score** badge (percentage + color dot)
- Clicking a field highlights the corresponding area on the document (simulated with colored overlays)
- **Data Completeness sidebar** on the right: lists missing optional fields with amber "High-Impact" badges for important ones (e.g., Doctor Specialty, Hospital Capacity)
- Save / Approve / Flag for Review actions

---

## 6. Structured Database View (for Viewers)

- Searchable, filterable table of all processed records
- Filters: facility, date range, confidence level, record status
- Column sorting and pagination
- Click a row to view read-only detail (no edit for Viewer role)

---

## 7. Offline-First UI

- **Connection status indicator** in the sidebar (green dot = online, amber = syncing, red = offline)
- When "offline" (toggled via a mock switch for demo), edits save to a local queue
- Visual queue counter showing "3 changes pending sync"
- When toggled back online, a "Syncing..." animation plays and items clear from the queue
- Toast notifications for sync success/failure

---

## 8. Facility Switcher & RBAC

- **Facility Switcher** dropdown in the sidebar with 3-4 mock facilities (e.g., "Berlin Central Hospital", "Cairo Medical Center", "Lyon General")
- Switching facility reloads dashboard data with different mock datasets
- **Role switcher** (for demo purposes) to toggle between Admin, Maintainer, and Viewer
  - **Admin**: sees everything — dashboard analytics, user activity logs, facility settings page
  - **Maintainer**: sees bulk upload, verification, and database views
  - **Viewer**: sees only the structured database with search/filter (no upload or edit)

---

## 9. Pages Summary

| Page | Access |
|------|--------|
| Dashboard | Admin, Maintainer (simplified) |
| Bulk Upload | Admin, Maintainer |
| Verification Split-View | Admin, Maintainer |
| Structured Database | All roles |
| Facility Settings | Admin only |
| User Activity Logs | Admin only |

All data is mock — no backend or database required. The entire app runs client-side with realistic simulated workflows.

