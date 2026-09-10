"use client";
import { useEffect,useState } from "react";
import { useParams } from "next/navigation";
import { adminApi } from "@/lib/api";
type Flow=Awaited<ReturnType<typeof adminApi.scraperFlows>>[number];
export default function FlowPage(){const {id}=useParams<{id:string}>();const [flow,setFlow]=useState<Flow>();useEffect(()=>{const t=window.setTimeout(()=>void adminApi.scraperFlows().then(v=>setFlow(v.find(x=>x.id===id))),0);return()=>window.clearTimeout(t)},[id]);return <section>{!flow?<p>Carregando…</p>:<><h1>{flow.name}</h1><p>{flow.supermarket.name}</p><p>{flow.startUrl}</p><p>Status: {flow.status}</p><p>Última execução: {flow.latestRun?.status??"—"}</p></>}</section>}
