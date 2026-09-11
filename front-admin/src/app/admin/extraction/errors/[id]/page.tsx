"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ApiError, adminApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type ErrorRow = Awaited<ReturnType<typeof adminApi.extractionError>>;

export default function ExtractionErrorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [err, setErr] = useState<ErrorRow | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void adminApi.extractionError(id).then(
      (row) => alive && setErr(row),
      (cause: unknown) => {
        if (!alive) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setErr(null);
          setError("Não encontrado");
          return;
        }
        setErr(null);
        setError(
          cause instanceof ApiError && cause.status === 401
            ? "Sua sessão expirou."
            : "Não foi possível carregar o erro.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  async function resolve() {
    if (!err) return;
    setBusy(true);
    try {
      await adminApi.updateExtractionError(id, "resolved");
      setErr({ ...err, status: "resolved" });
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>;
  }
  if (!err) {
    return <p className="ds-meta">Carregando…</p>;
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
      <PageHeader title={err.stage} description={err.supermarket.name}>
        <StatusBadge status={err.status} />
      </PageHeader>
      {err.status === "open" ? (
        <button
          type="button"
          onClick={() => void resolve()}
          disabled={busy}
          className="mb-4 rounded-md border border-[var(--ds-color-border)] px-3 py-1.5 text-sm"
        >
          {busy ? "Resolvendo…" : "Resolver"}
        </button>
      ) : null}
      <p className="mb-2 text-sm">{err.message}</p>
      <p className="mb-4 text-xs text-[var(--ds-color-muted-foreground)]">
        {formatDateTime(new Date(err.createdAt).getTime())}
      </p>
      {err.flyer ? (
        <p className="mb-4 text-sm">
          Encarte:{" "}
          <Link
            href={`/admin/flyers/${err.flyer.id}`}
            className="hover:underline"
          >
            {err.flyer.title ?? err.flyer.id}
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
