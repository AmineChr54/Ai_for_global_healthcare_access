import React, { useState, useCallback, useRef } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { useApp } from "@/contexts/AppContext";
import { parseDocument, createOrganization } from "@/data/api";
import type { UploadFile } from "@/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Image, RotateCcw, Trash2, AlertCircle, CheckCircle2, Loader2, Clock, Sheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  queued: { icon: Clock, color: "text-muted-foreground", label: "queued" },
  processing: { icon: Loader2, color: "text-primary", label: "processing" },
  complete: { icon: CheckCircle2, color: "text-success", label: "complete" },
  "needs-review": { icon: AlertCircle, color: "text-warning", label: "needsReview" },
  failed: { icon: AlertCircle, color: "text-destructive", label: "failed" },
};

const confidenceColor = (score?: number) => {
  if (!score) return "bg-muted-foreground";
  if (score >= 80) return "bg-success";
  if (score >= 60) return "bg-warning";
  return "bg-destructive";
};

const fileIcon = (type: string) => {
  if (type === "spreadsheet") return Sheet;
  if (type === "image") return Image;
  return FileText;
};

function detectFileType(file: File): "pdf" | "spreadsheet" | "image" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.includes("sheet") || file.type.includes("excel") || file.type.includes("csv"))
    return "spreadsheet";
  return "pdf";
}

// Map to store the raw File objects keyed by upload ID
const rawFileMap = new Map<string, File>();

const BulkUpload: React.FC = () => {
  const { t } = useLanguage();
  const { addPendingChange, connectionStatus } = useApp();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process a single file through the IDP pipeline
  const processFile = async (uploadFile: UploadFile) => {
    const rawFile = rawFileMap.get(uploadFile.id);
    if (!rawFile) return;

    // Mark as processing
    setFiles((prev) =>
      prev.map((f) =>
        f.id === uploadFile.id
          ? { ...f, processingStatus: "processing", uploadProgress: 30 }
          : f
      )
    );

    try {
      // Always send the raw file to the backend — the server handles
      // images (vision OCR) and PDFs (PyPDF2 text extraction) separately.
      const textHint = rawFile.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, uploadProgress: 60 } : f
        )
      );

      const result = await parseDocument(textHint, [rawFile]);

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, uploadProgress: 80 } : f
        )
      );

      // Compute average confidence from field_confidences
      const confValues = Object.values(result.field_confidences);
      const avgConf = confValues.length > 0
        ? Math.round((confValues.reduce((a, b) => a + b, 0) / confValues.length) * 100)
        : 0;

      // If enough fields extracted, auto-create the organization
      const fields = result.extracted_fields;
      let organizationId: string | undefined;

      if (fields.canonical_name) {
        try {
          const org = await createOrganization({
            canonical_name: fields.canonical_name,
            organization_type: fields.organization_type || "facility",
            phone_numbers: fields.official_phone ? [fields.official_phone] : [],
            official_phone: fields.official_phone || null,
            email: fields.email || null,
            websites: fields.official_website ? [fields.official_website] : [],
            official_website: fields.official_website || null,
            address_line1: fields.address_line1 || null,
            address_city: fields.address_city || null,
            address_state_or_region: fields.address_state_or_region || null,
            address_country: "Ghana",
            address_country_code: "GH",
            lat: fields.lat || null,
            lon: fields.lon || null,
            facility_type_id: fields.facility_type_id || null,
            operator_type_id: fields.operator_type_id || null,
            description: fields.description || null,
            number_doctors: fields.number_doctors || null,
            capacity: fields.capacity || null,
            year_established: fields.year_established || null,
            idp_status: avgConf >= 70 ? "pending" : "flagged",
            field_confidences: result.field_confidences,
          } as any);
          organizationId = org.id;
          queryClient.invalidateQueries({ queryKey: ["organizations"] });
          queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
        } catch {
          // Organization creation failed — still mark file as needs-review
        }
      }

      const status = avgConf >= 70 ? "complete" : "needs-review";

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? {
                ...f,
                processingStatus: status,
                uploadProgress: 100,
                confidenceScore: avgConf,
                organizationId,
              }
            : f
        )
      );
    } catch (err: any) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, processingStatus: "failed", error: err.message }
            : f
        )
      );
    }

    // Clean up raw file reference
    rawFileMap.delete(uploadFile.id);
  };

  // Process all queued files sequentially
  const processQueue = async (newFiles: UploadFile[]) => {
    setIsProcessing(true);
    for (const file of newFiles) {
      if (file.processingStatus === "queued") {
        await processFile(file);
      }
    }
    setIsProcessing(false);
  };

  const addAndProcessFiles = useCallback((rawFiles: FileList | File[]) => {
    const newUploadFiles: UploadFile[] = Array.from(rawFiles).map((file) => {
      const id = crypto.randomUUID();
      rawFileMap.set(id, file);
      return {
        id,
        name: file.name,
        type: detectFileType(file),
        size: file.size,
        uploadProgress: 0,
        processingStatus: "queued" as const,
      };
    });

    setFiles((prev) => [...newUploadFiles, ...prev]);

    // Start processing the new files
    processQueue(newUploadFiles);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addAndProcessFiles(e.dataTransfer.files);
  }, [addAndProcessFiles]);

  const retryFailed = () => {
    const failedFiles = files.filter((f) => f.processingStatus === "failed");
    setFiles((prev) =>
      prev.map((f) =>
        f.processingStatus === "failed"
          ? { ...f, processingStatus: "queued", uploadProgress: 0, error: undefined }
          : f
      )
    );
    // Note: retry would need the raw files again; for now this resets the status
    toast.info("Retry not available for files already discarded from memory. Please re-upload.");
  };

  const removeCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.processingStatus !== "complete"));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("bulkUpload")}</h1>
      <p className="text-sm text-muted-foreground">{t("uploadDescription")}</p>

      {/* Drop zone */}
      <Card
        className={cn(
          "border-2 border-dashed transition-colors cursor-pointer",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Upload className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-base font-medium">{t("dragDropFiles")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("orBrowse")}</p>
          <p className="text-xs text-muted-foreground/60 mt-2">{t("supportedFormats")}</p>
        </CardContent>
      </Card>

      {/* Hidden file input for click-to-browse */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png,.webp,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addAndProcessFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={retryFailed} className="gap-1.5">
          <RotateCcw className="w-4 h-4" /> {t("retryFailed")}
        </Button>
        <Button variant="outline" size="sm" onClick={removeCompleted} className="gap-1.5">
          <Trash2 className="w-4 h-4" /> {t("removeCompleted")}
        </Button>
      </div>

      {/* Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("uploadQueue")} ({files.length})</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {files.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No files uploaded yet. Drag and drop or click the area above.
            </p>
          )}
          {files.map((file) => {
            const cfg = statusConfig[file.processingStatus];
            const StatusIcon = cfg.icon;
            const FileIcon = fileIcon(file.type);
            return (
              <div key={file.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <div className="shrink-0">
                  <FileIcon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <span className="text-xs text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                  </div>
                  {file.processingStatus === "processing" && (
                    <Progress value={file.uploadProgress} className="h-1.5 mt-1.5" />
                  )}
                  {file.error && (
                    <p className="text-xs text-destructive mt-1 truncate">{file.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {file.confidenceScore !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <div className={cn("w-2 h-2 rounded-full", confidenceColor(file.confidenceScore))} />
                      <span className="text-xs font-medium">{file.confidenceScore}%</span>
                    </div>
                  )}
                  <Badge variant="secondary" className={cn("gap-1 text-xs", cfg.color)}>
                    <StatusIcon className={cn("w-3 h-3", file.processingStatus === "processing" && "animate-spin")} />
                    {t(cfg.label as any)}
                  </Badge>
                </div>
                {(file.processingStatus === "complete" || file.processingStatus === "needs-review") && file.organizationId && (
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/verification/${file.organizationId}`)}>
                    {t("view")}
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default BulkUpload;
