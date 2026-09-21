"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Button, Input, Panel } from "@/components/ui";
import { clientApi } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type Candidate = {
  key: string;
  canonicalProductId: string | null;
  offerId: string | null;
  label: string;
  brand: string | null;
  offerCount: number;
  minPrice: number;
};

type Picked = {
  key: string;
  queryText: string;
  canonicalProductId?: string;
  offerId?: string;
};

export default function NovaListaPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [productDraft, setProductDraft] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addFreeText(raw: string) {
    const text = raw.trim();
    if (!text) return;
    const key = `text:${text.toLowerCase()}`;
    setPicked((current) => {
      if (current.some((row) => row.key === key || row.queryText.toLowerCase() === text.toLowerCase())) {
        return current;
      }
      return [...current, { key, queryText: text }];
    });
    setProductDraft("");
    setCandidates([]);
  }

  function addProduct(event: FormEvent) {
    event.preventDefault();
    addFreeText(productDraft);
  }

  async function suggest() {
    const q = productDraft.trim();
    if (q.length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const data = await clientApi<{ candidates: Candidate[] }>(
        `/lists/product-candidates?q=${encodeURIComponent(q)}`,
      );
      setCandidates(data.candidates);
    } catch {
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  }

  function addCandidate(candidate: Candidate) {
    setPicked((current) => {
      if (current.some((row) => row.key === candidate.key)) return current;
      return [
        ...current,
        {
          key: candidate.key,
          queryText: candidate.label,
          canonicalProductId: candidate.canonicalProductId ?? undefined,
          offerId: candidate.offerId ?? undefined,
        },
      ];
    });
  }

  function removePicked(key: string) {
    setPicked((current) => current.filter((row) => row.key !== key));
  }

  async function save() {
    if (!name.trim() || picked.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const list = await clientApi<{ id: string }>("/lists", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          items: picked.map((row) => ({
            queryText: row.queryText,
            canonicalProductId: row.canonicalProductId,
            offerId: row.offerId,
            quantity: 1,
          })),
        }),
      });
      router.push(`/lista/${list.id}`);
    } catch {
      setError("Não foi possível salvar a lista.");
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Nova lista"
      subtitle="Nomeie a lista e digite os produtos que quiser — com ou sem oferta no banco."
      actions={
        <Link
          href="/lista"
          className="inline-flex items-center gap-2 text-sm text-[var(--ds-color-muted-foreground)]"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>
      }
    >
      <div className="mx-auto max-w-2xl space-y-8">
        <label className="block space-y-2">
          <span className="ds-label-caps">Nome da lista</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Churrasco domingo"
          />
        </label>

        <section className="space-y-3">
          <p className="ds-label-caps">Adicionar produto</p>
          <form onSubmit={addProduct} className="flex flex-wrap gap-2">
            <Input
              value={productDraft}
              onChange={(event) => setProductDraft(event.target.value)}
              placeholder="Ex.: leite em pó, carne, frango"
              className="min-w-0 flex-1"
            />
            <Button type="submit">
              <Plus size={16} />
              Adicionar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={searching || productDraft.trim().length < 2}
              onClick={() => void suggest()}
            >
              <MagnifyingGlass size={16} />
              {searching ? "…" : "Sugerir do catálogo"}
            </Button>
          </form>
          <p className="text-xs text-[var(--ds-color-muted-foreground)]">
            Digite e adicione direto. Sugestões do catálogo são opcionais.
          </p>
          {candidates.length > 0 ? (
            <ul className="space-y-2">
              {candidates.map((candidate) => {
                const already = picked.some((row) => row.key === candidate.key);
                return (
                  <li key={candidate.key}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => addCandidate(candidate)}
                      className="flex w-full items-start justify-between gap-4 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border)] px-4 py-3 text-left disabled:opacity-50"
                    >
                      <span>
                        <span className="font-medium">{candidate.label}</span>
                        <span className="mt-0.5 block text-xs text-[var(--ds-color-muted-foreground)]">
                          {[candidate.brand, `${candidate.offerCount} oferta(s)`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm">
                        <Plus size={14} />
                        {formatCurrency(candidate.minPrice)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section className="space-y-3">
          <p className="ds-label-caps">Na lista ({picked.length})</p>
          {picked.length === 0 ? (
            <p className="text-sm text-[var(--ds-color-muted-foreground)]">
              Ex.: leite em pó, leite líquido, carne…
            </p>
          ) : (
            <ul className="space-y-2">
              {picked.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border)] px-4 py-3"
                >
                  <span>
                    <span className="font-medium">{row.queryText}</span>
                    {!row.canonicalProductId && !row.offerId ? (
                      <span className="mt-0.5 block text-xs text-[var(--ds-color-muted-foreground)]">
                        Texto livre · compare por nome nas ofertas
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePicked(row.key)}
                    className="text-[var(--ds-color-danger)]"
                    aria-label="Remover"
                  >
                    <Trash size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error ? (
          <Panel className="p-4 text-sm text-[var(--ds-color-danger)]">
            {error}
          </Panel>
        ) : null}

        <Button
          type="button"
          disabled={!name.trim() || picked.length === 0 || saving}
          onClick={() => void save()}
        >
          {saving ? "Salvando…" : "Salvar lista"}
        </Button>
      </div>
    </AppShell>
  );
}
