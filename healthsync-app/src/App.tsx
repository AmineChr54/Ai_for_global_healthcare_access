import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { AppProvider } from "@/contexts/AppContext";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import BulkUpload from "@/pages/BulkUpload";
import Verification from "@/pages/Verification";
import DatabaseView from "@/pages/DatabaseView";
import FacilitySettings from "@/pages/FacilitySettings";
import ActivityLogs from "@/pages/ActivityLogs";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AppProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/upload" element={<BulkUpload />} />
                <Route path="/verification" element={<Verification />} />
                <Route path="/verification/:id" element={<Verification />} />
                <Route path="/database" element={<DatabaseView />} />
                <Route path="/settings" element={<FacilitySettings />} />
                <Route path="/logs" element={<ActivityLogs />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AppProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
