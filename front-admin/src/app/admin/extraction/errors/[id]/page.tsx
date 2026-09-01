"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/format";

export default function ExtractionErrorDetailPage() {
  const params = useParams();
  const id = params.id as Id<"flyerErrors">;
  const err = useQuery(api.flyerErrors.get, { id });
  const resolve = useMutation(api.flyerErrors.resolve);

  if (err === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }
  if (!err) {
    return (
      <p className="text-sm text-[var(--ds-color-danger)]">Não encontrado</p>
    );
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/extraction" className="hover:underline">
          Extração
        </Link>
        {" / "}
        Erro
      </p>
      <PageHeader title={err.stage} description={err.supermarket?.name}>
        <StatusBadge status={err.status} />
      </PageHeader>
      {err.status === "open" ? (
        <button
          type="button"
          onClick={() => resolve({ id })}
          className="mb-4 rounded-md border border-[var(--ds-color-border)] px-3 py-1.5 text-sm"
        >
          Resolver
        </button>
      ) : null}
      <p className="mb-2 text-sm">{err.message}</p>
      <p className="mb-4 text-xs text-[var(--ds-color-muted-foreground)]">
        {formatDateTime(err.createdAt)}
      </p>
      {err.flyerId ? (
        <p className="mb-4 text-sm">
          Encarte:{" "}
          <Link
            href={`/admin/flyers/${err.flyerId}`}
            className="hover:underline"
          >
            {err.flyer?.title ?? err.flyerId}
          </Link>
        </p>
      ) : null}
      {err.stack ? (
        <pre className="overflow-auto rounded-lg border border-[var(--ds-color-border)] bg-zinc-950 p-3 text-xs text-[var(--ds-color-muted-foreground)]">
          {err.stack}
        </pre>
      ) : null}
    </div>
  );
}
