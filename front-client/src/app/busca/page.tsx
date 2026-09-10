"use client";

import { FormEvent, useState } from "react";
import { Heart, Plus } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Button, EmptyState, Input, Panel, Skeleton } from "@/components/ui";
import { clientApi } from "@/lib/api";

type Offer = { id: string; name: string; brand: string | null; quantity: string | null; unit: string | null; price: string; memberPrice: string | null; supermarket: { name: string }; canonicalProduct: { id: string; canonicalName: string } | null };
export default function BuscaPage() {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Offer[] | null>(null); const [saving, setSaving] = useState<string | null>(null);
  async function search(event: FormEvent) { event.preventDefault(); const term = query.trim(); if (term.length < 2) return; setResults(null); try { setResults(await clientApi<Offer[]>(`/search?q=${encodeURIComponent(term)}`)); } catch { setResults([]); } }
  async function add(offer?: Offer) { const queryText = offer?.name ?? query.trim(); if (!queryText) return; setSaving(offer?.id ?? queryText); await clientApi("/lists/default/items", { method: "POST", body: JSON.stringify({ queryText, offerId: offer?.id, canonicalProductId: offer?.canonicalProduct?.id }) }); setSaving(null); }
  async function favorite(offer: Offer) { if (!offer.canonicalProduct) return; await clientApi(`/products/${offer.canonicalProduct.id}/favorite`, { method: "PUT" }); }
  return <AppShell title="Buscar produto" subtitle="Compare ofertas validadas por supermercado."><form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={(event) => void search(event)}><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: arroz 5kg" aria-label="Buscar produto" /><Button type="submit">Buscar</Button></form>{results === null ? <div className="mt-8"><Skeleton className="h-40 w-full" /></div> : results.length === 0 ? <div className="mt-8"><EmptyState title="Nenhum resultado" body="Tente outro termo ou adicione o item à lista mesmo sem oferta." action={<Button variant="ghost" onClick={() => void add()}><Plus size={16} />Adicionar à lista</Button>} /></div> : <ul className="mt-8 grid gap-3 md:grid-cols-2">{results.map((offer) => <li key={offer.id}><Panel className="flex flex-col gap-3"><div className="flex justify-between gap-3"><div><p className="font-medium">{offer.name}</p><p className="text-xs text-[var(--ds-color-muted-foreground)]">{[offer.brand, offer.quantity, offer.unit].filter(Boolean).join(" · ")} · {offer.supermarket.name}</p></div>{offer.canonicalProduct ? <button type="button" onClick={() => void favorite(offer)} className="text-[var(--ds-color-accent)]" aria-label="Favoritar produto"><Heart size={18} /></button> : null}</div><div className="flex items-center justify-between"><strong>R$ {offer.memberPrice ?? offer.price}</strong><Button type="button" variant="outline" onClick={() => void add(offer)} disabled={saving === offer.id}><Plus size={14} />Lista</Button></div></Panel></li>)}</ul>}</AppShell>;
}
