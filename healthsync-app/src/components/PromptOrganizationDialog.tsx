import React, { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/i18n/LanguageContext";
import type { Organization, FacilityType, OperatorType, IDPTermMapping, IDPResult } from "@/data/types";
import { ALL_FACILITY_TYPES, ALL_OPERATOR_TYPES, GHANA_REGIONS } from "@/data/types";
import { createOrganization, parseDocument } from "@/data/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, ArrowRight, Check, AlertCircle, Paperclip, X, FileText, Image, File } from "lucide-react";
import { cn } from "@/lib/utils";

interface Attachment {
  file: File;
  id: string;
  preview?: string;
}

const ACCEPTED_FILE_TYPES = ".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png,.webp";
const MAX_FILE_SIZE_MB = 10;

const fileIcon = (type: string) => {
  if (type.startsWith("image/")) return Image;
  if (type.includes("pdf") || type.includes("document") || type.includes("text")) return FileText;
  return File;
};

interface PromptOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (org: Organization) => void;
}

const EXAMPLE_PROMPT = `Korle Bu Teaching Hospital is a large public hospital located on Guggisberg Avenue in Accra, Greater Accra Region, Ghana. It was established in 1923 and has a bed capacity of 2,000 with over 250 doctors. The facility specializes in cardiology, neurology, and general surgery. Contact: +233302665401, email info@kfrth.gov.gh, website https://kfrth.gov.gh. Coordinates: 5.5349, -0.2253.`;

// All form field keys in display order
const ALL_FORM_FIELDS = [
  "canonical_name", "organization_type", "facility_type_id", "operator_type_id",
  "address_city", "address_state_or_region", "address_line1",
  "official_phone", "email", "official_website",
  "year_established", "capacity", "number_doctors",
  "lat", "lon", "description", "mission_statement", "accepts_volunteers",
] as const;

const PromptOrganizationDialog: React.FC<PromptOrganizationDialogProps> = ({
  open,
  onOpenChange,
  onSave,
}) => {
  const { t } = useLanguage();
  const [step, setStep] = useState<"prompt" | "form">("prompt");
  const [promptText, setPromptText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [extractedKeys, setExtractedKeys] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isParsing, setIsParsing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [termMappings, setTermMappings] = useState<IDPTermMapping[]>([]);
  const [idpSpecialties, setIdpSpecialties] = useState<string[]>([]);
  const [llmCallsUsed, setLlmCallsUsed] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: Partial<Organization>) => createOrganization(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
      toast.success(t("recordAdded"));
      onSave(undefined as any);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(`Failed to create: ${err.message}`);
    },
  });

  // Reset state when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setStep("prompt");
      setPromptText("");
      setAttachments([]);
      setExtractedKeys(new Set());
      setFormData({});
      setErrors({});
      setIsDragOver(false);
      setTermMappings([]);
      setIdpSpecialties([]);
      setLlmCallsUsed(0);
    }
  }, [open]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newAttachments: Attachment[] = [];
    Array.from(files).forEach((file) => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`${file.name} exceeds ${MAX_FILE_SIZE_MB}MB limit`);
        return;
      }
      const attachment: Attachment = { file, id: crypto.randomUUID() };
      if (file.type.startsWith("image/")) {
        attachment.preview = URL.createObjectURL(file);
      }
      newAttachments.push(attachment);
    });
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleParse = async () => {
    if (!promptText.trim() && attachments.length === 0) return;
    setIsParsing(true);

    try {
      // Call the IDP backend endpoint (0 LLM calls for text, 1 per image)
      const imageFiles = attachments.map((a) => a.file);
      const result: IDPResult = await parseDocument(promptText, imageFiles);

      // Build extracted keys from fields that have non-empty values
      const keys = new Set<string>();
      for (const [k, v] of Object.entries(result.extracted_fields)) {
        if (v !== null && v !== undefined && v !== "") keys.add(k);
      }

      // Merge with defaults for missing fields
      const defaults: Record<string, any> = {
        canonical_name: "", organization_type: "facility", facility_type_id: "hospital",
        operator_type_id: "public", address_city: "", address_state_or_region: "",
        address_line1: "", official_phone: "", email: "", official_website: "",
        description: "", capacity: "", number_doctors: "", year_established: "",
        accepts_volunteers: false, mission_statement: "", lat: "", lon: "",
      };
      setFormData({ ...defaults, ...result.extracted_fields });
      setExtractedKeys(keys);
      setTermMappings(result.term_mappings);
      setIdpSpecialties(result.specialties);
      setLlmCallsUsed(result.llm_calls_used);
      setStep("form");
    } catch (err: any) {
      toast.error(`IDP parsing failed: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.canonical_name?.toString().trim()) newErrors.canonical_name = t("requiredField");
    if (!formData.address_city?.toString().trim()) newErrors.address_city = t("requiredField");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const payload: Partial<Organization> = {
      canonical_name: formData.canonical_name.toString().trim(),
      organization_type: formData.organization_type,
      phone_numbers: formData.official_phone ? [formData.official_phone.toString().trim()] : [],
      official_phone: formData.official_phone?.toString().trim() || null,
      email: formData.email?.toString().trim() || null,
      websites: formData.official_website ? [formData.official_website.toString().trim()] : [],
      official_website: formData.official_website?.toString().trim() || null,
      address_line1: formData.address_line1?.toString().trim() || null,
      address_city: formData.address_city?.toString().trim() || null,
      address_state_or_region: formData.address_state_or_region?.toString().trim() || null,
      address_country: "Ghana",
      address_country_code: "GH",
      lat: formData.lat ? parseFloat(formData.lat) : null,
      lon: formData.lon ? parseFloat(formData.lon) : null,
      facility_type_id: formData.organization_type === "facility" ? (formData.facility_type_id as FacilityType || null) : null,
      operator_type_id: formData.operator_type_id as OperatorType || null,
      description: formData.description?.toString().trim() || null,
      number_doctors: formData.number_doctors ? parseInt(formData.number_doctors, 10) : null,
      capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
      year_established: formData.year_established ? parseInt(formData.year_established, 10) : null,
      mission_statement: formData.mission_statement?.toString().trim() || null,
      accepts_volunteers: formData.accepts_volunteers || false,
      idp_status: "pending",
    };
    createMutation.mutate(payload);
  };

  const update = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const isNGO = formData.organization_type === "ngo";
  const extractedCount = extractedKeys.size;
  const totalFields = ALL_FORM_FIELDS.filter((f) => {
    if (isNGO && f === "facility_type_id") return false;
    if (isNGO && (f === "capacity" || f === "number_doctors")) return false;
    if (!isNGO && f === "mission_statement") return false;
    return true;
  }).length;
  const missingCount = totalFields - extractedCount;

  // Field wrapper with extraction indicator
  const FieldWrapper: React.FC<{ fieldKey: string; children: React.ReactNode; className?: string }> = ({
    fieldKey, children, className,
  }) => {
    const isExtracted = extractedKeys.has(fieldKey);
    return (
      <div className={cn("relative", className)}>
        {step === "form" && (
          <div className="absolute -top-1 -right-1 z-10">
            {isExtracted ? (
              <div className="flex items-center gap-1 bg-success/20 text-success rounded-full px-1.5 py-0.5">
                <Check className="w-3 h-3" />
                <span className="text-[10px] font-medium">{t("extracted" as any)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-warning/20 text-warning rounded-full px-1.5 py-0.5">
                <AlertCircle className="w-3 h-3" />
                <span className="text-[10px] font-medium">{t("needsInput" as any)}</span>
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {step === "prompt" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                {t("addFromPrompt" as any)}
              </DialogTitle>
              <DialogDescription>
                {t("promptDescription" as any)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Prompt input with example as placeholder */}
              <div
                className={cn(
                  "relative rounded-xl border-2 border-dashed transition-colors",
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-border/50 bg-input"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <textarea
                  ref={textareaRef}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder={EXAMPLE_PROMPT}
                  rows={7}
                  className="w-full bg-transparent px-4 pt-3 pb-12 text-sm text-foreground placeholder:text-muted-foreground/50 placeholder:italic resize-none focus:outline-none focus:ring-0"
                />
                {/* Bottom bar inside textarea area */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_FILE_TYPES}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    {t("attachFiles" as any)}
                  </Button>
                  <span className="text-[10px] text-muted-foreground/50">
                    PDF, DOC, TXT, CSV, Images
                  </span>
                </div>
              </div>

              {/* Attached files */}
              {attachments.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {attachments.length} {attachments.length === 1 ? "file" : "files"} attached
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((att) => {
                      const Icon = fileIcon(att.file.type);
                      return (
                        <div
                          key={att.id}
                          className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs group"
                        >
                          {att.preview ? (
                            <img
                              src={att.preview}
                              alt={att.file.name}
                              className="w-6 h-6 rounded object-cover"
                            />
                          ) : (
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="max-w-[140px] truncate">{att.file.name}</span>
                          <span className="text-muted-foreground/60">
                            {(att.file.size / 1024).toFixed(0)}KB
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(att.id)}
                            className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button
                onClick={handleParse}
                disabled={(!promptText.trim() && attachments.length === 0) || isParsing}
                className="gap-2"
              >
                {isParsing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    {t("parsing" as any)}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {t("extractData" as any)}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                {t("reviewExtractedData" as any)}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-3 pt-1">
                <Badge variant="default" className="gap-1">
                  <Check className="w-3 h-3" /> {extractedCount} {t("fieldsExtracted" as any)}
                </Badge>
                {missingCount > 0 && (
                  <Badge variant="secondary" className="gap-1 bg-warning/20 text-warning border-warning/30">
                    <AlertCircle className="w-3 h-3" /> {missingCount} {t("fieldsRemaining" as any)}
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  {llmCallsUsed} LLM {llmCallsUsed === 1 ? "call" : "calls"}
                </Badge>
              </DialogDescription>
            </DialogHeader>

            {/* IDP Medical Taxonomy Mapping Trace */}
            {termMappings.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Medical Taxonomy Mapping
                </p>
                <div className="space-y-1.5">
                  {termMappings.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="text-muted-foreground">"{m.input_term}"</span>
                      <span className="text-muted-foreground/50">→</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {m.match_type} ({Math.round(m.confidence * 100)}%)
                      </Badge>
                      <span className="text-muted-foreground/50">→</span>
                      {m.mapped_specialties.map((s) => (
                        <Badge key={s} className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  ))}
                </div>
                {idpSpecialties.length > 0 && (
                  <div className="pt-1.5 border-t border-border/30 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-medium text-muted-foreground">Resolved:</span>
                    {idpSpecialties.map((s) => (
                      <Badge key={s} variant="default" className="text-[10px] px-1.5 py-0">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              {/* Organization Name */}
              <FieldWrapper fieldKey="canonical_name" className="md:col-span-2">
                <Label className="text-sm mb-1.5 block">
                  {t("organizationName")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={formData.canonical_name}
                  onChange={(e) => update("canonical_name", e.target.value)}
                  className={errors.canonical_name ? "border-destructive" : ""}
                />
                {errors.canonical_name && <p className="text-xs text-destructive mt-1">{errors.canonical_name}</p>}
              </FieldWrapper>

              {/* Org type */}
              <FieldWrapper fieldKey="organization_type">
                <Label className="text-sm mb-1.5 block">{t("organizationType")}</Label>
                <Select value={formData.organization_type} onValueChange={(v) => update("organization_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facility">{t("facilityLabel")}</SelectItem>
                    <SelectItem value="ngo">{t("ngoLabel")}</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>

              {/* Facility type */}
              {!isNGO && (
                <FieldWrapper fieldKey="facility_type_id">
                  <Label className="text-sm mb-1.5 block">{t("facilityType")}</Label>
                  <Select value={formData.facility_type_id} onValueChange={(v) => update("facility_type_id", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_FACILITY_TYPES.map((ft) => (
                        <SelectItem key={ft} value={ft}>{t(ft as any)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
              )}

              {/* Operator type */}
              <FieldWrapper fieldKey="operator_type_id">
                <Label className="text-sm mb-1.5 block">{t("operatorType")}</Label>
                <Select value={formData.operator_type_id} onValueChange={(v) => update("operator_type_id", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_OPERATOR_TYPES.map((ot) => (
                      <SelectItem key={ot} value={ot}>{t(ot as any)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>

              {/* City */}
              <FieldWrapper fieldKey="address_city">
                <Label className="text-sm mb-1.5 block">
                  {t("city")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={formData.address_city}
                  onChange={(e) => update("address_city", e.target.value)}
                  className={errors.address_city ? "border-destructive" : ""}
                />
                {errors.address_city && <p className="text-xs text-destructive mt-1">{errors.address_city}</p>}
              </FieldWrapper>

              {/* Region */}
              <FieldWrapper fieldKey="address_state_or_region">
                <Label className="text-sm mb-1.5 block">{t("region")}</Label>
                <Input
                  value={formData.address_state_or_region}
                  onChange={(e) => update("address_state_or_region", e.target.value)}
                />
              </FieldWrapper>

              {/* Address */}
              <FieldWrapper fieldKey="address_line1" className="md:col-span-2">
                <Label className="text-sm mb-1.5 block">{t("address")}</Label>
                <Input
                  value={formData.address_line1}
                  onChange={(e) => update("address_line1", e.target.value)}
                />
              </FieldWrapper>

              {/* Phone & Email */}
              <FieldWrapper fieldKey="official_phone">
                <Label className="text-sm mb-1.5 block">{t("phone")}</Label>
                <Input
                  value={formData.official_phone}
                  onChange={(e) => update("official_phone", e.target.value)}
                  placeholder="+233..."
                />
              </FieldWrapper>
              <FieldWrapper fieldKey="email">
                <Label className="text-sm mb-1.5 block">{t("email")}</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </FieldWrapper>

              {/* Website */}
              <FieldWrapper fieldKey="official_website">
                <Label className="text-sm mb-1.5 block">{t("website")}</Label>
                <Input
                  value={formData.official_website}
                  onChange={(e) => update("official_website", e.target.value)}
                  placeholder="https://..."
                />
              </FieldWrapper>

              {/* Year established */}
              <FieldWrapper fieldKey="year_established">
                <Label className="text-sm mb-1.5 block">{t("yearEstablished")}</Label>
                <Input
                  type="number"
                  value={formData.year_established}
                  onChange={(e) => update("year_established", e.target.value)}
                />
              </FieldWrapper>

              {/* Capacity & Doctors (facility only) */}
              {!isNGO && (
                <>
                  <FieldWrapper fieldKey="capacity">
                    <Label className="text-sm mb-1.5 block">{t("capacity")}</Label>
                    <Input
                      type="number"
                      value={formData.capacity}
                      onChange={(e) => update("capacity", e.target.value)}
                      placeholder={t("beds") as string}
                    />
                  </FieldWrapper>
                  <FieldWrapper fieldKey="number_doctors">
                    <Label className="text-sm mb-1.5 block">{t("numberDoctors")}</Label>
                    <Input
                      type="number"
                      value={formData.number_doctors}
                      onChange={(e) => update("number_doctors", e.target.value)}
                    />
                  </FieldWrapper>
                </>
              )}

              {/* Coordinates */}
              <FieldWrapper fieldKey="lat">
                <Label className="text-sm mb-1.5 block">{t("latitude")}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.lat}
                  onChange={(e) => update("lat", e.target.value)}
                />
              </FieldWrapper>
              <FieldWrapper fieldKey="lon">
                <Label className="text-sm mb-1.5 block">{t("longitude")}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={formData.lon}
                  onChange={(e) => update("lon", e.target.value)}
                />
              </FieldWrapper>

              {/* Description */}
              <FieldWrapper fieldKey="description" className="md:col-span-2">
                <Label className="text-sm mb-1.5 block">{t("description")}</Label>
                <textarea
                  value={formData.description}
                  onChange={(e) => update("description", e.target.value)}
                  rows={3}
                  className="flex min-h-[80px] w-full rounded-xl border border-border/50 bg-input px-4 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </FieldWrapper>

              {/* Mission statement (NGO) */}
              {isNGO && (
                <FieldWrapper fieldKey="mission_statement" className="md:col-span-2">
                  <Label className="text-sm mb-1.5 block">{t("missionStatement")}</Label>
                  <textarea
                    value={formData.mission_statement}
                    onChange={(e) => update("mission_statement", e.target.value)}
                    rows={3}
                    className="flex min-h-[80px] w-full rounded-xl border border-border/50 bg-input px-4 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </FieldWrapper>
              )}

              {/* Accepts volunteers */}
              <FieldWrapper fieldKey="accepts_volunteers">
                <div className="flex items-center gap-3 pt-4">
                  <Switch
                    checked={formData.accepts_volunteers}
                    onCheckedChange={(v) => update("accepts_volunteers", v)}
                  />
                  <Label className="text-sm">{t("acceptsVolunteers")}</Label>
                </div>
              </FieldWrapper>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep("prompt")} className="gap-1">
                {t("backToPrompt" as any)}
              </Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending} className="gap-2">
                <Check className="w-4 h-4" />
                {createMutation.isPending ? "Saving..." : t("addOrganization")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PromptOrganizationDialog;
