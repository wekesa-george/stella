"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Keep data fresh for 30s — prevents re-fetching on tab switch / nav
            staleTime: 30 * 1000,
            // Cache for 5 minutes even after component unmounts
            gcTime: 5 * 60 * 1000,
            // Don't refetch on window focus by default (trading data uses WS)
            refetchOnWindowFocus: false,
            // Retry once on failure
            retry: 1,
            retryDelay: 1000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
