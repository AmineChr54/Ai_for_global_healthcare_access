import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/i18n/LanguageContext";
import { useApp } from "@/contexts/AppContext";
import { filterOrganizations, getSpecialtiesForOrg, getFactsForOrg, getAffiliationsForOrg } from "@/data/api";
import type { Organization, FacilityType } from "@/data/types";
import { ALL_FACILITY_TYPES, ALL_OPERATOR_TYPES } from "@/data/types";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, ChevronLeft, ChevronRight, Plus, Pencil, MapPin, Building2, Globe, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import OrganizationFormDialog from "@/components/OrganizationFormDialog";
import PromptOrganizationDialog from "@/components/PromptOrganizationDialog";

const reliabilityDot = (score: number | null) => {
  if (!score) return "bg-muted-foreground";
  if (score >= 7) return "bg-success";
  if (score >= 5) return "bg-warning";
  return "bg-destructive";
};

const idpBadgeVariant = (status: string | null) => {
  if (status === "verified") return "default" as const;
  if (status === "flagged") return "destructive" as const;
  return "secondary" as const;
};

const DatabaseView: React.FC = () => {
  const { t } = useLanguage();
  const { selectedRegion, hasPermission } = useApp();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [facilityTypeFilter, setFacilityTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [page, setPage] = useState(0);
  const perPage = 10;

  // Form dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  const canAdd = hasPermission("add_records");
  const canEdit = hasPermission("edit_records");

  const { data: filtered = [], isLoading, error } = useQuery({
    queryKey: ["organizations", searchQuery, selectedRegion, typeFilter, facilityTypeFilter, statusFilter],
    queryFn: () => filterOrganizations({
      search: searchQuery || undefined,
      region: selectedRegion,
      organizationType: typeFilter as any,
      facilityType: facilityTypeFilter as any,
      idpStatus: statusFilter as any,
    }),
  });

  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const handleAddOrg = () => {
    setEditingOrg(null);
    setFormOpen(true);
  };

  const handleEditOrg = (org: Organization, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingOrg(org);
    setFormOpen(true);
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["organizations"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
  };

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t("database")}</h1>
        <Card><CardContent className="p-8 text-center text-destructive">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p>Failed to load organizations.</p>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("database")}</h1>
        {canAdd && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPromptOpen(true)} className="gap-2">
              <Sparkles className="w-4 h-4" /> {t("addFromPrompt" as any)}
            </Button>
            <Button onClick={handleAddOrg} className="gap-2">
              <Plus className="w-4 h-4" /> {t("addOrganization")}
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("searchOrganizations")}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            className="ps-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("organizationType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allTypes")}</SelectItem>
            <SelectItem value="facility">{t("facilityLabel")}</SelectItem>
            <SelectItem value="ngo">{t("ngoLabel")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={facilityTypeFilter} onValueChange={(v) => { setFacilityTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("facilityType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allTypes")}</SelectItem>
            {ALL_FACILITY_TYPES.map((ft) => (
              <SelectItem key={ft} value={ft}>{t(ft as any)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("idpStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="verified">{t("verified")}</SelectItem>
            <SelectItem value="pending">{t("pending")}</SelectItem>
            <SelectItem value="flagged">{t("flagged")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("organizationName")}</TableHead>
                  <TableHead>{t("city")}</TableHead>
                  <TableHead>{t("region")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>{t("reliabilityScore")}</TableHead>
                  <TableHead>{t("idpStatus")}</TableHead>
                  {canEdit && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((org) => (
                  <TableRow
                    key={org.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedOrg(org)}
                  >
                    <TableCell className="font-medium">{org.canonical_name}</TableCell>
                    <TableCell>{org.address_city || "—"}</TableCell>
                    <TableCell className="text-sm">{org.address_state_or_region?.replace(" Region", "") || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs">
                        {org.organization_type === "facility" ? (org.facility_type_id || "facility") : "NGO"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className={cn("w-2 h-2 rounded-full", reliabilityDot(org.reliability_score))} />
                        <span className="text-sm">{org.reliability_score?.toFixed(1) ?? "—"}/10</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={idpBadgeVariant(org.idp_status)}
                        className="capitalize"
                      >
                        {org.idp_status ? t(org.idp_status as any) : "—"}
                      </Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => handleEditOrg(org, e)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {paged.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      {t("noData")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("showing")} {paged.length} {t("of")} {filtered.length} {t("organizations")}
        </p>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Detail dialog */}
      <OrganizationDetailDialog
        org={selectedOrg}
        onClose={() => setSelectedOrg(null)}
        canEdit={canEdit}
        onEdit={(org) => {
          setSelectedOrg(null);
          setEditingOrg(org);
          setFormOpen(true);
        }}
      />

      {/* Add/Edit form dialog */}
      <OrganizationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        organization={editingOrg}
        onSave={handleSaved}
      />

      {/* Prompt-based add dialog */}
      <PromptOrganizationDialog
        open={promptOpen}
        onOpenChange={setPromptOpen}
        onSave={handleSaved}
      />
    </div>
  );
};

// ---- Detail dialog component ----
const OrganizationDetailDialog: React.FC<{
  org: Organization | null;
  onClose: () => void;
  canEdit: boolean;
  onEdit: (org: Organization) => void;
}> = ({ org, onClose, canEdit, onEdit }) => {
  const { t } = useLanguage();
  if (!org) return null;

  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties", org.id],
    queryFn: () => getSpecialtiesForOrg(org.id),
    enabled: !!org,
  });

  const { data: facts = [] } = useQuery({
    queryKey: ["facts", org.id],
    queryFn: () => getFactsForOrg(org.id),
    enabled: !!org,
  });

  const { data: affiliations = [] } = useQuery({
    queryKey: ["affiliations", org.id],
    queryFn: () => getAffiliationsForOrg(org.id),
    enabled: !!org,
  });

  return (
    <Dialog open={!!org} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            {org.canonical_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            {[
              [t("organizationType"), org.organization_type === "facility" ? (org.facility_type_id || "Facility") : "NGO"],
              [t("operatorType"), org.operator_type_id || "—"],
              [t("city"), org.address_city],
              [t("region"), org.address_state_or_region],
              [t("yearEstablished"), org.year_established],
              [t("capacity"), org.capacity ? `${org.capacity} beds` : null],
              [t("numberDoctors"), org.number_doctors],
              [t("phone"), org.official_phone],
              [t("email"), org.email],
              [t("website"), org.official_website],
              [t("reliabilityScore"), org.reliability_score ? `${org.reliability_score}/10` : null],
            ].map(([label, val]) => val ? (
              <div key={String(label)} className="flex flex-col border-b border-border/30 pb-2">
                <span className="text-muted-foreground text-xs">{label}</span>
                <span className="font-medium capitalize">{String(val)}</span>
              </div>
            ) : null)}
          </div>

          {/* Description */}
          {(org.description || org.organization_description) && (
            <div>
              <span className="text-muted-foreground text-xs">{t("description")}</span>
              <p className="mt-1">{org.description || org.organization_description}</p>
            </div>
          )}

          {/* Mission (NGOs) */}
          {org.mission_statement && (
            <div>
              <span className="text-muted-foreground text-xs">{t("missionStatement")}</span>
              <p className="mt-1 italic">{org.mission_statement}</p>
            </div>
          )}

          {/* Specialties */}
          {specialties.length > 0 && (
            <div>
              <span className="text-muted-foreground text-xs mb-1 block">{t("specialties")}</span>
              <div className="flex flex-wrap gap-1.5">
                {specialties.map((s) => (
                  <Badge key={s.specialty} variant="outline" className="text-xs capitalize">
                    {s.specialty.replace(/([A-Z])/g, " $1").trim()}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Facts */}
          {facts.length > 0 && (
            <div>
              <span className="text-muted-foreground text-xs mb-1 block">{t("factsAndCapabilities")}</span>
              <div className="space-y-1">
                {facts.map((f) => (
                  <div key={f.id} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize shrink-0">{f.fact_type}</Badge>
                    <span>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Affiliations */}
          {affiliations.length > 0 && (
            <div>
              <span className="text-muted-foreground text-xs mb-1 block">{t("affiliations")}</span>
              <div className="flex flex-wrap gap-1.5">
                {affiliations.map((a) => (
                  <Badge key={a.affiliation} variant="outline" className="text-xs capitalize">
                    {a.affiliation.replace(/-/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Coordinates */}
          {org.lat && org.lon && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span className="text-xs">{org.lat.toFixed(4)}, {org.lon.toFixed(4)}</span>
            </div>
          )}

          {/* Social links */}
          {(org.facebook_link || org.official_website) && (
            <div className="flex items-center gap-3">
              {org.official_website && (
                <a href={org.official_website} target="_blank" rel="noopener" className="text-primary text-xs flex items-center gap-1">
                  <Globe className="w-3 h-3" /> {t("website")}
                </a>
              )}
            </div>
          )}

          {canEdit && (
            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => onEdit(org)}
              >
                <Pencil className="w-4 h-4" /> {t("editOrganization")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DatabaseView;
