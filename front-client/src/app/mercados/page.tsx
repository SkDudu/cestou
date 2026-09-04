"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Star } from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { EmptyState, Panel, Skeleton } from "@/components/ui";
import { formatDistanceKm } from "@/lib/format";

export default function MercadosPage() {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(
    api.clientStores.listStoresForMe,
    isAuthenticated ? {} : "skip",
  );
  const toggle = useMutation(api.clientStores.toggleFavoriteStore);

  const loc = data?.location;
  const locLabel = loc ? `${loc.city} — ${loc.state}` : null;

  async function onToggle(storeId: Id<"stores">) {
    await toggle({ storeId });
  }

  const favorites = data?.stores.filter((s) => s.isFavorite) ?? [];
  const others = data?.stores.filter((s) => !s.isFavorite) ?? [];

  return (
    <AppShell
      locationLabel={locLabel}
      title="Mercados"
      subtitle="Todas as redes e filiais ativas. Favoritos restringem só a comparação da lista."
    >
      {!data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : data.stores.length === 0 ? (
        <EmptyState
          title="Nenhuma filial ativa"
          body="Não há lojas ativas cadastradas no sistema."
        />
      ) : (
        <div className="grid gap-10 xl:grid-cols-[1fr_1.2fr]">
          <section>
            <h2 className="ds-label-caps text-[var(--ds-color-primary)]">
              Meus mercados
            </h2>
            {favorites.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--ds-color-muted-foreground)]">
                Nenhum favorito ainda — marque na coluna ao lado.
              </p>
            ) : (
              <ul className="mt-4 space-y-3 stagger-in">
                {favorites.map((s) => (
                  <StoreRow
                    key={s._id}
                    name={s.name}
                    networkName={s.networkName}
                    distanceKm={s.distanceKm}
                    offerCount={s.offerCount}
                    favorited
                    onToggle={() => void onToggle(s._id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="ds-label-caps">
            Outros mercados
          </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 stagger-in">
              {others.map((s) => (
                <StoreRow
                  key={s._id}
                  name={s.name}
                  networkName={s.networkName}
                  distanceKm={s.distanceKm}
                  offerCount={s.offerCount}
                  favorited={false}
                  onToggle={() => void onToggle(s._id)}
                />
              ))}
            </ul>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function StoreRow({
  name,
  networkName,
  distanceKm,
  offerCount,
  favorited,
  onToggle,
}: {
  name: string;
  networkName: string;
  distanceKm: number | null;
  offerCount: number;
  favorited: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <Panel className="flex items-center justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          <p className="truncate font-medium tracking-tight">{name}</p>
          <p className="mt-1 font-mono text-xs text-[var(--ds-color-muted-foreground)]">
            {networkName} · {formatDistanceKm(distanceKm)} · {offerCount} ofertas
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={favorited}
          aria-label={favorited ? "Remover dos favoritos" : "Favoritar"}
          className={`inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors duration-200 active:scale-[0.98] ${
            favorited
              ? "text-[var(--ds-color-accent)]"
              : "text-[var(--ds-color-muted-foreground)] hover:text-[var(--ds-color-foreground)]"
          }`}
        >
          <Star size={16} weight={favorited ? "fill" : "regular"} aria-hidden />
          {favorited ? "Favorito" : "Favoritar"}
        </button>
      </Panel>
    </li>
  );
}
