import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { useLanguage } from "@/i18n/LanguageContext";
import { useApp } from "@/contexts/AppContext";
import { Menu, User, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AppLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { t, isRTL } = useLanguage();
  const { role } = useApp();

  return (
    <div className={`flex h-screen overflow-hidden bg-background ${isRTL ? "flex-row-reverse" : ""}`}>
      {/* Floating sidebar */}
      <div className="p-3 shrink-0">
        <AppSidebar collapsed={sidebarCollapsed} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 py-3 pe-3 gap-3">
        {/* Floating header */}
        <header className="floating-panel h-14 flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="relative hidden md:block">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("search") || "Search..."}
                className="input-pill ps-9 w-64 h-9 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className="bg-primary/15 text-primary border-primary/20 capitalize text-xs font-medium">
              {t(role as any)}
            </Badge>
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center ring-2 ring-primary/20">
              <User className="w-4 h-4 text-primary" />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
