"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { StreamProvider } from "./stream-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <StreamProvider>{children}</StreamProvider>
      <Toaster theme="dark" position="bottom-right" mobileOffset={{ bottom: 76 }} richColors closeButton toastOptions={{ className: "font-sans" }} />
    </QueryClientProvider>
  );
}
