"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

function redeOf(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function normalizeSite(raw: string) {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

const NETWORK_TYPES = [
  { value: "supermarket", label: "Supermercado" },
  { value: "wholesale", label: "Atacarejo" },
  { value: "distributor", label: "Distribuidora" },
] as const;

type NetworkType = "supermarket" | "wholesale" | "distributor";

export function StoreCreateModal({
  open,
  storeNames,
  onClose,
}: {
  open: boolean;
  storeNames: string[];
  onClose: () => void;
}) {
  const create = useMutation(api.supermarkets.create);
  const [rede, setRede] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [networkType, setNetworkType] = useState<NetworkType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redes = useMemo(() => {
    const set = new Set(storeNames.map(redeOf));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [storeNames]);

  useEffect(() => {
    if (!open) return;
    setRede("");
    setWebsiteUrl("");
    setNetworkType("");
    setError(null);
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const name = rede.trim();
  const site = normalizeSite(websiteUrl);
  const canSubmit = Boolean(name) && Boolean(site);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError("Preencha rede e site.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const id = await create({
        name,
        city: "Fortaleza",
        state: "CE",
        country: "BR",
        websiteUrl: site,
        active: true,
        timezone: "America/Fortaleza",
        networkType: networkType || undefined,
      });
      window.location.href = `/admin/supermarkets/${id}`;
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="ds-modal-overlay"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <form
        className="ds-modal"
        role="dialog"
        aria-labelledby="store-create-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="store-create-title"
              className="text-[20px] font-bold leading-[26px] tracking-[-0.03em]"
            >
              Novo supermercado
            </h2>
            <p className="text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
              Nome + URL do site de encartes.
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
          <span className="text-[13px] font-medium leading-[18px]">Rede</span>
          <input
            list="store-rede-list"
            value={rede}
            onChange={(e) => setRede(e.target.value)}
            placeholder="Assaí"
            className="ds-input"
            required
            autoFocus
          />
          {redes.length ? (
            <datalist id="store-rede-list">
              {redes.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          ) : null}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium leading-[18px]">
            Site dos encartes
          </span>
          <input
            type="text"
            inputMode="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://loja.com/encartes"
            className="ds-input font-mono text-xs"
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium leading-[18px]">
            Tipo de rede
          </span>
          <select
            className="ds-input"
            value={networkType}
            onChange={(e) => setNetworkType(e.target.value as NetworkType | "")}
          >
            <option value="">Selecionar…</option>
            {NETWORK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
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
            {busy ? "Adicionando…" : "Adicionar"}
          </button>
        </div>
      </form>
    </div>
  );
}
