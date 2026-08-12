"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, formatNumber } from "@/lib/format";

const statuses = [
  "",
  "discovered",
  "downloading",
  "downloaded",
  "processing",
  "processed",
  "expired",
  "failed",
] as const;

export default function FlyersPage() {
  const names = useQuery(api.supermarkets.listNames);
  const [supermarketId, setSupermarketId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const flyers = useQuery(api.flyers.list, {
    supermarketId: supermarketId
      ? (supermarketId as Id<"supermarkets">)
      : undefined,
    status: status
      ? (status as
          | "discovered"
          | "downloading"
          | "downloaded"
          | "processing"
          | "processed"
          | "expired"
          | "failed")
      : undefined,
  });

  return (
    <div>
      <PageHeader title="Encartes" description="Histórico de flyers — nunca apagados" />
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={supermarketId}
          onChange={(e) => setSupermarketId(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        >
          <option value="">Todos supermercados</option>
          {(names ?? []).map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        >
          {statuses.map((s) => (
            <option key={s || "all"} value={s}>
              {s || "Todos status"}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2">Mercado</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Págs</th>
              <th className="px-3 py-2">Ofertas</th>
              <th className="px-3 py-2">Validade</th>
            </tr>
          </thead>
          <tbody>
            {(flyers ?? []).map((f) => (
              <tr key={f._id} className="border-b border-zinc-900">
                <td className="px-3 py-2">
                  <Link href={`/admin/flyers/${f._id}`} className="hover:underline">
                    {f.title ?? "Sem título"}
                  </Link>
                </td>
                <td className="px-3 py-2 text-zinc-400">{f.supermarketName}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={f.status} />
                </td>
                <td className="px-3 py-2">{formatNumber(f.pageCount)}</td>
                <td className="px-3 py-2">{formatNumber(f.offerCount)}</td>
                <td className="px-3 py-2 text-zinc-500">
                  {formatDateTime(f.validFrom)} → {formatDateTime(f.validUntil)}
                </td>
              </tr>
            ))}
            {flyers?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  Nenhum encarte
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
