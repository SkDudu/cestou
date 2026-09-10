"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { adminApi } from "@/lib/api";
type Offer=Awaited<ReturnType<typeof adminApi.offer>>;
export default function OfferPage(){const {id}=useParams<{id:string}>();const [offer,setOffer]=useState<Offer>();useEffect(()=>{const timer=window.setTimeout(()=>void adminApi.offer(id).then(setOffer),0);return()=>window.clearTimeout(timer)},[id]);return <section>{!offer?<p>Carregando…</p>:<><h1 className="text-3xl font-semibold">{offer.name}</h1><p className="mt-2">{offer.supermarket.name} · {offer.flyer.title??"Encarte"}</p><p className="mt-4 text-2xl">R$ {String(offer.price)}</p><p className="mt-2">Status: {offer.validationStatus}</p></>}</section>}
