"use client";
import { useEffect, useState } from "react";
import { Star } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, Panel, Skeleton } from "@/components/ui";
import { clientApi } from "@/lib/api";
type Store = { id: string; name: string; isFavorite: boolean; supermarket: { name: string } };
export default function MercadosPage() {
  const [stores, setStores] = useState<Store[] | null>(null);
  useEffect(() => { void clientApi<{ stores: Store[] }>("/stores").then((data) => setStores(data.stores)).catch(() => setStores([])); }, []);
  async function toggle(store: Store) { const result = await clientApi<{ isFavorite: boolean }>(`/stores/${store.id}/favorite`, { method: "PUT" }); setStores((current) => current?.map((entry) => entry.id === store.id ? { ...entry, isFavorite: result.isFavorite } : entry) ?? null); }
  return <AppShell title="Mercados" subtitle="Redes ativas na sua região. Favoritos restringem a comparação da sua lista.">{!stores ? <Skeleton className="h-40 w-full" /> : stores.length === 0 ? <EmptyState title="Nenhum mercado na região" body="Defina sua localização no onboarding ou cadastre filiais no admin." /> : <ul className="grid gap-3 md:grid-cols-2">{stores.map((store) => <li key={store.id}><Panel className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="font-medium">{store.supermarket.name}</p><p className="text-xs text-[var(--ds-color-muted-foreground)]">{store.name === store.supermarket.name ? "Rede" : store.name}</p></div><button type="button" onClick={() => void toggle(store)} className="text-[var(--ds-color-accent)]" aria-label="Alternar favorito"><Star size={20} weight={store.isFavorite ? "fill" : "regular"} /></button></Panel></li>)}</ul>}</AppShell>;
}
