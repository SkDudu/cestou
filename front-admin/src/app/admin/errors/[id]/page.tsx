"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/format";

export default function ErrorDetailPage() {
  const params = useParams();
  const id = params.id as Id<"flyerErrors">;
  const err = useQuery(api.flyerErrors.get, { id });
  const resolve = useMutation(api.flyerErrors.resolve);

  if (err === undefined) {
    return <p className="text-sm text-zinc-500">Carregando…</p>;
  }
  if (!err) {
    return <p className="text-sm text-rose-400">Não encontrado</p>;
  }

  return (
    <div>
      <PageHeader title={err.stage} description={err.supermarket?.name}>
        <StatusBadge status={err.status} />
      </PageHeader>
      {err.status === "open" ? (
        <button
          type="button"
          onClick={() => resolve({ id })}
          className="mb-4 rounded-md border border-zinc-700 px-3 py-1.5 text-sm"
        >
          Resolver
        </button>
      ) : null}
      <p className="mb-2 text-sm text-zinc-300">{err.message}</p>
      <p className="mb-4 text-xs text-zinc-500">{formatDateTime(err.createdAt)}</p>
      {err.flyerId ? (
        <p className="mb-4 text-sm">
          Encarte:{" "}
          <Link href={`/admin/flyers/${err.flyerId}`} className="hover:underline">
            {err.flyer?.title ?? err.flyerId}
          </Link>
        </p>
      ) : null}
      {err.stack ? (
        <pre className="overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
          {err.stack}
        </pre>
      ) : null}
    </div>
  );
}
