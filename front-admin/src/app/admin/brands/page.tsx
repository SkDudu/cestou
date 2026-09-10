"use client";
import {useEffect,useState}from"react";import{adminApi}from"@/lib/api";
export default function BrandsPage(){const[b,setB]=useState<Awaited<ReturnType<typeof adminApi.brands>>>();useEffect(()=>{const t=setTimeout(()=>void adminApi.brands().then(setB),0);return()=>clearTimeout(t)},[]);return <section><h1>Marcas</h1>{!b?<p>Carregando…</p>:b.map(x=><p key={x.id}>{x.name} · {x._count.offers} ofertas</p>)}</section>}
