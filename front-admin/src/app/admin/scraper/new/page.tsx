"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OpsHeader } from "@/components/admin/ops";
import { ApiError, adminApi } from "@/lib/api";

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
  const [supermarkets, setSupermarkets] = useState<Array<{ id: string; name: string }>>([]);
  const [name, setName] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [supermarketId, setSupermarketId] = useState(search.get("supermarketId") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void adminApi.supermarkets().then((items) => {
      setSupermarkets(items);
      setSupermarketId((current) => current || items[0]?.id || "");
    }).catch(() => setError("Não foi possível carregar as redes."));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("O nome precisa ter pelo menos 2 caracteres.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await adminApi.createScraperFlow({ supermarketId, name, startUrl });
      router.push(`/admin/scraper/${created.id}`);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === "INVALID_SCRAPER_FLOW"
          ? "O nome precisa ter pelo menos 2 caracteres."
          : "Não foi possível criar o fluxo.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--ds-color-muted-foreground)]">
        <Link href="/admin/scraper" className="hover:underline">Workers</Link>
        {" / "}
        Novo
      </p>
      <OpsHeader
        title="Novo worker"
        subtitle="Cria o fluxo no Postgres. Ensino de steps volta quando a API de steps estiver pronta."
      />
      <form onSubmit={(event) => void submit(event)} className="max-w-xl space-y-4 rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] p-5">
        <label className="block text-sm font-medium">
          Rede
          <select required value={supermarketId} onChange={(event) => setSupermarketId(event.target.value)} className="ds-input mt-1 w-full">
            {supermarkets.map((market) => (
              <option key={market.id} value={market.id}>{market.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Nome
          <input required value={name} onChange={(event) => setName(event.target.value)} className="ds-input mt-1 w-full" placeholder="Encarte semanal" />
        </label>
        <label className="block text-sm font-medium">
          URL inicial
          <input required type="url" value={startUrl} onChange={(event) => setStartUrl(event.target.value)} className="ds-input mt-1 w-full" placeholder="https://..." />
        </label>
        {error ? <p className="text-sm text-[var(--ds-color-danger)]">{error}</p> : null}
        <div className="flex gap-2">
          <button type="submit" disabled={saving || !supermarketId} className="ds-btn ds-btn--primary disabled:opacity-60">
            {saving ? "Criando…" : "Criar fluxo"}
          </button>
          <Link href="/admin/scraper" className="ds-btn ds-btn--outline">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
