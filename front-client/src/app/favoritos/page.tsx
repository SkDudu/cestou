"use client";

import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Heart } from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { Button, EmptyState, Panel, Skeleton } from "@/components/ui";

export default function FavoritosPage() {
  const { isAuthenticated } = useConvexAuth();
  const location = useQuery(
    api.clientLocation.getMyDefaultLocation,
    isAuthenticated ? {} : "skip",
  );
  const products = useQuery(
    api.clientFavorites.listMyFavoriteProducts,
    isAuthenticated ? {} : "skip",
  );
  const toggle = useMutation(api.clientFavorites.toggleFavoriteProduct);
  const locLabel = location ? `${location.city} — ${location.state}` : null;

  return (
    <AppShell
      locationLabel={locLabel}
      title="Favoritos"
      subtitle="Produtos canônicos que você marcou. Alertas entram na Fase 4."
    >
      {!products ? (
        <Skeleton className="h-40 w-full" />
      ) : products.length === 0 ? (
        <EmptyState
          title="Nenhum produto favorito"
          body="Na busca, toque no coração de um produto canônico para guardá-lo aqui."
          action={
            <Link href="/busca">
              <Button type="button" variant="ghost">
                Ir para busca
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 stagger-in">
          {products.map((p) => (
            <li key={p.canonicalProductId}>
              <Panel className="flex items-start justify-between gap-4 px-5 py-4">
                <div>
                  <p className="font-medium tracking-tight">{p.name}</p>
                  <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
                    {[p.brand, p.quantity, p.unit].filter(Boolean).join(" · ") ||
                      "Produto canônico"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void toggle({ canonicalProductId: p.canonicalProductId })
                  }
                  className="cursor-pointer text-[var(--ds-color-accent)]"
                  aria-label="Remover dos favoritos"
                >
                  <Heart size={18} weight="fill" />
                </button>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
