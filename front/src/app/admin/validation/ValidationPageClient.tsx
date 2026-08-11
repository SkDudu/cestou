"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/admin/PageHeader";
import { formatCurrency } from "@/lib/format";

export default function ValidationPageClient() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const [compareSearch, setCompareSearch] = useState("");

  const metrics = useQuery(api.dashboard.metrics);
  const issues = useQuery(api.rawProducts.listValidationIssues, { limit: 100 });
  const duplicates = useQuery(api.rawProducts.listDuplicates, { limit: 30 });
  const compare = useQuery(
    api.rawProducts.comparePrices,
    compareSearch.trim() ? { search: compareSearch.trim() } : "skip",
  );

  const incomplete = useMemo(
    () => (issues ?? []).filter((i) => i.reasons.some((r) => !r.includes("alto"))),
    [issues],
  );

  return (
    <div>
      <PageHeader
        title="Validation"
        description="Regras determinísticas + revisão humana"
      />

      {metrics ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Validated", metrics.statusCounts.validated],
              ["Suspicious", metrics.statusCounts.suspicious],
              ["Invalid", metrics.statusCounts.invalid],
              ["Pending", metrics.statusCounts.pending],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded border border-zinc-800 bg-zinc-950 px-3 py-3"
            >
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-xl font-medium tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <section className="mb-8 rounded border border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Comparar preços</h2>
        <input
          value={compareSearch}
          onChange={(e) => setCompareSearch(e.target.value)}
          placeholder="Ex: Arroz Tio João 1kg"
          className="mb-3 w-full max-w-md rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        />
        {compare && compare.length > 0 ? (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Supermercado</th>
                <th className="px-3 py-2">Preço</th>
              </tr>
            </thead>
            <tbody>
              {compare.map((row, i) => (
                <tr key={i} className="border-b border-zinc-900">
                  <td className="px-3 py-2">{row.supermarketName}</td>
                  <td className="px-3 py-2">{formatCurrency(row.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : compareSearch ? (
          <p className="text-sm text-zinc-500">Nenhum resultado</p>
        ) : null}
      </section>

      {type === "duplicates" || !type ? (
        <section className="mb-8 rounded border border-zinc-800 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">Possíveis duplicados</h2>
          <div className="space-y-4">
            {(duplicates ?? []).map((group) => (
              <div key={group.key} className="rounded border border-zinc-900 p-3">
                {group.items.map((item) => (
                  <p key={item._id} className="text-sm text-zinc-300">
                    <Link href={`/admin/products/${item._id}`} className="hover:text-sky-400">
                      {item.name}
                    </Link>
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded border border-zinc-800 p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Produtos com problemas</h2>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Supermercado</th>
              <th className="px-3 py-2">Problema</th>
            </tr>
          </thead>
          <tbody>
            {(type === "incomplete" ? incomplete : issues ?? []).map((item) => (
              <tr key={item._id} className="border-b border-zinc-900">
                <td className="px-3 py-2">
                  <Link href={`/admin/products/${item._id}`} className="hover:text-sky-400">
                    {item.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{item.supermarketName}</td>
                <td className="px-3 py-2 text-amber-300">{item.reasons.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
