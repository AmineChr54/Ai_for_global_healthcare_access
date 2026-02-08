import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/i18n/LanguageContext";
import type { Organization, FacilityType, OperatorType } from "@/data/types";
import { ALL_FACILITY_TYPES, ALL_OPERATOR_TYPES } from "@/data/types";
import { createOrganization, updateOrganization } from "@/data/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface OrganizationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: Organization | null;
  onSave: (org?: Organization) => void;
}

function getDefaults(org: Organization | null | undefined): Record<string, any> {
  if (org) {
    return {
      canonical_name: org.canonical_name,
      organization_type: org.organization_type,
      facility_type_id: org.facility_type_id || "",
      operator_type_id: org.operator_type_id || "",
      address_line1: org.address_line1 || "",
      address_city: org.address_city || "",
      address_state_or_region: org.address_state_or_region || "",
      official_phone: org.official_phone || "",
      email: org.email || "",
      official_website: org.official_website || "",
      description: org.description || org.organization_description || "",
      capacity: org.capacity?.toString() || "",
      number_doctors: org.number_doctors?.toString() || "",
      year_established: org.year_established?.toString() || "",
      accepts_volunteers: org.accepts_volunteers || false,
      mission_statement: org.mission_statement || "",
      lat: org.lat?.toString() || "",
      lon: org.lon?.toString() || "",
    };
  }
  return {
    canonical_name: "",
    organization_type: "facility",
    facility_type_id: "hospital",
    operator_type_id: "public",
    address_line1: "",
    address_city: "",
    address_state_or_region: "",
    official_phone: "",
    email: "",
    official_website: "",
    description: "",
    capacity: "",
    number_doctors: "",
    year_established: "",
    accepts_volunteers: false,
    mission_statement: "",
    lat: "",
    lon: "",
  };
}

const OrganizationFormDialog: React.FC<OrganizationFormDialogProps> = ({
  open,
  onOpenChange,
  organization,
  onSave,
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const isEditing = !!organization;

  const [formData, setFormData] = useState<Record<string, any>>(() => getDefaults(organization));
  const [errors, setErrors] = useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      setFormData(getDefaults(organization));
      setErrors({});
    }
  }, [open, organization]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<Organization>) => createOrganization(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      toast.success(t("recordAdded"));
      onSave();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(`Failed to create: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Organization>) => updateOrganization(organization!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      toast.success(t("recordUpdated"));
      onSave();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(`Failed to update: ${err.message}`);
    },
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.canonical_name?.trim()) newErrors.canonical_name = t("requiredField");
    if (!formData.address_city?.trim()) newErrors.address_city = t("requiredField");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const payload: Partial<Organization> = {
      canonical_name: formData.canonical_name.trim(),
      organization_type: formData.organization_type,
      phone_numbers: formData.official_phone ? [formData.official_phone.trim()] : [],
      official_phone: formData.official_phone?.trim() || null,
      email: formData.email?.trim() || null,
      websites: formData.official_website ? [formData.official_website.trim()] : [],
      official_website: formData.official_website?.trim() || null,
      address_line1: formData.address_line1?.trim() || null,
      address_city: formData.address_city?.trim() || null,
      address_state_or_region: formData.address_state_or_region?.trim() || null,
      address_country: "Ghana",
      address_country_code: "GH",
      lat: formData.lat ? parseFloat(formData.lat) : null,
      lon: formData.lon ? parseFloat(formData.lon) : null,
      facility_type_id: formData.organization_type === "facility" ? (formData.facility_type_id as FacilityType || null) : null,
      operator_type_id: formData.operator_type_id as OperatorType || null,
      description: formData.description?.trim() || null,
      number_doctors: formData.number_doctors ? parseInt(formData.number_doctors, 10) : null,
      capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
      year_established: formData.year_established ? parseInt(formData.year_established, 10) : null,
      accepts_volunteers: formData.accepts_volunteers || false,
      mission_statement: formData.mission_statement?.trim() || null,
      reliability_score: organization?.reliability_score ?? null,
      reliability_explanation: organization?.reliability_explanation ?? null,
      idp_status: organization?.idp_status || "pending",
    };

    if (isEditing) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const update = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const isNGO = formData.organization_type === "ngo";
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("editOrganization") : t("addOrganization")}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          {/* Organization Name */}
          <div className="md:col-span-2">
            <Label className="text-sm mb-1.5 block">
              {t("organizationName")} <span className="text-destructive">*</span>
            </Label>
            <Input
              value={formData.canonical_name}
              onChange={(e) => update("canonical_name", e.target.value)}
              className={errors.canonical_name ? "border-destructive" : ""}
            />
            {errors.canonical_name && <p className="text-xs text-destructive mt-1">{errors.canonical_name}</p>}
          </div>

          {/* Org type */}
          <div>
            <Label className="text-sm mb-1.5 block">{t("organizationType")}</Label>
            <Select value={formData.organization_type} onValueChange={(v) => update("organization_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="facility">{t("facilityLabel")}</SelectItem>
                <SelectItem value="ngo">{t("ngoLabel")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Facility type */}
          {!isNGO && (
            <div>
              <Label className="text-sm mb-1.5 block">{t("facilityType")}</Label>
              <Select value={formData.facility_type_id} onValueChange={(v) => update("facility_type_id", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_FACILITY_TYPES.map((ft) => (
                    <SelectItem key={ft} value={ft}>{t(ft as any)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Operator type */}
          <div>
            <Label className="text-sm mb-1.5 block">{t("operatorType")}</Label>
            <Select value={formData.operator_type_id} onValueChange={(v) => update("operator_type_id", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_OPERATOR_TYPES.map((ot) => (
                  <SelectItem key={ot} value={ot}>{t(ot as any)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* City */}
          <div>
            <Label className="text-sm mb-1.5 block">
              {t("city")} <span className="text-destructive">*</span>
            </Label>
            <Input
              value={formData.address_city}
              onChange={(e) => update("address_city", e.target.value)}
              className={errors.address_city ? "border-destructive" : ""}
            />
            {errors.address_city && <p className="text-xs text-destructive mt-1">{errors.address_city}</p>}
          </div>

          {/* Region */}
          <div>
            <Label className="text-sm mb-1.5 block">{t("region")}</Label>
            <Input
              value={formData.address_state_or_region}
              onChange={(e) => update("address_state_or_region", e.target.value)}
            />
          </div>

          {/* Address */}
          <div className="md:col-span-2">
            <Label className="text-sm mb-1.5 block">{t("address")}</Label>
            <Input
              value={formData.address_line1}
              onChange={(e) => update("address_line1", e.target.value)}
            />
          </div>

          {/* Phone & Email */}
          <div>
            <Label className="text-sm mb-1.5 block">{t("phone")}</Label>
            <Input
              value={formData.official_phone}
              onChange={(e) => update("official_phone", e.target.value)}
              placeholder="+233..."
            />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">{t("email")}</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>

          {/* Website */}
          <div>
            <Label className="text-sm mb-1.5 block">{t("website")}</Label>
            <Input
              value={formData.official_website}
              onChange={(e) => update("official_website", e.target.value)}
              placeholder="https://..."
            />
          </div>

          {/* Year established */}
          <div>
            <Label className="text-sm mb-1.5 block">{t("yearEstablished")}</Label>
            <Input
              type="number"
              value={formData.year_established}
              onChange={(e) => update("year_established", e.target.value)}
            />
          </div>

          {/* Capacity & Doctors (facility only) */}
          {!isNGO && (
            <>
              <div>
                <Label className="text-sm mb-1.5 block">{t("capacity")}</Label>
                <Input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => update("capacity", e.target.value)}
                  placeholder={t("beds") as string}
                />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">{t("numberDoctors")}</Label>
                <Input
                  type="number"
                  value={formData.number_doctors}
                  onChange={(e) => update("number_doctors", e.target.value)}
                />
              </div>
            </>
          )}

          {/* Coordinates */}
          <div>
            <Label className="text-sm mb-1.5 block">{t("latitude")}</Label>
            <Input
              type="number"
              step="0.0001"
              value={formData.lat}
              onChange={(e) => update("lat", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-sm mb-1.5 block">{t("longitude")}</Label>
            <Input
              type="number"
              step="0.0001"
              value={formData.lon}
              onChange={(e) => update("lon", e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="md:col-span-2">
            <Label className="text-sm mb-1.5 block">{t("description")}</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
            />
          </div>

          {/* Mission statement (NGO) */}
          {isNGO && (
            <div className="md:col-span-2">
              <Label className="text-sm mb-1.5 block">{t("missionStatement")}</Label>
              <Textarea
                value={formData.mission_statement}
                onChange={(e) => update("mission_statement", e.target.value)}
                rows={3}
              />
            </div>
          )}

          {/* Accepts volunteers */}
          <div className="flex items-center gap-3">
            <Switch
              checked={formData.accepts_volunteers}
              onCheckedChange={(v) => update("accepts_volunteers", v)}
            />
            <Label className="text-sm">{t("acceptsVolunteers")}</Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving..." : isEditing ? t("saveChanges") : t("addOrganization")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrganizationFormDialog;
