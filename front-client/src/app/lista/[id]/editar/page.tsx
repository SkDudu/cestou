"use client";

import Link from "next/link";
import { FormEvent, use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Button, EmptyState, Input, Panel, Skeleton } from "@/components/ui";
import { clientApi } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type ListItem = {
  id: string;
  queryText: string;
  offerId: string | null;
  canonicalProductId: string | null;
};

type ShoppingList = {
  id: string;
  name: string;
  items: ListItem[];
};

type Candidate = {
  key: string;
  canonicalProductId: string | null;
  offerId: string | null;
  label: string;
  brand: string | null;
  offerCount: number;
  minPrice: number;
};

export default function EditarListaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [name, setName] = useState("");
  const [productDraft, setProductDraft] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const data = await clientApi<ShoppingList>(`/lists/${id}`);
    setList(data);
    setName(data.name);
  }

  useEffect(() => {
    void reload().catch(() => setList(null));
  }, [id]);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/lists/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      await reload();
    } catch {
      setError("Não foi possível salvar o nome.");
    } finally {
      setBusy(false);
    }
  }

  async function addFreeText(event: FormEvent) {
    event.preventDefault();
    const text = productDraft.trim();
    if (!text) return;
    setBusy(true);
    await clientApi(`/lists/${id}/items`, {
      method: "POST",
      body: JSON.stringify({ queryText: text }),
    });
    setProductDraft("");
    setCandidates([]);
    await reload();
    setBusy(false);
  }

  async function suggest() {
    const q = productDraft.trim();
    if (q.length < 2) return;
    setSearching(true);
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

  async function addCandidate(candidate: Candidate) {
    setBusy(true);
    await clientApi(`/lists/${id}/items`, {
      method: "POST",
      body: JSON.stringify({
        queryText: candidate.label,
        canonicalProductId: candidate.canonicalProductId ?? undefined,
        offerId: candidate.offerId ?? undefined,
      }),
    });
    setCandidates([]);
    setProductDraft("");
    await reload();
    setBusy(false);
  }

  async function removeItem(itemId: string) {
    setBusy(true);
    await clientApi(`/lists/items/${itemId}`, { method: "DELETE" });
    await reload();
    setBusy(false);
  }

  if (!list) {
    return (
      <AppShell title="Editar lista">
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Editar lista"
      subtitle="Altere o nome e os produtos desta lista."
      actions={
        <Link
          href={`/lista/${id}`}
          className="inline-flex items-center gap-2 text-sm text-[var(--ds-color-muted-foreground)]"
        >
          <ArrowLeft size={16} />
          Voltar
        </Link>
      }
    >
      <div className="mx-auto max-w-2xl space-y-8">
        <form onSubmit={(event) => void saveName(event)} className="space-y-2">
          <span className="ds-label-caps">Nome da lista</span>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="outline" disabled={busy}>
              Salvar nome
            </Button>
          </div>
        </form>

        <section className="space-y-3">
          <p className="ds-label-caps">Adicionar produto</p>
          <form
            onSubmit={(event) => void addFreeText(event)}
            className="flex flex-wrap gap-2"
          >
            <Input
              value={productDraft}
              onChange={(event) => setProductDraft(event.target.value)}
              placeholder="Ex.: leite em pó, carne"
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={busy}>
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
              {searching ? "…" : "Sugerir"}
            </Button>
          </form>
          {candidates.length > 0 ? (
            <ul className="space-y-2">
              {candidates.map((candidate) => (
                <li key={candidate.key}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void addCandidate(candidate)}
                    className="flex w-full items-start justify-between gap-4 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border)] px-4 py-3 text-left"
                  >
                    <span>
                      <span className="font-medium">{candidate.label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--ds-color-muted-foreground)]">
                        {[candidate.brand, formatCurrency(candidate.minPrice)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Plus size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section>
          <p className="ds-label-caps">Produtos ({list.items.length})</p>
          {list.items.length === 0 ? (
            <EmptyState
              title="Lista vazia"
              body="Adicione produtos acima."
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {list.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border)] px-4 py-3"
                >
                  <span className="font-medium">{item.queryText}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeItem(item.id)}
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

        <Button type="button" onClick={() => router.push(`/lista/${id}`)}>
          <PencilSimple size={16} />
          Concluir edição
        </Button>
      </div>
    </AppShell>
  );
}
