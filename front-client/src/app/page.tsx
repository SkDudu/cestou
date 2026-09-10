"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MagnifyingGlass, Newspaper, ShoppingCart, Storefront } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Button, EmptyState, Panel, Skeleton } from "@/components/ui";
import { clientApi } from "@/lib/api";

type Flyer = { id: string; title: string | null; supermarket: { name: string }; _count: { offers: number } };
export default function HomePage() {
  const [flyers, setFlyers] = useState<Flyer[] | null>(null);
  useEffect(() => { void clientApi<Flyer[]>("/flyers").then(setFlyers).catch(() => setFlyers([])); }, []);
  return <AppShell title="Início" subtitle="Monte a lista, compare mercados e escolha a compra mais barata na sua região." actions={<Link href="/busca"><Button><MagnifyingGlass size={16} />Buscar produto</Button></Link>}><div className="grid gap-3 sm:grid-cols-3"><Quick href="/lista" icon={<ShoppingCart size={20} />} label="Minha lista" hint="Comparar custo total" /><Quick href="/encartes" icon={<Newspaper size={20} />} label="Encartes" hint="Ofertas vigentes" /><Quick href="/mercados" icon={<Storefront size={20} />} label="Mercados" hint="Definir favoritos" /></div><section className="mt-8"><h2 className="ds-label-caps">Encartes recentes</h2>{!flyers ? <Skeleton className="mt-3 h-28 w-full" /> : flyers.length === 0 ? <div className="mt-3"><EmptyState title="Nenhum encarte disponível" body="Os encartes processados aparecerão aqui." /></div> : <ul className="mt-3 grid gap-3 md:grid-cols-2">{flyers.slice(0, 4).map((flyer) => <li key={flyer.id}><Link href={`/encartes/${flyer.id}`}><Panel><p className="ds-label-caps text-[var(--ds-color-primary)]">{flyer.supermarket.name}</p><p className="mt-1 font-semibold">{flyer.title ?? "Encarte"}</p><p className="text-xs text-[var(--ds-color-muted-foreground)]">{flyer._count.offers} ofertas</p></Panel></Link></li>)}</ul>}</section></AppShell>;
}
function Quick({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) { return <Link href={href}><Panel className="flex gap-3 transition-colors hover:border-[var(--ds-color-primary)]"><span className="text-[var(--ds-color-primary)]">{icon}</span><div><p className="font-medium">{label}</p><p className="text-xs text-[var(--ds-color-muted-foreground)]">{hint}</p></div></Panel></Link>; }
