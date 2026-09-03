"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type BrasilApiCep = {
  cep: string;
  state: string;
  city: string;
  neighborhood?: string;
  street?: string;
  location?: {
    coordinates?: { longitude?: string; latitude?: string };
  };
};

type Props = {
  open: boolean;
  supermarketId: Id<"supermarkets">;
  defaultCity?: string;
  defaultState?: string;
  initial?: {
    id: Id<"stores">;
    name: string;
    address?: string;
    number?: string;
    neighborhood?: string;
    city: string;
    state: string;
    zipCode?: string;
    url?: string;
    active: boolean;
  } | null;
  onClose: () => void;
};

function digitsOnly(v: string) {
  return v.replace(/\D/g, "").slice(0, 8);
}

function formatCep(digits: string) {
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

async function fetchCep(cep: string): Promise<BrasilApiCep> {
  const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (!res.ok) throw new Error("CEP não encontrado");
  return (await res.json()) as BrasilApiCep;
}

export function StoreBranchModal({
  open,
  supermarketId,
  defaultCity = "Fortaleza",
  defaultState = "CE",
  initial,
  onClose,
}: Props) {
  const create = useMutation(api.stores.create);
  const update = useMutation(api.stores.update);
  const numberRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [city, setCity] = useState(defaultCity);
  const [stateUf, setStateUf] = useState(defaultState);
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [url, setUrl] = useState("");
  const [active, setActive] = useState(true);
  const [cepBusy, setCepBusy] = useState(false);
  const [cepHint, setCepHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastFetchedCep = useRef("");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setAddress(initial?.address ?? "");
    setNumber(initial?.number ?? "");
    setNeighborhood(initial?.neighborhood ?? "");
    setZipCode(initial?.zipCode ? formatCep(digitsOnly(initial.zipCode)) : "");
    setCity(initial?.city ?? defaultCity);
    setStateUf(initial?.state ?? defaultState);
    setLatitude(undefined);
    setLongitude(undefined);
    setUrl(initial?.url ?? "");
    setActive(initial?.active ?? true);
    setCepHint(null);
    setError(null);
    setBusy(false);
    setCepBusy(false);
    lastFetchedCep.current = "";
  }, [open, initial, defaultCity, defaultState]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  async function lookupCep(raw: string) {
    const cep = digitsOnly(raw);
    if (cep.length !== 8 || cep === lastFetchedCep.current) return;
    setCepBusy(true);
    setCepHint(null);
    try {
      const data = await fetchCep(cep);
      lastFetchedCep.current = cep;
      setZipCode(formatCep(cep));
      if (data.street) setAddress(data.street);
      if (data.neighborhood) setNeighborhood(data.neighborhood);
      if (data.city) setCity(data.city);
      if (data.state) setStateUf(data.state);
      const lat = data.location?.coordinates?.latitude;
      const lng = data.location?.coordinates?.longitude;
      setLatitude(lat != null && lat !== "" ? Number(lat) : undefined);
      setLongitude(lng != null && lng !== "" ? Number(lng) : undefined);
      setCepHint(`${data.city}/${data.state}`);
      // número não vem da API — foca o campo
      requestAnimationFrame(() => numberRef.current?.focus());
    } catch {
      setCepHint("CEP não encontrado");
      lastFetchedCep.current = "";
    } finally {
      setCepBusy(false);
    }
  }

  const canSubmit = Boolean(name.trim());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setError("Nome é obrigatório.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || undefined,
        number: number.trim() || undefined,
        neighborhood: neighborhood.trim() || undefined,
        city: city.trim() || defaultCity,
        state: stateUf.trim() || defaultState,
        zipCode: digitsOnly(zipCode) || undefined,
        latitude,
        longitude,
        url: url.trim() || undefined,
        active,
      };
      if (initial) {
        await update({ id: initial.id, ...payload });
      } else {
        await create({ supermarketId, ...payload });
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
        aria-labelledby="store-branch-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="store-branch-title"
              className="text-[20px] font-bold leading-[26px] tracking-[-0.03em]"
            >
              {initial ? "Editar filial" : "Nova filial"}
            </h2>
            <p className="text-[13px] leading-[18px] text-[var(--ds-color-muted-foreground)]">
              Pode existir sem fonte de ofertas.
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
          <span className="text-[13px] font-medium">CEP</span>
          <input
            className="ds-input font-mono tabular-nums"
            value={zipCode}
            onChange={(e) => {
              const next = formatCep(digitsOnly(e.target.value));
              setZipCode(next);
              if (digitsOnly(next).length === 8) void lookupCep(next);
            }}
            onBlur={() => void lookupCep(zipCode)}
            placeholder="00000-000"
            inputMode="numeric"
            maxLength={9}
            autoComplete="postal-code"
          />
          {cepBusy ? (
            <span className="text-[12px] text-[var(--ds-color-muted-foreground)]">
              Buscando CEP…
            </span>
          ) : cepHint ? (
            <span className="text-[12px] text-[var(--ds-color-muted-foreground)]">
              {cepHint}
            </span>
          ) : null}
        </label>

        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Endereço</span>
            <input
              className="ds-input ds-input--muted"
              value={address}
              disabled
              readOnly
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Nº</span>
            <input
              ref={numberRef}
              className="ds-input"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Bairro</span>
          <input
            className="ds-input ds-input--muted"
            value={neighborhood}
            disabled
            readOnly
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">URL da loja</span>
          <input
            className="ds-input font-mono text-xs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Ativa
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
