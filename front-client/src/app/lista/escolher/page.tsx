"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Skeleton } from "@/components/ui";

export default function EscolherRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/lista");
  }, [router]);
  return (
    <AppShell title="Listas">
      <Skeleton className="h-40 w-full" />
    </AppShell>
  );
}
