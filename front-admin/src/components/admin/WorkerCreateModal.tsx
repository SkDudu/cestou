"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
  const [scope, setScope] = useState<"supermarket" | "store">("supermarket");
  const [storeId, setStoreId] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const branches = useQuery(
    api.stores.listBySupermarket,
    supermarketId
      ? { supermarketId: supermarketId as Id<"supermarkets"> }
      : "skip",
  );
  const activeBranches = useMemo(
    () => (branches ?? []).filter((s) => s.active),
    [branches],
  );

  useEffect(() => {
    if (!open) return;
    const preset = presetSupermarketId ?? "";
    setSupermarketId(preset);
    setScope("supermarket");
    setStoreId("");
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

  useEffect(() => {
    if (scope === "store" && branches !== undefined && !activeBranches.length) {
      setScope("supermarket");
      setStoreId("");
    }
  }, [scope, branches, activeBranches.length]);

  const market = useMemo(
    () => markets.find((m) => m._id === supermarketId),
    [markets, supermarketId],
  );
  const branch = useMemo(
    () => activeBranches.find((s) => s._id === storeId),
    [activeBranches, storeId],
  );
  const idPreview = market
    ? workerSlug(
        scope === "store" && branch
          ? `${market.name}_${branch.name}`
          : market.name,
      )
    : "wrk_…";

  function onScopeChange(next: "supermarket" | "store") {
    setScope(next);
    if (next === "supermarket") {
      setStoreId("");
      setStartUrl(market?.websiteUrl ?? "");
      return;
    }
    if (activeBranches.length === 1) {
      const only = activeBranches[0]!;
      setStoreId(only._id);
      setStartUrl(only.url?.trim() || market?.websiteUrl || "");
    } else {
      setStoreId("");
    }
  }

  function onBranchChange(id: string) {
    setStoreId(id);
    const s = activeBranches.find((x) => x._id === id);
    setStartUrl(s?.url?.trim() || market?.websiteUrl || "");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!market) {
      setError("Escolha uma loja.");
      return;
    }
    if (scope === "store" && !storeId) {
      setError("Escolha uma filial.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const id = await create({
        supermarketId: market._id,
        name: market.name,
        startUrl: startUrl.trim() || undefined,
        scope,
        storeId:
          scope === "store" ? (storeId as Id<"stores">) : undefined,
      });
      window.location.href = `/admin/scraper/${id}`;
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  if (!open) return null;

  const canSubmit =
    Boolean(supermarketId && startUrl.trim()) &&
    (scope === "supermarket" || Boolean(storeId));

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
              {market
                ? `${market.name} — disponibilidade e fonte HTML.`
                : "Abra a partir de um supermercado."}
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
          <span className="text-[13px] font-medium leading-[18px]">
            Disponibilidade
          </span>
          <select
            className="ds-select"
            value={scope}
            onChange={(e) =>
              onScopeChange(e.target.value as "supermarket" | "store")
            }
            disabled={!supermarketId}
          >
            <option value="supermarket">Geral (toda a rede)</option>
            <option value="store" disabled={!activeBranches.length}>
              {activeBranches.length
                ? "Filial"
                : "Filial (cadastre filiais antes)"}
            </option>
          </select>
        </label>

        {scope === "store" && activeBranches.length ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium leading-[18px]">
              Filial
            </span>
            <select
              required
              className="ds-select"
              value={storeId}
              onChange={(e) => onBranchChange(e.target.value)}
            >
              <option value="">Escolher filial…</option>
              {activeBranches.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                  {s.neighborhood ? ` · ${s.neighborhood}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

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
            disabled={busy || !canSubmit}
          >
            {busy ? "Criando…" : "Criar worker"}
          </button>
        </div>
      </form>
    </div>
  );
}
