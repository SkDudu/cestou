"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type StoreOpt = { _id: Id<"stores">; name: string };
type FlowOpt = { _id: Id<"scraperFlows">; name: string; status: string };

type OpStatus = "active" | "inactive" | "error" | "not_configured";

type Props = {
  open: boolean;
  supermarketId: Id<"supermarkets">;
  stores: StoreOpt[];
  flows: FlowOpt[];
  initial?: {
    id: Id<"flyerSources">;
    name?: string;
    type: "pdf" | "image" | "web" | "dynamic" | "manual";
    url: string;
    scope?: "supermarket" | "store";
    active: boolean;
    operationalStatus?: OpStatus;
    flowId?: Id<"scraperFlows">;
    storeIds: Id<"stores">[];
  } | null;
  onClose: () => void;
};

const TYPES = ["web", "pdf", "image", "dynamic", "manual"] as const;
const OPS: { value: OpStatus; label: string }[] = [
  { value: "active", label: "Ativa" },
  { value: "not_configured", label: "Não configurada" },
  { value: "error", label: "Erro" },
  { value: "inactive", label: "Inativa" },
];

export function FlyerSourceModal({
  open,
  supermarketId,
  stores,
  flows,
  initial,
  onClose,
}: Props) {
  const create = useMutation(api.flyerSources.create);
  const update = useMutation(api.flyerSources.update);
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("web");
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState<"supermarket" | "store">("supermarket");
  const [storeIds, setStoreIds] = useState<Id<"stores">[]>([]);
  const [opStatus, setOpStatus] = useState<OpStatus>("not_configured");
  const [flowId, setFlowId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setType(initial?.type ?? "web");
    setUrl(initial?.url ?? "");
    setScope(initial?.scope ?? "supermarket");
    setStoreIds(initial?.storeIds ?? []);
    setOpStatus(
      initial?.operationalStatus ??
        (initial?.active === false ? "inactive" : "not_configured"),
    );
    setFlowId(initial?.flowId ?? "");
    setError(null);
    setBusy(false);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const canSubmit = Boolean(url.trim());

  function toggleStore(id: Id<"stores">) {
    setStoreIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError("URL obrigatória.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim() || undefined,
        type,
        url: url.trim(),
        scope,
        operationalStatus: opStatus,
        storeIds: scope === "store" ? storeIds : [],
      };
      if (initial) {
        await update({
          id: initial.id,
          ...payload,
          ...(flowId
            ? { flowId: flowId as Id<"scraperFlows"> }
            : { clearFlowId: true }),
        });
      } else {
        await create({
          supermarketId,
          ...payload,
          ...(flowId
            ? { flowId: flowId as Id<"scraperFlows"> }
            : {}),
        });
      }
      onClose();
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
        aria-labelledby="flyer-source-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="flyer-source-title"
              className="text-[20px] font-bold leading-[26px] tracking-[-0.03em]"
            >
              {initial ? "Editar fonte" : "Nova fonte"}
            </h2>
            <p className="text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
              De onde o Cestou obtém encartes.
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
          <span className="text-[13px] font-medium">Nome</span>
          <input
            className="ds-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Site institucional"
            autoFocus
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Tipo</span>
            <select
              className="ds-input"
              value={type}
              onChange={(e) =>
                setType(e.target.value as (typeof TYPES)[number])
              }
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Escopo</span>
            <select
              className="ds-input"
              value={scope}
              onChange={(e) =>
                setScope(e.target.value as "supermarket" | "store")
              }
            >
              <option value="supermarket">Toda a rede</option>
              <option value="store">Filial(is)</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">URL</span>
          <input
            className="ds-input font-mono text-xs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Status operacional</span>
            <select
              className="ds-input"
              value={opStatus}
              onChange={(e) => setOpStatus(e.target.value as OpStatus)}
            >
              {OPS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Worker (flow)</span>
            <select
              className="ds-input"
              value={flowId}
              onChange={(e) => setFlowId(e.target.value)}
            >
              <option value="">Nenhum</option>
              {flows.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name} · {f.status}
                </option>
              ))}
            </select>
          </label>
        </div>

        {scope === "store" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-medium">Filiais</legend>
            {!stores.length ? (
              <p className="text-[13px] text-[var(--ds-color-muted-foreground)]">
                Cadastre filiais primeiro.
              </p>
            ) : (
              stores.map((s) => (
                <label
                  key={s._id}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <input
                    type="checkbox"
                    checked={storeIds.includes(s._id)}
                    onChange={() => toggleStore(s._id)}
                  />
                  {s.name}
                </label>
              ))
            )}
          </fieldset>
        ) : null}

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
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
