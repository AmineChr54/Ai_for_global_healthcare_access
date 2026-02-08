import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/i18n/LanguageContext";
import { useApp } from "@/contexts/AppContext";
import { getDashboardStats } from "@/data/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileText, AlertCircle, TrendingUp, Upload, Database, Users, Heart, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard: React.FC = () => {
  const { t } = useLanguage();
  const { hasPermission } = useApp();
  const navigate = useNavigate();

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: getDashboardStats,
  });

  const canViewAnalytics = hasPermission("view_analytics");
  const canUpload = hasPermission("upload_files");
  const canViewLogs = hasPermission("view_logs");

  // Read-only dashboard for roles without analytics
  if (!canViewAnalytics && !canUpload) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t("dashboard")}</h1>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>{t("database")} — {t("organizations")}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/database")}>{t("database")}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t("dashboard")}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">{t("dashboard")}</h1>
        <Card>
          <CardContent className="p-8 text-center text-destructive">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p>Failed to load dashboard data. Make sure the API server is running.</p>
            {error && <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  const statCards = [
    { label: t("totalOrganizations"), value: stats.totalOrganizations, icon: Building2, accent: "text-primary bg-primary/10" },
    { label: t("totalFacilities"), value: stats.totalFacilities, icon: FileText, accent: "text-secondary bg-secondary/10" },
    { label: t("totalNGOs"), value: stats.totalNGOs, icon: Heart, accent: "text-primary bg-primary/10" },
    { label: t("pendingVerification"), value: stats.pendingVerification, icon: AlertCircle, accent: "text-warning bg-warning/10" },
    { label: t("avgReliability"), value: `${stats.avgReliability}/10`, icon: TrendingUp, accent: "text-secondary bg-secondary/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("dashboard")}</h1>
        {canUpload && (
          <Button onClick={() => navigate("/upload")} className="gap-2">
            <Upload className="w-4 h-4" /> {t("bulkUpload")}
          </Button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`p-3 rounded-xl ${card.accent}`}>
                <card.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart — Organizations by region */}
        {canViewAnalytics && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("organizationsByRegion")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.byRegion.map(r => ({ ...r, region: r.region.replace(" Region", "") }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsla(222, 30%, 20%, 0.8)" />
                    <XAxis dataKey="region" tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 10 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fill: "hsl(215, 20%, 55%)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(222, 44%, 13%)",
                        border: "1px solid hsl(222, 30%, 20%)",
                        borderRadius: "12px",
                        color: "hsl(210, 40%, 96%)",
                        boxShadow: "0 8px 30px -4px hsla(222, 47%, 4%, 0.5)",
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(38, 92%, 50%)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Activity feed */}
        {canViewLogs && (
          <Card className={!canViewAnalytics ? "lg:col-span-3" : ""}>
            <CardHeader>
              <CardTitle>{t("recentActivity")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.recentActivity.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
              )}
              {stats.recentActivity.slice(0, 5).map((log) => (
                <div key={log.id} className="border-b border-border/30 pb-3 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{log.userName}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{log.action}</p>
                  <p className="text-xs text-muted-foreground/60">{log.details}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
