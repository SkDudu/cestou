"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, Panel, Skeleton } from "@/components/ui";
import { clientApi } from "@/lib/api";
import { formatDay } from "@/lib/format";

type Flyer = { id: string; title: string | null; validFrom: string | null; validUntil: string | null; supermarket: { name: string }; _count: { offers: number } };
export default function EncartesPage() {
  const [flyers, setFlyers] = useState<Flyer[] | null>(null);
  useEffect(() => { void clientApi<Flyer[]>("/flyers").then(setFlyers).catch(() => setFlyers([])); }, []);
  return <AppShell title="Encartes" subtitle="Todos os encartes publicados e vigentes no sistema.">{!flyers ? <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div> : flyers.length === 0 ? <EmptyState title="Nenhum encarte publicado" body="Quando houver encartes processados e vigentes, eles aparecem aqui." /> : <ul className="grid gap-3 md:grid-cols-2 stagger-in">{flyers.map((flyer) => <li key={flyer.id}><Link href={`/encartes/${flyer.id}`}><Panel className="transition-colors hover:border-[var(--ds-color-primary)]"><p className="ds-label-caps text-[var(--ds-color-primary)]">{flyer.supermarket.name}</p><p className="mt-1 text-lg font-semibold tracking-tight">{flyer.title ?? "Encarte"}</p><p className="text-sm text-[var(--ds-color-muted-foreground)]">{formatDay(flyer.validFrom)} → {formatDay(flyer.validUntil)} · {flyer._count.offers} ofertas</p></Panel></Link></li>)}</ul>}</AppShell>;
}
