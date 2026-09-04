"use client";

import { useMemo, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Heart, MagnifyingGlass, Plus, Trophy } from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { ClubPrice } from "@/components/ClubPrice";
import {
  Button,
  EmptyState,
  Input,
  Panel,
  Skeleton,
} from "@/components/ui";
import { ConditionBadge } from "@/components/ConditionBadge";
import { PaymentNote } from "@/components/PaymentNote";

export default function BuscaPage() {
  const { isAuthenticated } = useConvexAuth();
  const location = useQuery(
    api.clientLocation.getMyDefaultLocation,
    isAuthenticated ? {} : "skip",
  );
  const [q, setQ] = useState("");
  const [deferred, setDeferred] = useState("");
  const results = useQuery(
    api.clientOffers.searchOffers,
    isAuthenticated && deferred.length >= 2 ? { q: deferred } : "skip",
  );
  const favIds = useQuery(
    api.clientFavorites.listFavoriteProductIds,
    isAuthenticated ? {} : "skip",
  );
  const ensureList = useMutation(api.clientLists.getOrCreateDefaultList);
  const addItem = useMutation(api.clientLists.addListItem);
  const toggleFav = useMutation(api.clientFavorites.toggleFavoriteProduct);
  const [added, setAdded] = useState<string | null>(null);
  const favSet = useMemo(() => new Set(favIds ?? []), [favIds]);

  const locLabel = useMemo(() => {
    if (!location) return null;
    return `${location.city} — ${location.state}`;
  }, [location]);

  async function addOffer(
    queryText: string,
    offerId: Id<"offers">,
    canonicalProductId: Id<"canonicalProducts"> | null,
  ) {
    const listId = await ensureList({});
    await addItem({
      listId,
      queryText,
      offerId,
      canonicalProductId: canonicalProductId ?? undefined,
    });
    setAdded(offerId);
    setTimeout(() => setAdded(null), 1500);
  }

  async function addQueryOnly(queryText: string) {
    const listId = await ensureList({});
    await addItem({ listId, queryText });
    setAdded(queryText);
    setTimeout(() => setAdded(null), 1500);
  }

  return (
    <AppShell
      locationLabel={locLabel}
      title="Buscar produto"
      subtitle="Compare preços por mercado a partir de ofertas validadas e produtos canônicos."
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
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-color-muted-foreground)]"
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
            className="cursor-pointer text-xs text-[var(--ds-color-primary)] underline-offset-2 transition-colors hover:underline"
          >
            Adicionar &ldquo;{deferred}&rdquo; à lista sem escolher oferta
          </button>
        ) : null}
        {added ? (
          <p className="text-sm text-[var(--ds-color-success)]">Adicionado à lista.</p>
        ) : null}
      </div>

      <div className="mt-8">
        {!deferred ? (
          <EmptyState
            title="Digite e busque"
            body="Resultados agrupam o mesmo produto canônico com preços por supermercado da sua região."
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
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {g.name}
                  </h2>
                  {g.canonicalProductId ? (
                    <button
                      type="button"
                      onClick={() =>
                        void toggleFav({
                          canonicalProductId: g.canonicalProductId!,
                        })
                      }
                      className="cursor-pointer text-[var(--ds-color-accent)]"
                      aria-label="Favoritar produto"
                    >
                      <Heart
                        size={18}
                        weight={
                          favSet.has(g.canonicalProductId) ? "fill" : "regular"
                        }
                      />
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                  {[g.brand, g.quantity, g.unit].filter(Boolean).join(" · ")}
                </p>
                <ul className="mt-4 flex-1 space-y-2 border-t border-[var(--ds-color-border)] pt-4">
                  {g.prices.map((p) => (
                    <li
                      key={p.offerId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-[var(--ds-color-muted-foreground)]">
                        {p.supermarketName}
                      </span>
                      <span className="text-right">
                        <ClubPrice
                          publicPrice={p.publicPrice}
                          memberPrice={p.memberPrice}
                          membershipName={p.membershipName}
                        />
                        <PaymentNote
                          installmentCount={p.installmentCount}
                          installmentAmount={p.installmentAmount}
                          installmentInterestFree={p.installmentInterestFree}
                        />
                        <ConditionBadge condition={p.condition} showAll />
                      </span>
                    </li>
                  ))}
                </ul>
                {g.cheapest ? (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--ds-color-border)] pt-4">
                    <p className="inline-flex items-center gap-1.5 text-xs text-[var(--ds-color-success)]">
                      <Trophy size={14} weight="fill" aria-hidden />
                      {g.cheapest.supermarketName}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void addOffer(
                          g.name,
                          g.cheapest!.offerId,
                          g.canonicalProductId,
                        )
                      }
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
