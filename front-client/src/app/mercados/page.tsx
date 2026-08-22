"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Star } from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/components/SessionProvider";
import { Button, EmptyState, Panel, Skeleton } from "@/components/ui";

export default function MercadosPage() {
  const { userId } = useSession();
  const data = useQuery(
    api.clientStores.listStoresForMe,
    userId ? { userId } : "skip",
  );
  const toggle = useMutation(api.clientStores.toggleFavoriteStore);

  const loc = data?.location;
  const locLabel = loc ? `${loc.city} — ${loc.state}` : null;

  async function onToggle(supermarketId: Id<"supermarkets">) {
    if (!userId) return;
    await toggle({ userId, supermarketId });
  }

  if (userId && data && data.location === null) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-6">
        <EmptyState
          title="Defina sua região"
          body="Sem localização não dá para listar supermercados próximos."
          action={
            <Link href="/onboarding">
              <Button type="button">Ir para onboarding</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const favorites = data?.stores.filter((s) => s.isFavorite) ?? [];
  const others = data?.stores.filter((s) => !s.isFavorite) ?? [];

  return (
    <AppShell
      locationLabel={locLabel}
      title="Mercados"
      subtitle="Favoritos entram na comparação da lista. Sem favorito = todos da região."
    >
      {!data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : data.stores.length === 0 ? (
        <EmptyState
          title="Nenhum supermercado ativo"
          body={`Não há mercados cadastrados em ${loc?.city}/${loc?.state}.`}
        />
      ) : (
        <div className="grid gap-10 xl:grid-cols-[1fr_1.2fr]">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--amber)]">
              Meus mercados
            </h2>
            {favorites.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--muted)]">
                Nenhum favorito ainda — marque na coluna ao lado.
              </p>
            ) : (
              <ul className="mt-4 space-y-3 stagger-in">
                {favorites.map((s) => (
                  <StoreRow
                    key={s._id}
                    name={s.name}
                    offerCount={s.offerCount}
                    favorited
                    onToggle={() => void onToggle(s._id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Outros na região
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 stagger-in">
              {others.map((s) => (
                <StoreRow
                  key={s._id}
                  name={s.name}
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
  offerCount,
  favorited,
  onToggle,
}: {
  name: string;
  offerCount: number;
  favorited: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <Panel className="flex items-center justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          <p className="truncate font-medium tracking-tight">{name}</p>
          <p className="mt-1 font-mono text-xs text-[var(--muted)]">
            {offerCount} ofertas validadas
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={favorited}
          aria-label={favorited ? "Remover dos favoritos" : "Favoritar"}
          className={`inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors duration-200 active:scale-[0.98] ${
            favorited ? "text-[var(--amber)]" : "text-[var(--muted)] hover:text-[var(--fg)]"
          }`}
        >
          <Star size={16} weight={favorited ? "fill" : "regular"} aria-hidden />
          {favorited ? "Favorito" : "Favoritar"}
        </button>
      </Panel>
    </li>
  );
}
