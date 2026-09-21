"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Button, EmptyState, Input, ListSurface, Skeleton } from "@/components/ui";
import { clientApi } from "@/lib/api";

type Offer = { id: string; name: string; brand: string | null; quantity: string | null; unit: string | null; price: string; memberPrice: string | null; canonicalProductId: string | null };
type Flyer = { title: string | null; supermarket: { name: string }; offers: Offer[] };
export default function EncarteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const [data, setData] = useState<Flyer | null>(null); const [query, setQuery] = useState("");
  useEffect(() => { void clientApi<Flyer>(`/flyers/${id}`).then(setData).catch(() => setData({ title: null, supermarket: { name: "Encarte" }, offers: [] })); }, [id]);
  const offers = useMemo(() => data?.offers.filter((offer) => offer.name.toLowerCase().includes(query.trim().toLowerCase())) ?? [], [data, query]);
  async function add(offer: Offer) {
    await clientApi("/lists/default/items", {
      method: "POST",
      body: JSON.stringify({
        queryText: offer.name,
        offerId: offer.id,
        canonicalProductId: offer.canonicalProductId ?? undefined,
      }),
    });
  }
  return <AppShell title={data?.supermarket.name ?? "Encarte"} subtitle={data?.title ?? "Ofertas validadas deste encarte."} actions={<Link href="/encartes" className="inline-flex items-center gap-2 text-sm text-[var(--ds-color-muted-foreground)]"><ArrowLeft size={16} />Voltar</Link>}><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar ofertas…" className="mb-6 max-w-md" />{!data ? <Skeleton className="h-64 w-full" /> : offers.length === 0 ? <EmptyState title="Nenhuma oferta vigente" body="Este encarte não tem ofertas validadas no momento." /> : <ListSurface>{offers.map((offer) => <li key={offer.id} className="flex items-start justify-between gap-4 px-5 py-4"><div><p className="font-medium">{offer.name}</p><p className="text-xs text-[var(--ds-color-muted-foreground)]">{[offer.brand, offer.quantity, offer.unit].filter(Boolean).join(" · ")}</p></div><div className="flex items-center gap-3"><strong>R$ {offer.memberPrice ?? offer.price}</strong><Button type="button" variant="outline" onClick={() => void add(offer)}><Plus size={14} />Lista</Button></div></li>)}</ListSurface>}</AppShell>;
}
