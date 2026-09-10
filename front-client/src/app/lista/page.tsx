"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Scales, Trash } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Button, EmptyState, Input, ListSurface, Skeleton } from "@/components/ui";
import { clientApi } from "@/lib/api";

type ListItem = { id: string; queryText: string; quantity: number; offer: { name: string; price: string; memberPrice: string | null; supermarket: { name: string } } | null };
type List = { id: string; name: string; items: ListItem[] };
export default function ListaPage() {
  const [list, setList] = useState<List | null>(null); const [draft, setDraft] = useState("");
  const load = () => clientApi<List>("/lists/default").then(setList).catch(() => setList({ id: "", name: "Minha lista", items: [] }));
  useEffect(() => { void load(); }, []);
  async function add(event: FormEvent) { event.preventDefault(); if (!draft.trim()) return; await clientApi("/lists/default/items", { method: "POST", body: JSON.stringify({ queryText: draft.trim() }) }); setDraft(""); await load(); }
  async function remove(id: string) { await clientApi(`/lists/items/${id}`, { method: "DELETE" }); await load(); }
  return <AppShell title={list?.name ?? "Minha lista"} subtitle="Adicione itens e compare o custo total nos mercados da região." actions={<Link href="/lista/comparar"><Button><Scales size={16} />Comparar preços</Button></Link>}><div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]"><form onSubmit={(event) => void add(event)} className="space-y-3"><p className="ds-label-caps">Novo item</p><Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ex.: leite 1L" /><Button type="submit"><Plus size={16} />Adicionar</Button></form>{!list ? <Skeleton className="h-64 w-full" /> : list.items.length === 0 ? <EmptyState title="Lista vazia" body="Busque ofertas ou digite um item para começar." /> : <ListSurface>{list.items.map((item) => <li key={item.id} className="flex justify-between gap-4 px-5 py-4"><div><p className="font-medium">{item.queryText}</p>{item.offer ? <p className="text-xs text-[var(--ds-color-muted-foreground)]">{item.offer.supermarket.name} · R$ {item.offer.memberPrice ?? item.offer.price}</p> : <p className="text-xs text-[var(--ds-color-muted-foreground)]">Sem oferta fixada</p>}</div><button type="button" onClick={() => void remove(item.id)} className="text-[var(--ds-color-danger)]"><Trash size={16} /></button></li>)}</ListSurface>}</div></AppShell>;
}
