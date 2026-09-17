"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, adminApi } from "@/lib/api";

function normalizeSite(raw: string) {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function FilialCreateModal({
  open,
  supermarketId,
  supermarketName,
  onClose,
  onCreated,
}: {
  open: boolean;
  supermarketId: string;
  supermarketName: string;
  onClose: () => void;
  onCreated: (store: {
    id: string;
    name: string;
    slug: string;
    url: string | null;
    neighborhood: string | null;
    city: string;
    state: string;
    externalId: string | null;
    active: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setUrl("");
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

  const trimmed = name.trim();
  const site = normalizeSite(url);
  const canSubmit = trimmed.length >= 2;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError("Preencha o nome da filial.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const created = await adminApi.createStore(supermarketId, {
        name: trimmed,
        url: site || undefined,
      });
      onCreated(created);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? "Sua sessão expirou."
          : "Não foi possível cadastrar a filial.",
      );
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
        aria-labelledby="filial-create-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="filial-create-title"
              className="text-[20px] font-bold leading-[26px] tracking-[-0.03em]"
            >
              Nova filial
            </h2>
            <p className="text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
              Unidade de {supermarketName}. Link opcional — worker pode usar URL da
              rede ou desta filial.
            </p>
          </div>
          <button type="button" className="ds-modal-x" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium leading-[18px]">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Assaí Bezerra de Menezes"
            className="ds-input"
            required
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium leading-[18px]">Link (opcional)</span>
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://loja.com/unidade"
            className="ds-input font-mono text-xs"
          />
        </label>

        {error ? <p className="text-sm text-[var(--ds-color-danger)]">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" className="ds-btn ds-btn--outline" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="ds-btn ds-btn--primary" disabled={busy || !canSubmit}>
            {busy ? "Adicionando…" : "Adicionar"}
          </button>
        </div>
      </form>
    </div>
  );
}
