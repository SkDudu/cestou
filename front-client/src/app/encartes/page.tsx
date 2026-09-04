"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { EmptyState, Panel, Skeleton } from "@/components/ui";
import { formatDay } from "@/lib/format";

export default function EncartesPage() {
  const { isAuthenticated } = useConvexAuth();
  const location = useQuery(
    api.clientLocation.getMyDefaultLocation,
    isAuthenticated ? {} : "skip",
  );
  const flyers = useQuery(
    api.clientOffers.listNearbyFlyers,
    isAuthenticated ? {} : "skip",
  );
  const locLabel = location ? `${location.city} — ${location.state}` : null;

  return (
    <AppShell
      locationLabel={locLabel}
      title="Encartes"
      subtitle="Todos os encartes publicados e vigentes no sistema."
    >
      {!flyers ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : flyers.length === 0 ? (
        <EmptyState
          title="Nenhum encarte publicado"
          body="Quando houver encartes processados e vigentes, eles aparecem aqui."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 stagger-in">
          {flyers.map((f) => (
            <li key={f._id}>
              <Link href={`/encartes/${f._id}`}>
                <Panel className="transition-colors hover:border-[var(--ds-color-primary)]">
                  <p className="ds-label-caps text-[var(--ds-color-primary)]">
                    {f.supermarketName}
                    {f.storeName ? ` · ${f.storeName}` : ""}
                  </p>
                  <p className="mt-1 text-lg font-semibold tracking-tight">
                    {f.title ?? "Encarte"}
                  </p>
                  <p className="text-sm text-[var(--ds-color-muted-foreground)]">
                    {formatDay(f.validFrom)} → {formatDay(f.validUntil)} ·{" "}
                    {f.offerCount} ofertas
                  </p>
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
