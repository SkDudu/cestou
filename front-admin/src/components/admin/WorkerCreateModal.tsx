"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type Market = {
  _id: Id<"supermarkets">;
  name: string;
  websiteUrl?: string;
};

function workerSlug(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);
  return slug.startsWith("wrk_") ? slug : `wrk_${slug || "flow"}`;
}

export function WorkerCreateModal({
  open,
  markets,
  presetSupermarketId,
  onClose,
}: {
  open: boolean;
  markets: Market[];
  presetSupermarketId?: string;
  onClose: () => void;
}) {
  const create = useMutation(api.scraperFlows.create);
  const [supermarketId, setSupermarketId] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const preset = presetSupermarketId ?? "";
    setSupermarketId(preset);
    setError(null);
    setBusy(false);
    const m = markets.find((x) => x._id === preset);
    setStartUrl(m?.websiteUrl ?? "");
  }, [open, presetSupermarketId, markets]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const market = useMemo(
    () => markets.find((m) => m._id === supermarketId),
    [markets, supermarketId],
  );
  const idPreview = market ? workerSlug(market.name) : "wrk_…";

  function onStoreChange(id: string) {
    setSupermarketId(id);
    const m = markets.find((x) => x._id === id);
    setStartUrl(m?.websiteUrl ?? "");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!market) {
      setError("Escolha uma loja.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const id = await create({
        supermarketId: market._id,
        name: market.name,
        startUrl: startUrl.trim() || undefined,
      });
      window.location.href = `/admin/scraper/${id}`;
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="ds-modal-overlay" onClick={busy ? undefined : onClose} role="presentation">
      <form
        className="ds-modal"
        role="dialog"
        aria-labelledby="worker-create-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="worker-create-title"
              className="text-[20px] font-bold leading-[26px] tracking-[-0.03em]"
            >
              Novo worker
            </h2>
            <p className="text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
              Loja, fonte HTML e cron. Primeiro job pode sair agora.
            </p>
          </div>
          <button
            type="button"
            className="ds-modal-x"
            onClick={onClose}
            disabled={busy}
          >
            ×
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium leading-[18px]">Loja</span>
          <select
            required
            className="ds-select"
            value={supermarketId}
            onChange={(e) => onStoreChange(e.target.value)}
          >
            <option value="">Escolher loja…</option>
            {markets.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium leading-[18px]">ID</span>
          <input
            readOnly
            value={idPreview}
            className="ds-input ds-input--muted font-mono text-xs"
            tabIndex={-1}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium leading-[18px]">
            Fonte do encarte
          </span>
          <input
            required
            type="url"
            value={startUrl}
            onChange={(e) => setStartUrl(e.target.value)}
            placeholder="https://…"
            className="ds-input font-mono text-xs"
          />
        </label>

        {error ? (
          <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            className="ds-btn ds-btn--outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="ds-btn ds-btn--primary"
            disabled={busy || !supermarketId || !startUrl.trim()}
          >
            {busy ? "Criando…" : "Criar worker"}
          </button>
        </div>
      </form>
    </div>
  );
}
