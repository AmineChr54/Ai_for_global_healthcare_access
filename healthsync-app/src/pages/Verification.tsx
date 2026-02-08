import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/i18n/LanguageContext";
import { useApp } from "@/contexts/AppContext";
import { getOrganizationById, filterOrganizations, updateOrganization } from "@/data/api";
import type { Organization } from "@/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Save, CheckCircle, Flag, FileText, AlertTriangle, Building2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const confidenceColor = (score: number) => {
  if (score >= 80) return "bg-success text-success-foreground";
  if (score >= 60) return "bg-warning text-warning-foreground";
  return "bg-destructive text-destructive-foreground";
};

const confidenceDot = (score: number | null) => {
  if (!score) return "bg-muted-foreground";
  if (score >= 7) return "bg-success";
  if (score >= 5) return "bg-warning";
  return "bg-destructive";
};

// Fields shown in the IDP verification view
const fieldKeys = [
  "canonical_name", "organization_type", "facility_type_id",
  "address_city", "address_state_or_region", "address_line1",
  "official_phone", "email", "official_website",
  "capacity", "number_doctors", "year_established", "description",
] as const;

const highImpactFields = ["capacity", "number_doctors", "official_phone"];

const Verification: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const { selectedRegion } = useApp();
  const navigate = useNavigate();

  const { data: allOrgs = [], isLoading, error } = useQuery({
    queryKey: ["organizations", "verification", selectedRegion],
    queryFn: () => filterOrganizations({ region: selectedRegion, idpStatus: "all" }),
  });

  const pendingOrgs = allOrgs.filter((o) => o.idp_status === "pending" || o.idp_status === "flagged");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("verification")}</h1>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("verification")}</h1>
        <Card><CardContent className="p-8 text-center text-destructive">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p>Failed to load organizations.</p>
        </CardContent></Card>
      </div>
    );
  }

  // If no ID in URL, show org list
  if (!id) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("verification")}</h1>
        <p className="text-sm text-muted-foreground">{t("verificationDescription")}</p>
        <div className="grid gap-3">
          {pendingOrgs.map((org) => (
            <Card
              key={org.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/verification/${org.id}`)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{org.canonical_name}</p>
                    <p className="text-sm text-muted-foreground">{org.address_city} — {org.address_state_or_region?.replace(" Region", "")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className={cn("w-2.5 h-2.5 rounded-full", confidenceDot(org.reliability_score))} />
                    <span className="text-sm font-medium">{org.reliability_score?.toFixed(1) ?? "—"}/10</span>
                  </div>
                  <Badge
                    variant={org.idp_status === "verified" ? "default" : org.idp_status === "flagged" ? "destructive" : "secondary"}
                    className="capitalize"
                  >
                    {org.idp_status ? t(org.idp_status as any) : "—"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
          {pendingOrgs.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-success" />
                <p>{t("allVerified")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return <VerificationDetail orgId={id} />;
};

/** Clean markdown / OCR formatting from the description for display. */
function cleanDocumentText(raw: string): string {
  return raw
    .replace(/\*\*/g, "")           // remove markdown bold
    .replace(/```\w*/g, "")         // remove code fences
    .replace(/^Extracted Text:\s*/im, "")
    .replace(/---\s*Medical observations\s*---/i, "\n--- Medical observations ---\n")
    .replace(/^- /gm, "\u2022 ")    // bullet points
    .trim();
}

/** Highlight a search term in text by wrapping it in a <mark>. */
function highlightText(text: string, term: string | null): React.ReactNode[] {
  if (!term) return [text];
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return text.split(regex).map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-primary/25 text-primary-foreground rounded px-0.5">{part}</mark>
      : <span key={i}>{part}</span>
  );
}

const VerificationDetail: React.FC<{ orgId: string }> = ({ orgId }) => {
  const { t } = useLanguage();
  const { addPendingChange, connectionStatus, hasPermission } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ["organization", orgId],
    queryFn: () => getOrganizationById(orgId),
  });

  const canApprove = hasPermission("approve_records");
  const canFlag = hasPermission("flag_records");
  const canEdit = hasPermission("edit_records");
  const [activeField, setActiveField] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Initialize form data when org loads
  React.useEffect(() => {
    if (org) {
      setFormData({
        canonical_name: org.canonical_name,
        organization_type: org.organization_type,
        facility_type_id: org.facility_type_id || "",
        address_city: org.address_city || "",
        address_state_or_region: org.address_state_or_region || "",
        address_line1: org.address_line1 || "",
        official_phone: org.official_phone || "",
        email: org.email || "",
        official_website: org.official_website || "",
        capacity: org.capacity?.toString() || "",
        number_doctors: org.number_doctors?.toString() || "",
        year_established: org.year_established?.toString() || "",
        description: org.description || "",
      });
    }
  }, [org]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <Skeleton className="lg:col-span-5 h-96" />
          <Skeleton className="lg:col-span-4 h-96" />
          <Skeleton className="lg:col-span-3 h-96" />
        </div>
      </div>
    );
  }

  if (!org) {
    return <div className="text-center py-12 text-muted-foreground">{t("noData")}</div>;
  }

  const confidences = org.field_confidences || {};
  const missingFields = fieldKeys.filter((k) => !formData[k]);

  /** Build the update payload from form data. */
  const buildPayload = (extra: Partial<Organization> = {}): Partial<Organization> => ({
    canonical_name: formData.canonical_name,
    organization_type: formData.organization_type || "facility",
    facility_type_id: formData.facility_type_id || null,
    address_city: formData.address_city || null,
    address_state_or_region: formData.address_state_or_region || null,
    address_line1: formData.address_line1 || null,
    official_phone: formData.official_phone || null,
    email: formData.email || null,
    official_website: formData.official_website || null,
    capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
    number_doctors: formData.number_doctors ? parseInt(formData.number_doctors, 10) : null,
    year_established: formData.year_established ? parseInt(formData.year_established, 10) : null,
    description: formData.description || null,
    ...extra,
  });

  const handleSave = async () => {
    if (connectionStatus === "offline") {
      addPendingChange({ type: "edit", description: `Edited ${org.canonical_name}` });
      toast.info("Saved to local queue");
      return;
    }
    setSaving(true);
    try {
      await updateOrganization(orgId, buildPayload());
      queryClient.invalidateQueries({ queryKey: ["organization", orgId] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Organization data saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setSaving(true);
    try {
      await updateOrganization(orgId, buildPayload({ idp_status: "verified" }));
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      toast.success("Organization verified and approved");
      navigate("/verification");
    } catch (err: any) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setSaving(false);
    }
  };

  const handleFlag = async () => {
    setSaving(true);
    try {
      await updateOrganization(orgId, buildPayload({ idp_status: "flagged" }));
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      toast.warning("Organization flagged for review");
      navigate("/verification");
    } catch (err: any) {
      toast.error(err.message || "Failed to flag");
    } finally {
      setSaving(false);
    }
  };

  // The value the user is currently editing, used to highlight in the document view
  const activeValue = activeField ? formData[activeField] : null;

  // Build the extracted document text for the original document panel
  const documentText = org.description
    ? cleanDocumentText(org.description)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("verification")}</h1>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="w-4 h-4" /> {t("save")}
            </Button>
          )}
          {canApprove && (
            <Button onClick={handleApprove} disabled={saving} className="gap-1.5">
              <CheckCircle className="w-4 h-4" /> {t("approve")}
            </Button>
          )}
          {canFlag && (
            <Button variant="destructive" onClick={handleFlag} disabled={saving} className="gap-1.5">
              <Flag className="w-4 h-4" /> {t("flagForReview")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left — Original Document View */}
        <Card className="lg:col-span-5">
          <CardHeader><CardTitle className="text-base">{t("originalDocument")}</CardTitle></CardHeader>
          <CardContent>
            {documentText ? (
              <div className="bg-muted rounded-lg p-4 max-h-[70vh] overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap">
                {documentText.split("\n").map((line, i) => {
                  const isSectionHeader = /^---/.test(line) || /^Medical observations/i.test(line.trim());
                  const isBullet = line.startsWith("\u2022");
                  return (
                    <div
                      key={i}
                      className={cn(
                        isSectionHeader && "font-semibold text-primary mt-3 mb-1 border-t pt-2",
                        isBullet && "pl-3 text-muted-foreground",
                        !line.trim() && "h-3",
                      )}
                    >
                      {activeValue && activeValue.length > 2 && line.toLowerCase().includes(activeValue.toLowerCase())
                        ? highlightText(line, activeValue)
                        : line || "\u00A0"}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-muted rounded-lg aspect-[3/4] flex flex-col items-center justify-center text-muted-foreground gap-3">
                <FileText className="w-10 h-10" />
                <p className="text-sm text-center px-4">
                  No original document text available.<br />
                  The source document was not processed via IDP.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Center — Extracted fields */}
        <Card className="lg:col-span-4">
          <CardHeader><CardTitle className="text-base">{t("extractedData")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {fieldKeys.map((key) => {
              const confidence = confidences[key];
              const pct = confidence !== undefined ? Math.round(confidence * 100) : undefined;
              const isTextarea = key === "description";
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-sm">{t(key as any)}</Label>
                    {pct !== undefined && (
                      <Badge className={cn("text-xs gap-1", confidenceColor(pct))}>
                        <div className="w-1.5 h-1.5 rounded-full bg-current" />
                        {pct}%
                      </Badge>
                    )}
                  </div>
                  {isTextarea ? (
                    <Textarea
                      value={formData[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      onFocus={() => setActiveField(key)}
                      onBlur={() => setActiveField(null)}
                      rows={2}
                    />
                  ) : (
                    <Input
                      value={formData[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      onFocus={() => setActiveField(key)}
                      onBlur={() => setActiveField(null)}
                    />
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Right — Data Completeness sidebar */}
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">{t("dataCompleteness")}</CardTitle></CardHeader>
          <CardContent>
            {missingFields.length === 0 ? (
              <p className="text-sm text-success flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> {t("allFieldsComplete")}
              </p>
            ) : (
              <div className="space-y-2">
                {missingFields.map((field) => (
                  <div key={field} className="flex items-center justify-between p-2 rounded-md bg-muted">
                    <span className="text-sm">{t(field as any)}</span>
                    {highImpactFields.includes(field) ? (
                      <Badge className="bg-warning text-warning-foreground text-xs gap-1">
                        <AlertTriangle className="w-3 h-3" /> {t("highImpact")}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("missingField")}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Verification;
