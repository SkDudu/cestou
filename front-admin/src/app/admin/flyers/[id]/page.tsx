"use client";
import { useEffect,useState } from "react";
import { useParams } from "next/navigation";
import { adminApi } from "@/lib/api";
type Flyer=Awaited<ReturnType<typeof adminApi.flyer>>;
export default function FlyerPage(){const {id}=useParams<{id:string}>();const [flyer,setFlyer]=useState<Flyer>();useEffect(()=>{const timer=window.setTimeout(()=>void adminApi.flyer(id).then(setFlyer),0);return()=>window.clearTimeout(timer)},[id]);return <section>{!flyer?<p>Carregando…</p>:<><h1>{flyer.title??"Encarte"}</h1><p>{flyer.supermarket.name} · {flyer.status}</p><h2>Ofertas</h2>{flyer.offers.map(o=><p key={o.id}>{o.name} — R$ {String(o.price)}</p>)}</>}</section>}
