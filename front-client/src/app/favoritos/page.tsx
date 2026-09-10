"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Heart } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Button, EmptyState, Panel, Skeleton } from "@/components/ui";
import { clientApi } from "@/lib/api";
type Favorite = { canonicalProductId: string; canonicalProduct: { canonicalName: string; quantity: string | null; unit: string | null; brand: { name: string } | null } };
export default function FavoritosPage() {
  const [items, setItems] = useState<Favorite[] | null>(null);
  useEffect(() => { void clientApi<Favorite[]>("/products/favorites").then(setItems).catch(() => setItems([])); }, []);
  async function remove(item: Favorite) { await clientApi(`/products/${item.canonicalProductId}/favorite`, { method: "PUT" }); setItems((current) => current?.filter((entry) => entry.canonicalProductId !== item.canonicalProductId) ?? null); }
  return <AppShell title="Favoritos" subtitle="Produtos canônicos que você marcou.">{!items ? <Skeleton className="h-40 w-full" /> : items.length === 0 ? <EmptyState title="Nenhum produto favorito" body="Na busca, toque no coração de um produto para guardá-lo aqui." action={<Link href="/busca"><Button variant="ghost">Ir para busca</Button></Link>} /> : <ul className="grid gap-3 md:grid-cols-2">{items.map((item) => <li key={item.canonicalProductId}><Panel className="flex justify-between gap-4"><div><p className="font-medium">{item.canonicalProduct.canonicalName}</p><p className="text-xs text-[var(--ds-color-muted-foreground)]">{[item.canonicalProduct.brand?.name, item.canonicalProduct.quantity, item.canonicalProduct.unit].filter(Boolean).join(" · ")}</p></div><button type="button" onClick={() => void remove(item)} className="text-[var(--ds-color-accent)]"><Heart size={18} weight="fill" /></button></Panel></li>)}</ul>}</AppShell>;
}
