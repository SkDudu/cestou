"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Funnel, Heart, Plus, X } from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import {
  Button,
  BottomSheet,
  EmptyState,
  Input,
  Panel,
  Skeleton,
} from "@/components/ui";
import { clientApi } from "@/lib/api";
import {
  categoryLabel,
  categorySortKey,
  normalizeCategoryId,
} from "@/lib/categories";
import { formatCurrency } from "@/lib/format";

type Offer = {
  id: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  unit: string | null;
  price: string;
  memberPrice: string | null;
  supermarket: { id: string; name: string };
  canonicalProduct: {
    id: string;
    canonicalName: string;
    category: string | null;
  } | null;
};

type CategoryOption = {
  id: string | null;
  name: string;
  count: number;
};

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function ChipToggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ds-chip ds-chip--sm ${on ? "ds-chip--on" : "ds-chip--outline"}`}
      aria-pressed={on}
    >
      {label}
    </button>
  );
}

export default function BuscaPage() {
  const [query, setQuery] = useState("");
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(
    () => new Set(),
  );
  const [draftCategories, setDraftCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [draftMarkets, setDraftMarkets] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    void clientApi<Offer[]>("/search")
      .then(setOffers)
      .catch(() => setOffers([]));
    void clientApi<CategoryOption[]>("/categories")
      .then(setCategoryOptions)
      .catch(() => setCategoryOptions([]));
  }, []);

  const markets = useMemo(() => {
    if (!offers) return [];
    const map = new Map<string, string>();
    for (const offer of offers) {
      map.set(offer.supermarket.id, offer.supermarket.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [offers]);

  const results = useMemo(() => {
    if (!offers) return null;
    const term = query.trim().toLowerCase();
    return offers.filter((offer) => {
      if (term.length >= 2) {
        const haystack = [
          offer.name,
          offer.brand,
          offer.supermarket.name,
          offer.canonicalProduct?.canonicalName,
          offer.canonicalProduct?.category,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (selectedCategories.size > 0) {
        const cat = normalizeCategoryId(offer.canonicalProduct?.category);
        if (!selectedCategories.has(cat)) return false;
      }
      if (selectedMarkets.size > 0) {
        if (!selectedMarkets.has(offer.supermarket.id)) return false;
      }
      return true;
    });
  }, [offers, query, selectedCategories, selectedMarkets]);

  const grouped = useMemo(() => {
    if (!results) return null;
    const map = new Map<string, Offer[]>();
    for (const offer of results) {
      const key = normalizeCategoryId(offer.canonicalProduct?.category);
      const list = map.get(key) ?? [];
      list.push(offer);
      map.set(key, list);
    }
    return [...map.entries()].sort(
      ([a], [b]) => categorySortKey(a || null) - categorySortKey(b || null),
    );
  }, [results]);

  const activeFilterCount = selectedCategories.size + selectedMarkets.size;

  function openFilters() {
    setDraftCategories(new Set(selectedCategories));
    setDraftMarkets(new Set(selectedMarkets));
    setFilterOpen(true);
  }

  function applyFilters() {
    setSelectedCategories(new Set(draftCategories));
    setSelectedMarkets(new Set(draftMarkets));
    setFilterOpen(false);
  }

  function clearDraft() {
    setDraftCategories(new Set());
    setDraftMarkets(new Set());
  }

  function clearAllFilters() {
    setSelectedCategories(new Set());
    setSelectedMarkets(new Set());
    setDraftCategories(new Set());
    setDraftMarkets(new Set());
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
  }

  async function add(offer?: Offer) {
    const queryText = offer?.name ?? query.trim();
    if (!queryText) return;
    setSaving(offer?.id ?? queryText);
    await clientApi("/lists/default/items", {
      method: "POST",
      body: JSON.stringify({
        queryText,
        offerId: offer?.id,
        canonicalProductId: offer?.canonicalProduct?.id,
      }),
    });
    setSaving(null);
  }

  async function favorite(offer: Offer) {
    if (!offer.canonicalProduct) return;
    await clientApi(`/products/${offer.canonicalProduct.id}/favorite`, {
      method: "PUT",
    });
  }

  return (
    <AppShell
      title="Buscar produto"
      subtitle="Ofertas validadas de encartes vigentes, agrupadas por categoria."
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => void onSubmit(event)}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar… ex.: arroz 5kg"
          aria-label="Filtrar produtos"
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          onClick={openFilters}
          aria-label="Abrir filtros"
          className="relative shrink-0 px-3"
        >
          <Funnel size={18} aria-hidden />
          {activeFilterCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--ds-color-harbor)] px-1 text-[11px] font-semibold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </form>

      {activeFilterCount > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[...selectedCategories].map((id) => (
            <button
              key={`cat-${id || "outros"}`}
              type="button"
              className="ds-chip ds-chip--tag"
              onClick={() =>
                setSelectedCategories((prev) => toggleInSet(prev, id))
              }
            >
              {categoryLabel(id || null)}
              <X size={12} aria-hidden />
            </button>
          ))}
          {[...selectedMarkets].map((id) => {
            const name =
              markets.find((m) => m.id === id)?.name ?? "Mercado";
            return (
              <button
                key={`mkt-${id}`}
                type="button"
                className="ds-chip ds-chip--tag"
                onClick={() =>
                  setSelectedMarkets((prev) => toggleInSet(prev, id))
                }
              >
                {name}
                <X size={12} aria-hidden />
              </button>
            );
          })}
          <button
            type="button"
            className="text-xs text-[var(--ds-color-muted-foreground)] underline-offset-2 hover:underline"
            onClick={clearAllFilters}
          >
            Limpar filtros
          </button>
        </div>
      ) : null}

      <BottomSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filtros"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={clearDraft}>
              Limpar
            </Button>
            <Button type="button" className="ml-auto" onClick={applyFilters}>
              Aplicar
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <section>
            <p className="ds-label-caps mb-3 text-[var(--ds-color-muted-foreground)]">
              Categorias
            </p>
            {categoryOptions.length === 0 ? (
              <p className="text-sm text-[var(--ds-color-muted-foreground)]">
                Nenhuma categoria no catálogo ainda.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categoryOptions.map((opt) => {
                  const key = opt.id ?? "";
                  return (
                    <ChipToggle
                      key={key || "outros"}
                      label={opt.name}
                      on={draftCategories.has(key)}
                      onClick={() =>
                        setDraftCategories((prev) => toggleInSet(prev, key))
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>
          <section>
            <p className="ds-label-caps mb-3 text-[var(--ds-color-muted-foreground)]">
              Supermercados
            </p>
            {markets.length === 0 ? (
              <p className="text-sm text-[var(--ds-color-muted-foreground)]">
                Nenhum mercado nas ofertas atuais.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {markets.map((m) => (
                  <ChipToggle
                    key={m.id}
                    label={m.name}
                    on={draftMarkets.has(m.id)}
                    onClick={() =>
                      setDraftMarkets((prev) => toggleInSet(prev, m.id))
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </BottomSheet>

      {grouped === null ? (
        <div className="mt-8">
          <Skeleton className="h-40 w-full" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nenhum produto"
            body={
              query.trim().length >= 2 || activeFilterCount > 0
                ? "Nenhuma oferta vigente combina com o filtro."
                : "Não há ofertas validadas em encartes vigentes."
            }
            action={
              query.trim() ? (
                <Button variant="ghost" onClick={() => void add()}>
                  <Plus size={16} />
                  Adicionar à lista
                </Button>
              ) : activeFilterCount > 0 ? (
                <Button variant="ghost" onClick={clearAllFilters}>
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {grouped.map(([catKey, items]) => (
            <section key={catKey || "outros"}>
              <h2 className="ds-label-caps mb-3 text-[var(--ds-color-muted-foreground)]">
                {categoryLabel(catKey || null)}
                <span className="ml-2 font-normal opacity-70">
                  ({items.length})
                </span>
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {items.map((offer) => (
                  <li key={offer.id}>
                    <Panel className="flex flex-col gap-3">
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-medium">{offer.name}</p>
                          <p className="text-xs text-[var(--ds-color-muted-foreground)]">
                            {[offer.brand, offer.quantity, offer.unit]
                              .filter(Boolean)
                              .join(" · ")}
                            {[offer.brand, offer.quantity, offer.unit].some(
                              Boolean,
                            )
                              ? " · "
                              : ""}
                            {offer.supermarket.name}
                          </p>
                        </div>
                        {offer.canonicalProduct ? (
                          <button
                            type="button"
                            onClick={() => void favorite(offer)}
                            className="text-[var(--ds-color-accent)]"
                            aria-label="Favoritar produto"
                          >
                            <Heart size={18} />
                          </button>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between">
                        <strong>
                          {formatCurrency(
                            Number(offer.memberPrice ?? offer.price),
                          )}
                        </strong>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void add(offer)}
                          disabled={saving === offer.id}
                        >
                          <Plus size={14} />
                          Lista
                        </Button>
                      </div>
                    </Panel>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
