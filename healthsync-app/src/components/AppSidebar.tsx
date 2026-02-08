import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Upload, CheckSquare, Database, Settings, ScrollText,
  Globe, Wifi, WifiOff, Loader2, MapPin, Shield
} from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { useApp, allRoles, GHANA_REGIONS, type Role, type Permission } from "@/contexts/AppContext";
import { Language, languageNames } from "@/i18n/translations";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  requiredPermission: Permission;
}

const AppSidebar: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { role, setRole, hasPermission, selectedRegion, setSelectedRegion, connectionStatus, setConnectionStatus, pendingChanges } = useApp();

  const navItems: NavItem[] = [
    { to: "/", icon: LayoutDashboard, label: t("dashboard"), requiredPermission: "view_dashboard" },
    { to: "/upload", icon: Upload, label: t("bulkUpload"), requiredPermission: "upload_files" },
    { to: "/verification", icon: CheckSquare, label: t("verification"), requiredPermission: "verify_records" },
    { to: "/database", icon: Database, label: t("database"), requiredPermission: "view_database" },
    { to: "/settings", icon: Settings, label: t("facilitySettings"), requiredPermission: "manage_facility" },
    { to: "/logs", icon: ScrollText, label: t("activityLogs"), requiredPermission: "view_logs" },
  ];

  const statusColor = connectionStatus === "online"
    ? "bg-success"
    : connectionStatus === "syncing"
    ? "bg-warning animate-pulse-sync"
    : "bg-destructive";
  const statusLabel = connectionStatus === "online" ? t("online") : connectionStatus === "syncing" ? t("syncing") : t("offline");

  return (
    <aside className={cn(
      "floating-panel flex flex-col h-full transition-all duration-300 overflow-hidden",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-glow-amber">
          <span className="text-primary-foreground font-bold text-sm">H+</span>
        </div>
        {!collapsed && (
          <span className="font-bold text-lg tracking-tight text-foreground">
            HealthIngest
          </span>
        )}
      </div>

      {/* Region Filter */}
      {!collapsed && (
        <div className="px-3 py-3">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
            {t("region")}
          </label>
          <Select value={selectedRegion} onValueChange={setSelectedRegion}>
            <SelectTrigger className="bg-input border-border/50 text-foreground text-sm h-9 rounded-xl">
              <MapPin className="w-4 h-4 me-1.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allRegions")}</SelectItem>
              {GHANA_REGIONS.map((r) => (
                <SelectItem key={r} value={r}>{r.replace(" Region", "")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {navItems
          .filter((item) => hasPermission(item.requiredPermission))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-glow-amber"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )
              }
              end={item.to === "/"}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-3 space-y-3 border-t border-border/30">
        {/* Role switcher */}
        {!collapsed && (
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1 font-medium">
              <Shield className="w-3 h-3" /> {t("role")}
            </label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="bg-input border-border/50 text-foreground text-sm h-8 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allRoles.map((r) => (
                  <SelectItem key={r} value={r}>{t(r as any)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Language selector */}
        {!collapsed && (
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1 font-medium">
              <Globe className="w-3 h-3" /> Language
            </label>
            <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
              <SelectTrigger className="bg-input border-border/50 text-foreground text-sm h-8 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(languageNames).map(([code, name]) => (
                  <SelectItem key={code} value={code}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Connection Status */}
        <div className="flex items-center gap-2.5 px-1 py-1">
          <div className={cn("w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-background", statusColor)} />
          {!collapsed && (
            <button
              onClick={() => {
                if (connectionStatus === "online") setConnectionStatus("offline");
                else if (connectionStatus === "offline") setConnectionStatus("online");
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {statusLabel}
              {pendingChanges.length > 0 && (
                <span className="ms-1 text-warning font-medium">({pendingChanges.length} {t("changesPending")})</span>
              )}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
