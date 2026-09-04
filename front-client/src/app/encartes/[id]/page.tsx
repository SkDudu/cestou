"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Plus } from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { ClubPrice } from "@/components/ClubPrice";
import { ConditionBadge } from "@/components/ConditionBadge";
import {
  Button,
  EmptyState,
  Input,
  ListSurface,
  Skeleton,
} from "@/components/ui";

export default function EncarteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const flyerId = id as Id<"flyers">;
  const [q, setQ] = useState("");
  const data = useQuery(api.clientOffers.listFlyerOffers, {
    flyerId,
    q: q.trim().length >= 2 ? q : undefined,
  });
  const ensureList = useMutation(api.clientLists.getOrCreateDefaultList);
  const addItem = useMutation(api.clientLists.addListItem);

  async function add(name: string, offerId: Id<"offers">) {
    const listId = await ensureList({});
    await addItem({ listId, queryText: name, offerId });
  }

  return (
    <AppShell
      title={data?.supermarket?.name ?? "Encarte"}
      subtitle={data?.flyer?.title ?? "Ofertas validadas deste encarte."}
      actions={
        <Link
          href="/encartes"
          className="inline-flex items-center gap-2 text-sm text-[var(--ds-color-muted-foreground)] hover:text-[var(--ds-color-foreground)]"
        >
          <ArrowLeft size={16} aria-hidden />
          Voltar
        </Link>
      }
    >
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filtrar ofertas…"
        aria-label="Filtrar ofertas do encarte"
        className="mb-6 max-w-md"
      />
      {!data ? (
        <Skeleton className="h-64 w-full" />
      ) : data.offers.length === 0 ? (
        <EmptyState
          title="Nenhuma oferta vigente"
          body="Este encarte não tem ofertas validadas no momento."
        />
      ) : (
        <ListSurface>
          {data.offers.map((o) => (
            <li
              key={o._id}
              className="flex items-start justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="font-medium tracking-tight">{o.name}</p>
                <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                  {[o.brand, o.quantity, o.unit].filter(Boolean).join(" · ")}
                </p>
                <ConditionBadge condition={o.condition} />
              </div>
              <div className="flex items-center gap-3">
                <ClubPrice
                  publicPrice={o.publicPrice}
                  memberPrice={o.memberPrice}
                  membershipName={o.membershipName}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void add(o.name, o._id)}
                >
                  <Plus size={14} weight="bold" aria-hidden />
                  Lista
                </Button>
              </div>
            </li>
          ))}
        </ListSurface>
      )}
    </AppShell>
  );
}
