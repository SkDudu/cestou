"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { MagnifyingGlass, Plus, Trophy } from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/components/SessionProvider";
import {
  Button,
  EmptyState,
  Input,
  Money,
  Panel,
  Skeleton,
} from "@/components/ui";

export default function BuscaPage() {
  const { userId } = useSession();
  const location = useQuery(
    api.clientLocation.getMyDefaultLocation,
    userId ? { userId } : "skip",
  );
  const [q, setQ] = useState("");
  const [deferred, setDeferred] = useState("");
  const results = useQuery(
    api.clientOffers.searchOffers,
    userId && deferred.length >= 2 ? { userId, q: deferred } : "skip",
  );
  const ensureList = useMutation(api.clientLists.getOrCreateDefaultList);
  const addItem = useMutation(api.clientLists.addListItem);
  const [added, setAdded] = useState<string | null>(null);

  const locLabel = useMemo(() => {
    if (!location) return null;
    return `${location.city} — ${location.state}`;
  }, [location]);

  async function addOffer(queryText: string, offerId: Id<"offers">) {
    if (!userId) return;
    const listId = await ensureList({ userId });
    await addItem({ userId, listId, queryText, offerId });
    setAdded(offerId);
    setTimeout(() => setAdded(null), 1500);
  }

  async function addQueryOnly(queryText: string) {
    if (!userId) return;
    const listId = await ensureList({ userId });
    await addItem({ userId, listId, queryText });
    setAdded(queryText);
    setTimeout(() => setAdded(null), 1500);
  }

  return (
    <AppShell
      locationLabel={locLabel}
      title="Buscar produto"
      subtitle="Compare preços por mercado a partir de ofertas validadas."
    >
      <form
        className="grid gap-3 md:grid-cols-[1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setDeferred(q.trim());
        }}
      >
        <div className="relative">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ex.: arroz 5kg"
            className="pl-10"
            aria-label="Buscar produto"
          />
        </div>
        <Button type="submit">Buscar</Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {deferred.length >= 2 ? (
          <button
            type="button"
            onClick={() => void addQueryOnly(deferred)}
            className="cursor-pointer text-xs text-[var(--amber)] underline-offset-2 transition-colors hover:underline"
          >
            Adicionar &ldquo;{deferred}&rdquo; à lista sem escolher oferta
          </button>
        ) : null}
        {added ? (
          <p className="text-sm text-[var(--moss)]">Adicionado à lista.</p>
        ) : null}
      </div>

      <div className="mt-8">
        {!deferred ? (
          <EmptyState
            title="Digite e busque"
            body="Resultados agrupam o mesmo produto com preços por supermercado da sua região."
          />
        ) : results === undefined ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            title="Nenhum resultado"
            body={`Não achamos ofertas validadas para “${deferred}”. Tente outro termo ou adicione o item à lista mesmo assim.`}
            action={
              <Button
                type="button"
                variant="ghost"
                onClick={() => void addQueryOnly(deferred)}
              >
                <Plus size={16} weight="bold" aria-hidden />
                Adicionar à lista
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 stagger-in">
            {results.map((g) => (
              <Panel key={g.key} className="flex flex-col p-5">
                <h2 className="text-lg font-semibold tracking-tight">
                  {g.name}
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {[g.brand, g.quantity, g.unit].filter(Boolean).join(" · ")}
                </p>
                <ul className="mt-4 flex-1 space-y-2 border-t border-[var(--line)] pt-4">
                  {g.prices.map((p) => (
                    <li
                      key={p.offerId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-[var(--muted)]">
                        {p.supermarketName}
                      </span>
                      <Money value={p.price} />
                    </li>
                  ))}
                </ul>
                {g.cheapest ? (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                    <p className="inline-flex items-center gap-1.5 text-xs text-[var(--moss)]">
                      <Trophy size={14} weight="fill" aria-hidden />
                      {g.cheapest.supermarketName}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      className="!py-2 !text-xs"
                      onClick={() => void addOffer(g.name, g.cheapest!.offerId)}
                    >
                      <Plus size={14} weight="bold" aria-hidden />
                      Lista
                    </Button>
                  </div>
                ) : null}
              </Panel>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
