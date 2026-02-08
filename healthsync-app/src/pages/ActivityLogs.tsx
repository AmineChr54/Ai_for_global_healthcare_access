import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/i18n/LanguageContext";
import { getActivityLogs } from "@/data/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

const ActivityLogs: React.FC = () => {
  const { t } = useLanguage();
  const { data: logs, isLoading, error } = useQuery({
    queryKey: ["activityLogs"],
    queryFn: getActivityLogs,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("activityLogs")}</h1>
        <Card><CardContent className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t("activityLogs")}</h1>
        <Card><CardContent className="p-8 text-center text-destructive">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p>Failed to load activity logs.</p>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </CardContent></Card>
      </div>
    );
  }

  const logList = logs ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("activityLogs")}</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("timestamp")}</TableHead>
                <TableHead>{t("user")}</TableHead>
                <TableHead>{t("action")}</TableHead>
                <TableHead>{t("details")}</TableHead>
                <TableHead>{t("region")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logList.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">
                    {new Date(log.timestamp).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="font-medium">{log.userName}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate">{log.details}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.region?.replace(" Region", "") ?? "—"}</TableCell>
                </TableRow>
              ))}
              {logList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {t("noData")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ActivityLogs;
