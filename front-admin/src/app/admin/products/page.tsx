"use client";
import {useEffect,useState}from"react";import{adminApi}from"@/lib/api";
export default function ProductsPage(){const[p,setP]=useState<Awaited<ReturnType<typeof adminApi.products>>>();useEffect(()=>{const t=setTimeout(()=>void adminApi.products().then(setP),0);return()=>clearTimeout(t)},[]);return <section><h1>Produtos</h1>{!p?<p>Carregando…</p>:p.map(x=><p key={x.id}>{x.canonicalName} · {x.brand?.name??"Sem marca"} · {x._count.offers} ofertas</p>)}</section>}
