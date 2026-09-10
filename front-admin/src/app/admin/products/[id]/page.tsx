"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";

type Product = Awaited<ReturnType<typeof adminApi.product>>;
const money = (value: string | number) => `R$ ${Number(value).toFixed(2)}`;
export default function ProductPage() {
  const { id } = useParams<{ id: string }>(); const [product, setProduct] = useState<Product | null>(null); const [missing, setMissing] = useState(false);
  useEffect(() => { void adminApi.product(id).then(setProduct).catch(() => setMissing(true)); }, [id]);
  if (missing) return <p className="p-6 text-sm text-[var(--ds-color-danger)]">Produto não encontrado.</p>;
  if (!product) return <p className="p-6 text-sm text-[var(--ds-color-muted-foreground)]">Carregando produto…</p>;
  return <section className="space-y-6 p-6"><Link href="/admin/products" className="text-sm text-[var(--ds-color-primary)]">← Produtos</Link><div><p className="ds-label-caps">Catálogo / Prisma</p><h1 className="text-2xl font-bold">{product.canonicalName}</h1><p className="text-sm text-[var(--ds-color-muted-foreground)]">{[product.brand?.name, product.quantity, product.unit].filter(Boolean).join(" · ") || "Sem classificação adicional"}</p></div><section><h2 className="mb-2 text-sm font-semibold">Ofertas vinculadas</h2>{product.offers.length === 0 ? <p className="text-sm text-[var(--ds-color-muted-foreground)]">Nenhuma oferta vinculada.</p> : <ul className="divide-y rounded border border-[var(--ds-color-border)]">{product.offers.map((offer) => <li key={offer.id} className="flex items-center justify-between gap-4 p-3"><div><Link href={`/admin/offers/${offer.id}`} className="font-medium hover:underline">{offer.name}</Link><p className="text-xs text-[var(--ds-color-muted-foreground)]">{offer.supermarket.name} · {offer.validationStatus}</p></div><strong>{money(offer.price)}</strong></li>)}</ul>}</section><section><h2 className="mb-2 text-sm font-semibold">Histórico de preços</h2>{product.priceHistory.length === 0 ? <p className="text-sm text-[var(--ds-color-muted-foreground)]">Sem histórico registrado.</p> : <ul className="divide-y rounded border border-[var(--ds-color-border)]">{product.priceHistory.map((entry) => <li key={entry.id} className="flex items-center justify-between gap-4 p-3 text-sm"><span>{entry.supermarket.name}<span className="ml-2 text-xs text-[var(--ds-color-muted-foreground)]">{new Date(entry.createdAt).toLocaleDateString("pt-BR")}</span></span><strong>{money(entry.price)}</strong></li>)}</ul>}</section></section>;
}
