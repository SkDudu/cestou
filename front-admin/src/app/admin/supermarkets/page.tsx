"use client";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
type Market=Awaited<ReturnType<typeof adminApi.supermarkets>>[number];
export default function SupermarketsPage(){const [markets,setMarkets]=useState<Market[]>();useEffect(()=>{const timer=window.setTimeout(()=>void adminApi.supermarkets().then(setMarkets),0);return()=>window.clearTimeout(timer)},[]);return <section className="space-y-5"><h1 className="text-3xl font-semibold">Redes e supermercados</h1>{!markets?<p>Carregando…</p>:<div className="rounded-lg border"><table className="w-full text-sm"><thead><tr><th>Rede</th><th>Local</th><th>Lojas</th><th>Fontes</th><th>Encartes</th><th>Ofertas</th></tr></thead><tbody>{markets.map(m=><tr className="border-t" key={m.id}><td>{m.name}</td><td>{m.city}/{m.state}</td><td>{m._count.stores}</td><td>{m._count.flyerSources}</td><td>{m._count.flyers}</td><td>{m._count.offers}</td></tr>)}</tbody></table></div>}</section>}
