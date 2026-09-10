"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Trophy } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ListSurface, Panel, Skeleton } from "@/components/ui";
import { clientApi } from "@/lib/api";
type Market = { supermarketId: string; supermarketName: string; coverage: number; complete: boolean; total: number };
type Comparison = { itemCount: number; markets: Market[]; bestSingle: Market | null };
export default function CompararPage() {
  const [result, setResult] = useState<Comparison | null>(null);
  useEffect(() => { void clientApi<Comparison>("/lists/default/comparison").then(setResult).catch(() => setResult({ itemCount: 0, markets: [], bestSingle: null })); }, []);
  return <AppShell title="Melhor compra" subtitle="Comparação pelo menor custo da sua lista." actions={<Link href="/lista" className="inline-flex items-center gap-2 text-sm text-[var(--ds-color-muted-foreground)]"><ArrowLeft size={16} />Voltar à lista</Link>}>{!result ? <Skeleton className="h-64 w-full" /> : result.itemCount === 0 ? <EmptyState title="Lista vazia" body="Adicione itens antes de comparar preços." /> : result.markets.length === 0 ? <EmptyState title="Sem ofertas compatíveis" body="Ainda não há ofertas validadas para os produtos da lista." /> : <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">{result.bestSingle ? <Panel accent className="p-6"><p className="ds-label-caps inline-flex gap-2 text-[var(--ds-color-accent)]"><Trophy size={15} weight="fill" />Melhor opção</p><p className="mt-3 text-2xl font-bold">{result.bestSingle.supermarketName}</p><p className="mt-2 text-2xl font-bold text-[var(--ds-color-success)]">R$ {result.bestSingle.total.toFixed(2)}</p></Panel> : <Panel className="p-6">Nenhum mercado cobre todos os itens da lista.</Panel>}<section><h2 className="ds-label-caps">Mercados</h2><ListSurface className="mt-3">{result.markets.map((market) => <li key={market.supermarketId} className="flex items-center justify-between px-5 py-4"><div><p className="font-medium">{market.supermarketName}</p><p className="text-xs text-[var(--ds-color-muted-foreground)]">{market.coverage}/{result.itemCount} itens{market.complete ? "" : " · incompleto"}</p></div><strong>R$ {market.total.toFixed(2)}</strong></li>)}</ListSurface></section></div>}</AppShell>;
}
