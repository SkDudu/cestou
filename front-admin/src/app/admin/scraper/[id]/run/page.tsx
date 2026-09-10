"use client";
import { useCallback,useState } from "react";
import { useSearchParams } from "next/navigation";
import { useScraperRunEvents } from "@/lib/use-scraper-run-events";
export default function WorkerRunPage(){const search=useSearchParams();const runId=search.get("job")??undefined;const [updates,setUpdates]=useState(0);const refresh=useCallback(()=>setUpdates(v=>v+1),[]);useScraperRunEvents(runId,refresh);return <section><h1>Execução do scraper</h1>{runId?<><p>Run: {runId}</p><p>Eventos recebidos: {updates}</p><p>O progresso é transmitido via SSE e persiste no PostgreSQL.</p></>:<p>Nenhuma execução selecionada.</p>}</section>}
