"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

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

type Props = {
  open: boolean;
  initial: {
    id: Id<"supermarkets">;
    name: string;
    websiteUrl?: string;
    city: string;
    state: string;
    active: boolean;
    networkType?: NetworkType;
    logoUrl?: string | null;
    logoStorageId?: Id<"_storage">;
  };
  onClose: () => void;
};

export function NetworkEditModal({ open, initial, onClose }: Props) {
  const update = useMutation(api.supermarkets.update);
  const generateUploadUrl = useMutation(api.supermarkets.generateUploadUrl);
  const [name, setName] = useState(initial.name);
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl ?? "");
  const [city, setCity] = useState(initial.city);
  const [state, setState] = useState(initial.state);
  const [active, setActive] = useState(initial.active);
  const [networkType, setNetworkType] = useState<NetworkType | "">(
    initial.networkType ?? "",
  );
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initial.logoUrl ?? null,
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setWebsiteUrl(initial.websiteUrl ?? "");
    setCity(initial.city);
    setState(initial.state);
    setActive(initial.active);
    setNetworkType(initial.networkType ?? "");
    setLogoPreview(initial.logoUrl ?? null);
    setLogoFile(null);
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

  const canSubmit = Boolean(name.trim() && city.trim() && state.trim());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError("Nome, cidade e UF são obrigatórios.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let logoStorageId: Id<"_storage"> | undefined;
      if (logoFile) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": logoFile.type },
          body: logoFile,
        });
        if (!res.ok) throw new Error("Falha no upload do logo");
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        logoStorageId = storageId;
      }
      await update({
        id: initial.id,
        name: name.trim(),
        websiteUrl: normalizeSite(websiteUrl) || undefined,
        city: city.trim(),
        state: state.trim().toUpperCase(),
        active,
        networkType: networkType || undefined,
        ...(logoStorageId ? { logoStorageId } : {}),
      });
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
        aria-labelledby="network-edit-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="network-edit-title"
              className="text-[20px] font-bold leading-[26px] tracking-[-0.03em]"
            >
              Editar rede
            </h2>
            <p className="text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
              Nome, site, tipo, logo e status da rede.
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
            required
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Site</span>
          <input
            className="ds-input font-mono text-xs"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Tipo de rede</span>
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

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Logo</span>
          <div className="flex items-center gap-3">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo"
                className="h-10 w-10 rounded-md border border-[var(--ds-color-border)] object-contain"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-[var(--ds-color-border)] text-xs text-[var(--ds-color-muted-foreground)]">
                —
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setLogoFile(f);
                setLogoPreview(URL.createObjectURL(f));
              }}
            />
            <button
              type="button"
              className="text-[13px] font-medium text-[var(--ds-color-harbor)]"
              onClick={() => fileRef.current?.click()}
            >
              {logoPreview ? "Trocar logo" : "Enviar logo"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Cidade</span>
            <input
              className="ds-input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">UF</span>
            <input
              className="ds-input"
              value={state}
              onChange={(e) => setState(e.target.value)}
              maxLength={2}
              required
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Rede ativa
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
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
