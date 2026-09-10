"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
type Market = Awaited<ReturnType<typeof adminApi.supermarket>>;
export default function SupermarketPage() {
  const { id } = useParams<{ id: string }>(); const [market, setMarket] = useState<Market | null>(null);
  useEffect(() => { void adminApi.supermarket(id).then(setMarket).catch(() => setMarket(null)); }, [id]);
  if (!market) return <p className="p-6 text-sm text-[var(--ds-color-muted-foreground)]">Carregando rede…</p>;
  return <section className="space-y-6 p-6"><Link href="/admin/supermarkets" className="text-sm text-[var(--ds-color-primary)]">← Redes</Link><div><p className="ds-label-caps">Postgres / Prisma</p><h1 className="text-2xl font-bold">{market.name}</h1><p className="text-sm text-[var(--ds-color-muted-foreground)]">{market.city} — {market.state} · {market.active ? "Ativa" : "Inativa"}</p></div><div className="grid gap-3 md:grid-cols-3"><Card label="Filiais" value={market.stores.length} /><Card label="Encarte(s)" value={market._count.flyers} /><Card label="Oferta(s)" value={market._count.offers} /></div><Section title="Filiais">{market.stores.map((store) => <li key={store.id}>{store.name} · {store.city}/{store.state} · {store.active ? "ativa" : "inativa"}</li>)}</Section><Section title="Fontes de encarte">{market.flyerSources.map((source) => <li key={source.id}>{source.name ?? source.type} · {source.active ? "ativa" : "inativa"}</li>)}</Section><Section title="Fluxos">{market.scraperFlows.map((flow) => <li key={flow.id}><Link className="text-[var(--ds-color-primary)] hover:underline" href={`/admin/scraper/${flow.id}`}>{flow.name}</Link> · {flow.status}</li>)}</Section></section>;
}
function Card({ label, value }: { label: string; value: number }) { return <div className="rounded border border-[var(--ds-color-border)] p-4"><p className="text-xs text-[var(--ds-color-muted-foreground)]">{label}</p><p className="text-2xl font-bold">{value}</p></div>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section><h2 className="mb-2 text-sm font-semibold">{title}</h2><ul className="space-y-1 text-sm text-[var(--ds-color-muted-foreground)]">{children}</ul></section>; }
