"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Skeleton } from "@/components/ui";

const PUBLIC = new Set(["/entrar", "/cadastro"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const pathname = usePathname();
  const router = useRouter();
  const location = useQuery(
    api.clientLocation.getMyDefaultLocation,
    isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !PUBLIC.has(pathname)) {
      router.replace("/entrar");
      return;
    }
    if (isAuthenticated && PUBLIC.has(pathname)) {
      router.replace(location === null ? "/onboarding" : "/");
      return;
    }
    if (
      isAuthenticated &&
      location === null &&
      pathname !== "/onboarding"
    ) {
      router.replace("/onboarding");
    }
  }, [isLoading, isAuthenticated, pathname, location, router]);

  if (isLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  if (!isAuthenticated && !PUBLIC.has(pathname)) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  return <>{children}</>;
}
