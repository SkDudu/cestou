"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/admin/PageHeader";
import { ReanalyzeModal } from "@/components/admin/ReanalyzeModal";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  checkWorkerHealth,
  downloadFlyerRemote,
  reanalyzeRemote,
  startBrowserWorker,
} from "@/lib/browser-session";
import { formatCurrency, formatDateTime, formatInstallment } from "@/lib/format";

function toLocalInput(ts?: number) {
  if (!ts) return "";
  const date = new Date(ts);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function FlyerDetailPage() {
  const params = useParams();
  const id = params.id as Id<"flyers">;
  const flyer = useQuery(api.flyers.get, { id });
  const discardFlyer = useMutation(api.flyers.discardFlyer);
  const resetForDownload = useMutation(api.flyers.resetForDownload);
  const setStatus = useMutation(api.flyers.setStatus);
  const setValidity = useMutation(api.flyers.setValidity);
  const [reanalyzeOpen, setReanalyzeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

  useEffect(() => {
    if (!flyer) return;
    setValidFrom(toLocalInput(flyer.validFrom));
    setValidUntil(toLocalInput(flyer.validUntil));
  }, [flyer]);

  if (flyer === undefined) {
    return <p className="ds-meta">Carregando…</p>;
  }
  if (!flyer) {
    return <p className="text-sm text-[var(--ds-color-danger)]">Não encontrado</p>;
  }
  const currentFlyer = flyer;

  async function reanalyze(args: {
    pages?: number[];
    includeLocked: boolean;
  }) {
    setBusy(true);
    try {
      if (!(await checkWorkerHealth())) await startBrowserWorker();
      await reanalyzeRemote({
        flyerId: currentFlyer._id,
        pages: args.pages,
        includeLocked: args.includeLocked,
      }, () => {});
      setReanalyzeOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function removeFlyer() {
    if (
      !window.confirm(
        "Excluir definitivamente o encarte, suas páginas, extrações e ofertas? Esta ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await discardFlyer({ id: currentFlyer._id });
    } finally {
      setBusy(false);
    }
  }

  async function saveValidity() {
    const from = validFrom ? new Date(validFrom).getTime() : null;
    const until = validUntil ? new Date(validUntil).getTime() : null;
    if ((from !== null && Number.isNaN(from)) || (until !== null && Number.isNaN(until))) {
      return;
    }
    setBusy(true);
    try {
      await setValidity({ id: currentFlyer._id, validFrom: from, validUntil: until });
    } finally {
      setBusy(false);
    }
  }

  async function redownload() {
    if (
      !window.confirm(
        "Baixar novamente apagará as páginas, extrações e ofertas atuais deste encarte. Continuar?",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await resetForDownload({ id: currentFlyer._id });
      if (!(await checkWorkerHealth())) await startBrowserWorker();
      await downloadFlyerRemote(currentFlyer._id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={flyer.title ?? "Encarte"}
        description={flyer.supermarket?.name}
      >
        <StatusBadge status={flyer.status} />
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="ds-btn ds-btn--primary"
          disabled={busy || flyer.pages.length === 0}
          onClick={() => setReanalyzeOpen(true)}
        >
          {busy ? "Processando…" : "Reanalisar"}
        </button>
        <button
          type="button"
          className="ds-btn ds-btn--outline"
          disabled={busy || flyer.status === "downloading" || flyer.status === "processing"}
          onClick={() => void redownload()}
        >
          Baixar novamente
        </button>
        {flyer.status !== "expired" ? (
          <button
            type="button"
            className="ds-btn ds-btn--outline"
            disabled={busy}
            onClick={() => setStatus({ id: flyer._id, status: "expired" })}
          >
            Marcar como expirado
          </button>
        ) : null}
        <button
          type="button"
          className="ds-btn ds-btn--danger"
          disabled={busy}
          onClick={() => void removeFlyer()}
        >
          Excluir definitivamente
        </button>
      </div>

      <section className="mb-6 rounded-[10px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] p-4">
        <h2 className="text-sm font-semibold">Vigência</h2>
        <p className="mt-1 text-xs text-[var(--ds-color-muted-foreground)]">
          Sobrescreve a validade do encarte e das ofertas extraídas.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--ds-color-muted-foreground)]">
              Início
            </span>
            <input
              type="datetime-local"
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
              className="ds-search w-full"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--ds-color-muted-foreground)]">
              Fim
            </span>
            <input
              type="datetime-local"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
              className="ds-search w-full"
            />
          </label>
        </div>
        <button
          type="button"
          className="ds-btn ds-btn--outline mt-3"
          disabled={busy}
          onClick={() => void saveValidity()}
        >
          Salvar vigência
        </button>
      </section>

      <dl className="mb-6 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Validade</dt>
          <dd>
            {formatDateTime(flyer.validFrom)} → {formatDateTime(flyer.validUntil)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">URL original</dt>
          <dd>
            <a
              href={flyer.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all text-[var(--ds-color-muted-foreground)] hover:underline"
            >
              {flyer.originalUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Hash</dt>
          <dd className="font-mono text-xs text-[var(--ds-color-muted-foreground)]">{flyer.fileHash ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--ds-color-muted-foreground)]">Ofertas</dt>
          <dd>{flyer.offerCount}</dd>
        </div>
        {flyer.retentionAt !== undefined ? (
          <div>
            <dt className="text-[var(--ds-color-muted-foreground)]">Limpeza programada</dt>
            <dd>{formatDateTime(flyer.retentionAt)}</dd>
          </div>
        ) : null}
      </dl>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
        Páginas
      </h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {flyer.pages.map((p) => (
          <a
            key={p._id}
            href={p.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="block ds-table-card"
          >
            {p.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.url}
                alt={`Página ${p.pageNumber}`}
                className="aspect-[3/4] w-full object-cover object-top"
              />
            ) : null}
            <p className="px-2 py-1 text-xs text-[var(--ds-color-muted-foreground)]">Página {p.pageNumber}</p>
          </a>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-muted-foreground)]">
        Ofertas extraídas
      </h2>
      <div className="ds-table-card">
        <table className="w-full text-left text-sm">
          <thead className="ds-label-caps">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Preço</th>
              <th className="px-3 py-2">Pág</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {flyer.offers.map((o) => (
              <tr key={o._id} className="border-b border-[var(--ds-color-border)]">
                <td className="px-3 py-2">
                  <Link href={`/admin/offers/${o._id}`} className="hover:underline">
                    {o.name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {formatCurrency(o.price)}
                  {formatInstallment(o) ? (
                    <span className="mt-0.5 block text-[11px] text-[var(--ds-color-muted-foreground)]">
                      {formatInstallment(o)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">{o.pageNumber ?? "—"}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={o.validationStatus} />
                </td>
              </tr>
            ))}
            {!flyer.offers.length ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-[var(--ds-color-muted-foreground)]">
                  Sem ofertas
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ReanalyzeModal
        open={reanalyzeOpen}
        flyerTitle={flyer.title ?? flyer._id}
        pages={flyer.pages}
        offers={flyer.offers}
        busy={busy}
        onClose={() => setReanalyzeOpen(false)}
        onConfirm={(args) => void reanalyze(args)}
      />
    </div>
  );
}
