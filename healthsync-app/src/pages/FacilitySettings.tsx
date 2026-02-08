import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/i18n/LanguageContext";
import { useApp } from "@/contexts/AppContext";
import { getAllOrganizations, getSpecialtiesForOrg, getFactsForOrg, getAffiliationsForOrg } from "@/data/api";
import { ALL_FACILITY_TYPES, ALL_OPERATOR_TYPES, ALL_SPECIALTIES, GHANA_REGIONS } from "@/data/types";
import type { Organization } from "@/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Building2, Phone, MapPin, Users, Plus, X, Mail, Globe, Clock,
  ShieldCheck, Calendar, UserCheck, Stethoscope, Save, Heart, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const FacilitySettings: React.FC = () => {
  const { t } = useLanguage();
  const { selectedRegion } = useApp();

  // Load all orgs, pick the first one as the demo settings org
  const { data: allOrgs, isLoading: orgsLoading, error: orgsError } = useQuery({
    queryKey: ["organizations", "settings"],
    queryFn: getAllOrganizations,
  });

  const org = allOrgs?.[0] ?? null;
  const orgId = org?.id;

  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties", orgId],
    queryFn: () => getSpecialtiesForOrg(orgId!),
    enabled: !!orgId,
  });

  const { data: facts = [] } = useQuery({
    queryKey: ["facts", orgId],
    queryFn: () => getFactsForOrg(orgId!),
    enabled: !!orgId,
  });

  const { data: affiliations = [] } = useQuery({
    queryKey: ["affiliations", orgId],
    queryFn: () => getAffiliationsForOrg(orgId!),
    enabled: !!orgId,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [details, setDetails] = useState<Record<string, any>>({});

  useEffect(() => {
    if (org) {
      setDetails({
        canonical_name: org.canonical_name || "",
        address_line1: org.address_line1 || "",
        address_city: org.address_city || "",
        address_state_or_region: org.address_state_or_region || "",
        official_phone: org.official_phone || "",
        email: org.email || "",
        official_website: org.official_website || "",
        facility_type_id: org.facility_type_id || "",
        operator_type_id: org.operator_type_id || "",
        year_established: org.year_established?.toString() || "",
        capacity: org.capacity?.toString() || "",
        number_doctors: org.number_doctors?.toString() || "",
        description: org.description || "",
        accepts_volunteers: org.accepts_volunteers || false,
      });
    }
  }, [org]);

  const update = (key: string, value: any) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    toast.success(t("recordSaved"));
    setIsEditing(false);
  };

  if (orgsLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t("facilitySettings")}</h1>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (orgsError || !org) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t("facilitySettings")}</h1>
        <Card><CardContent className="p-8 text-center text-destructive">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p>{orgsError ? "Failed to load organization data." : "No organizations found."}</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("facilitySettings")}</h1>
        <div className="flex gap-2">
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} variant="outline" className="gap-2">
              {t("edit")}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="w-4 h-4" /> {t("saveChanges")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* General Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" /> {t("generalInfo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("organizationName")}</Label>
              <Input
                value={details.canonical_name}
                readOnly={!isEditing}
                onChange={(e) => update("canonical_name", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("facilityType")}</Label>
              {isEditing ? (
                <Select value={details.facility_type_id} onValueChange={(v) => update("facility_type_id", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_FACILITY_TYPES.map((ft) => (
                      <SelectItem key={ft} value={ft}>{t(ft as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={details.facility_type_id} readOnly className="mt-1 capitalize" />
              )}
            </div>
            <div>
              <Label>{t("operatorType")}</Label>
              {isEditing ? (
                <Select value={details.operator_type_id} onValueChange={(v) => update("operator_type_id", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_OPERATOR_TYPES.map((ot) => (
                      <SelectItem key={ot} value={ot}>{t(ot as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={details.operator_type_id} readOnly className="mt-1 capitalize" />
              )}
            </div>
            <div>
              <Label>{t("yearEstablished")}</Label>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  type="number"
                  value={details.year_established}
                  readOnly={!isEditing}
                  onChange={(e) => update("year_established", e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" /> {t("contactDetails")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{t("address")}</Label>
              <div className="flex items-center gap-2 mt-1">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  value={details.address_line1}
                  readOnly={!isEditing}
                  onChange={(e) => update("address_line1", e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>{t("city")}</Label>
              <Input
                value={details.address_city}
                readOnly={!isEditing}
                onChange={(e) => update("address_city", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("region")}</Label>
              <Input
                value={details.address_state_or_region}
                readOnly={!isEditing}
                onChange={(e) => update("address_state_or_region", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("phone")}</Label>
              <div className="flex items-center gap-2 mt-1">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  value={details.official_phone}
                  readOnly={!isEditing}
                  onChange={(e) => update("official_phone", e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>{t("email")}</Label>
              <div className="flex items-center gap-2 mt-1">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  type="email"
                  value={details.email}
                  readOnly={!isEditing}
                  onChange={(e) => update("email", e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>{t("website")}</Label>
              <div className="flex items-center gap-2 mt-1">
                <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  value={details.official_website}
                  readOnly={!isEditing}
                  onChange={(e) => update("official_website", e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Operational Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> {t("operationalDetails")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>{t("capacity")}</Label>
              <Input
                type="number"
                value={details.capacity}
                readOnly={!isEditing}
                onChange={(e) => update("capacity", e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t("numberDoctors")}</Label>
              <Input
                type="number"
                value={details.number_doctors}
                readOnly={!isEditing}
                onChange={(e) => update("number_doctors", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label>{t("description")}</Label>
            <Textarea
              value={details.description}
              readOnly={!isEditing}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Specialties */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary" /> {t("specialties")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {specialties.map((s) => (
              <Badge
                key={s.specialty}
                variant="outline"
                className="gap-1.5 py-1.5 px-3 text-sm bg-primary/10 text-primary border-primary/20 capitalize"
              >
                {s.specialty.replace(/([A-Z])/g, " $1").trim()}
              </Badge>
            ))}
            {specialties.length === 0 && <p className="text-sm text-muted-foreground">No specialties recorded</p>}
          </div>
        </CardContent>
      </Card>

      {/* Facts & Capabilities */}
      {facts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> {t("factsAndCapabilities")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {facts.map((f) => (
                <div key={f.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                  <Badge variant="outline" className="text-xs capitalize shrink-0">{f.fact_type}</Badge>
                  <span className="text-sm">{f.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Affiliations */}
      {affiliations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-primary" /> {t("affiliations")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {affiliations.map((a) => (
                <Badge
                  key={a.affiliation}
                  variant="outline"
                  className="py-1.5 px-3 text-sm capitalize"
                >
                  {a.affiliation.replace(/-/g, " ")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FacilitySettings;
