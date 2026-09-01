"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WorkerSetupModal } from "@/components/admin/WorkerSetupModal";

export default function WorkerSetupPage() {
  return (
    <Suspense fallback={<p className="ds-meta">Carregando…</p>}>
      <WorkerSetupFromRoute />
    </Suspense>
  );
}

function WorkerSetupFromRoute() {
  const router = useRouter();
  const search = useSearchParams();
  return (
    <WorkerSetupModal
      open
      presetSupermarketId={search.get("supermarketId") ?? undefined}
      onClose={() => router.push("/admin/scraper")}
    />
  );
}
