"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OpsHeader } from "@/components/admin/ops";
import { ApiError, adminApi } from "@/lib/api";

type Scope = "SUPERMARKET" | "STORE";
type StoreOption = {
  id: string;
  name: string;
  url: string | null;
};

export default function NewScraperPage() {
  return (
    <Suspense fallback={<p className="ds-meta">Carregando…</p>}>
      <NewWorkerForm />
    </Suspense>
  );
}

function NewWorkerForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [supermarkets, setSupermarkets] = useState<
    Array<{ id: string; name: string; websiteUrl: string | null }>
  >([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [name, setName] = useState("");
  const [supermarketId, setSupermarketId] = useState(search.get("supermarketId") ?? "");
  const [scope, setScope] = useState<Scope>(
    search.get("storeId") ? "STORE" : "SUPERMARKET",
  );
  const [storeId, setStoreId] = useState(search.get("storeId") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);

  const selected = useMemo(
    () => supermarkets.find((market) => market.id === supermarketId) ?? null,
    [supermarkets, supermarketId],
  );
  const selectedStore = useMemo(
    () => stores.find((store) => store.id === storeId) ?? null,
    [stores, storeId],
  );

  const startUrl =
    scope === "STORE" ? selectedStore?.url ?? null : selected?.websiteUrl ?? null;

  useEffect(() => {
    void adminApi
      .supermarkets()
      .then((items) => {
        setSupermarkets(items);
        setSupermarketId((current) => current || items[0]?.id || "");
      })
      .catch(() => setError("Não foi possível carregar as redes."));
  }, []);

  useEffect(() => {
    if (!supermarketId) {
      setStores([]);
      setStoreId("");
      return;
    }
    let alive = true;
    setLoadingStores(true);
    void adminApi
      .supermarket(supermarketId)
      .then((market) => {
        if (!alive) return;
        const rows = market.stores.map((store) => ({
          id: store.id,
          name: store.name,
          url: store.url,
        }));
        setStores(rows);
        setStoreId((current) =>
          rows.some((row) => row.id === current) ? current : rows[0]?.id ?? "",
        );
      })
      .catch(() => {
        if (!alive) return;
        setStores([]);
        setError("Não foi possível carregar as filiais da rede.");
      })
      .finally(() => {
        if (alive) setLoadingStores(false);
      });
    return () => {
      alive = false;
    };
  }, [supermarketId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("O nome precisa ter pelo menos 2 caracteres.");
      return;
    }
    if (scope === "STORE" && !storeId) {
      setError("Escolha a filial para este worker.");
      return;
    }
    if (!startUrl) {
      setError(
        scope === "STORE"
          ? "Essa filial ainda não tem link. Cadastre o link na filial e tente de novo."
          : "Essa rede ainda não tem URL cadastrada. Edite o supermercado e tente de novo.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await adminApi.createScraperFlow({
        supermarketId,
        name: name.trim(),
        startUrl,
        scope,
        storeId: scope === "STORE" ? storeId : undefined,
      });
      router.push(`/admin/scraper/${created.id}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "SUPERMARKET_WEBSITE_REQUIRED") {
        setError("Essa rede ainda não tem URL cadastrada. Edite o supermercado e tente de novo.");
      } else if (cause instanceof ApiError && cause.code === "STORE_URL_REQUIRED") {
        setError("Essa filial ainda não tem link. Cadastre o link na filial e tente de novo.");
      } else if (cause instanceof ApiError && cause.code === "STORE_REQUIRED") {
        setError("Escolha a filial para este worker.");
      } else if (cause instanceof ApiError && cause.code === "INVALID_SCRAPER_FLOW") {
        setError("Dados inválidos para criar o fluxo. Confira nome e URL.");
      } else if (cause instanceof ApiError && cause.status === 401) {
        setError("Sessão expirada. Faça login de novo.");
      } else {
        setError("Não foi possível criar o fluxo.");
      }
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    !saving &&
    Boolean(supermarketId) &&
    Boolean(startUrl) &&
    (scope === "SUPERMARKET" || Boolean(storeId));

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/scraper" className="hover:underline">
          Workers
        </Link>
        {" / "}
        Novo
      </p>
      <OpsHeader
        title="Novo worker"
        subtitle="Escopo rede ou filial. URL inicial vem do cadastro escolhido."
      />
      <form
        onSubmit={(event) => void submit(event)}
        className="max-w-xl space-y-4 rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] p-5"
      >
        <label className="block text-sm font-medium">
          Rede
          <select
            required
            value={supermarketId}
            onChange={(event) => {
              setSupermarketId(event.target.value);
              setScope("SUPERMARKET");
            }}
            className="ds-input mt-1 w-full"
          >
            {supermarkets.map((market) => (
              <option key={market.id} value={market.id}>
                {market.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Escopo</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              checked={scope === "SUPERMARKET"}
              onChange={() => setScope("SUPERMARKET")}
            />
            Toda a rede
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              checked={scope === "STORE"}
              onChange={() => setScope("STORE")}
              disabled={!stores.length}
            />
            Filial específica
            {!loadingStores && !stores.length ? (
              <span className="text-[var(--ds-color-muted-foreground)]">
                (cadastre uma filial antes)
              </span>
            ) : null}
          </label>
        </fieldset>

        {scope === "STORE" ? (
          <label className="block text-sm font-medium">
            Filial
            <select
              required
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
              className="ds-input mt-1 w-full"
              disabled={!stores.length}
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                  {store.url ? "" : " — sem link"}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {selected ? (
          <p className="text-sm text-[var(--ds-color-muted-foreground)]">
            URL inicial:{" "}
            {startUrl ? (
              <span className="text-[var(--ds-color-foreground)]">{startUrl}</span>
            ) : scope === "STORE" ? (
              <>
                ausente —{" "}
                <Link href={`/admin/supermarkets/${selected.id}`} className="underline">
                  cadastrar link na filial
                </Link>
              </>
            ) : (
              <>
                ausente —{" "}
                <Link href={`/admin/supermarkets/${selected.id}`} className="underline">
                  cadastrar na rede
                </Link>
              </>
            )}
          </p>
        ) : null}

        <label className="block text-sm font-medium">
          Nome
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="ds-input mt-1 w-full"
            placeholder={scope === "STORE" ? "Encarte Bezerra" : "Encarte semanal"}
          />
        </label>
        {error ? <p className="text-sm text-[var(--ds-color-danger)]">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="ds-btn ds-btn--primary disabled:opacity-60"
          >
            {saving ? "Criando…" : "Criar fluxo"}
          </button>
          <Link href="/admin/scraper" className="ds-btn ds-btn--outline">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
