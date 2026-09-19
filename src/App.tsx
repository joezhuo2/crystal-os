import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { shouldRetry } from "@/lib/apiRequest";
import { perfSettings } from "@/lib/perfSettings";
import { retimeCachedQueries } from "@/lib/queryCacheTime";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Default retry is 3. An expired session would produce four doomed requests
// per query before surfacing anything.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry } },
});

// Performance mode drops data no view is using after a minute instead of the
// default five. Each query keeps its own staleTime, so a view reopened within
// that minute still shows cached data without refetching.
let cacheTime: number | null = null;
const applyCacheTime = () => {
  const gcTime = perfSettings.getState().performanceMode ? 60_000 : 5 * 60_000;
  if (gcTime === cacheTime) return;
  cacheTime = gcTime;
  queryClient.setDefaultOptions({ queries: { retry: shouldRetry, gcTime } });
  retimeCachedQueries(queryClient, gcTime);
};
applyCacheTime();
perfSettings.subscribe(applyCacheTime);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
