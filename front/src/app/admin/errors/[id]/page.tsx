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
  const id = params.id as Id<"scrapeErrors">;
  const error = useQuery(api.scrapeErrors.get, { id });
  const resolve = useMutation(api.scrapeErrors.resolve);

  if (!error) {
    return <p className="text-sm text-zinc-500">Carregando erro…</p>;
  }

  return (
    <div>
      <PageHeader title={error.type} description="Detalhes do erro" />

      <div className="mb-4">
        <StatusBadge status={error.status} />
      </div>

      <dl className="space-y-3 text-sm">
        <div><dt className="text-zinc-500">Supermarket</dt><dd>{error.supermarket?.name}</dd></div>
        <div><dt className="text-zinc-500">Query</dt><dd>{error.query ?? "—"}</dd></div>
        <div><dt className="text-zinc-500">Message</dt><dd className="text-rose-200">{error.message}</dd></div>
        <div><dt className="text-zinc-500">URL</dt><dd>{error.url ?? "—"}</dd></div>
        <div><dt className="text-zinc-500">Created</dt><dd>{formatDateTime(error.createdAt)}</dd></div>
      </dl>

      {error.stack ? (
        <pre className="mt-4 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-xs">
          {error.stack}
        </pre>
      ) : null}

      <div className="mt-4 flex gap-2">
        {error.status === "open" ? (
          <button
            onClick={() => resolve({ id })}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm"
          >
            Marcar resolvido
          </button>
        ) : null}
        {error.scrapingJobId ? (
          <Link
            href={`/admin/runs/${error.scrapingJobId}`}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm"
          >
            Ver run
          </Link>
        ) : null}
        <Link href="/admin/errors" className="rounded border border-zinc-700 px-3 py-1.5 text-sm">
          Voltar
        </Link>
      </div>
    </div>
  );
}
