import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageContext";
import { GHANA_REGIONS, type GhanaRegion } from "@/data/types";

// Healthcare-specific roles
export type Role =
  | "facilityAdmin"
  | "medicalDataOfficer"
  | "clinicalReviewer"
  | "dataEntryClerk"
  | "auditor";

// Granular permissions
export type Permission =
  | "view_dashboard"
  | "view_analytics"
  | "upload_files"
  | "add_records"
  | "edit_records"
  | "delete_records"
  | "verify_records"
  | "approve_records"
  | "flag_records"
  | "view_database"
  | "export_data"
  | "manage_facility"
  | "view_logs"
  | "manage_users"
  | "manage_departments";

// Permission map per role
export const rolePermissions: Record<Role, Permission[]> = {
  facilityAdmin: [
    "view_dashboard", "view_analytics", "upload_files", "add_records",
    "edit_records", "delete_records", "verify_records", "approve_records",
    "flag_records", "view_database", "export_data", "manage_facility",
    "view_logs", "manage_users", "manage_departments",
  ],
  medicalDataOfficer: [
    "view_dashboard", "view_analytics", "upload_files", "add_records",
    "edit_records", "verify_records", "approve_records", "flag_records",
    "view_database", "export_data",
  ],
  clinicalReviewer: [
    "view_dashboard", "verify_records", "approve_records", "flag_records",
    "view_database",
  ],
  dataEntryClerk: [
    "view_dashboard", "upload_files", "add_records", "view_database",
  ],
  auditor: [
    "view_dashboard", "view_analytics", "view_database", "view_logs", "export_data",
  ],
};

export const allRoles: Role[] = [
  "facilityAdmin",
  "medicalDataOfficer",
  "clinicalReviewer",
  "dataEntryClerk",
  "auditor",
];

export type ConnectionStatus = "online" | "syncing" | "offline";

// Region filter replaces the old facility switcher
export { GHANA_REGIONS };

interface PendingChange {
  id: string;
  type: string;
  description: string;
  timestamp: Date;
}

interface AppContextType {
  role: Role;
  setRole: (role: Role) => void;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (...permissions: Permission[]) => boolean;
  selectedRegion: string; // "all" or a specific GhanaRegion
  setSelectedRegion: (region: string) => void;
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
  pendingChanges: PendingChange[];
  addPendingChange: (change: Omit<PendingChange, "id" | "timestamp">) => void;
  syncChanges: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role>("facilityAdmin");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("online");
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  const hasPermission = useCallback(
    (permission: Permission) => rolePermissions[role].includes(permission),
    [role]
  );

  const hasAnyPermission = useCallback(
    (...permissions: Permission[]) => permissions.some((p) => rolePermissions[role].includes(p)),
    [role]
  );

  const addPendingChange = useCallback(
    (change: Omit<PendingChange, "id" | "timestamp">) => {
      if (connectionStatus === "offline") {
        setPendingChanges((prev) => [
          ...prev,
          { ...change, id: crypto.randomUUID(), timestamp: new Date() },
        ]);
      }
    },
    [connectionStatus]
  );

  const syncChanges = useCallback(() => {
    if (pendingChanges.length === 0) return;
    setConnectionStatus("syncing");
    setTimeout(() => {
      setPendingChanges([]);
      setConnectionStatus("online");
      toast.success("Sync complete");
    }, 2000);
  }, [pendingChanges]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (connectionStatus === "online" && pendingChanges.length > 0) {
      syncChanges();
    }
  }, [connectionStatus]);

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        hasPermission,
        hasAnyPermission,
        selectedRegion,
        setSelectedRegion,
        connectionStatus,
        setConnectionStatus,
        pendingChanges,
        addPendingChange,
        syncChanges,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
};
