"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { OpsHeader, OpsKpi } from "@/components/admin/ops";
import { formatCompact, formatNumber } from "@/lib/format";

export default function BrandsPage() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Id<"brands"> | null>(null);
  const [name, setName] = useState("");
  const [createAliases, setCreateAliases] = useState("");
  const [editAliases, setEditAliases] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const brands = useQuery(api.brands.listWithCounts, {
    search: q.trim() || undefined,
  });
  const detail = useQuery(
    api.brands.get,
    selected ? { id: selected } : "skip",
  );
  const create = useMutation(api.brands.create);
  const update = useMutation(api.brands.update);
  const merge = useMutation(api.brands.merge);

  const totalOffers = useMemo(
    () => (brands ?? []).reduce((n, b) => n + b.offerCount, 0),
    [brands],
  );

  async function onCreate() {
    setMsg(null);
    try {
      const id = await create({
        name,
        aliases: createAliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      });
      setName("");
      setCreateAliases("");
      setSelected(id);
      setMsg("Marca criada");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  async function onSave() {
    if (!selected || !detail) return;
    setMsg(null);
    try {
      await update({
        id: selected,
        name: detail.name,
        aliases: editAliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      });
      setMsg("Salvo");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  async function onMerge() {
    if (!selected || !mergeTarget) return;
    setMsg(null);
    try {
      const r = await merge({
        sourceId: selected,
        targetId: mergeTarget as Id<"brands">,
      });
      setMsg(
        `Merge: ${r.offersReassigned} ofertas, ${r.productsReassigned} canônicos`,
      );
      setSelected(mergeTarget as Id<"brands">);
      setMergeTarget("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div>
      <OpsHeader
        crumb="Catálogo / Marcas"
        title="Marcas"
        stamp="CRUD + aliases + merge"
        filterTarget={() => searchRef.current?.focus()}
      />

      <section className="flex gap-4 pb-4">
        <OpsKpi
          label="Marcas"
          value={formatCompact(brands?.length ?? 0)}
          foot="no filtro"
        />
        <OpsKpi
          label="Ofertas ligadas"
          value={formatNumber(totalOffers)}
          foot="soma das contagens"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="ds-table-card">
          <div className="ds-table-head">
            <h2 className="text-[15px] font-semibold">Lista</h2>
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar marca ou alias"
              className="ds-search"
            />
          </div>
          <div className="ds-table-cols">
            <span className="ds-label-caps min-w-0 flex-1">Nome</span>
            <span className="ds-label-caps w-[72px] shrink-0">Canônicos</span>
            <span className="ds-label-caps w-[72px] shrink-0">Ofertas</span>
          </div>
          {(brands ?? []).map((b) => (
            <button
              key={b._id}
              type="button"
              onClick={() => {
                setSelected(b._id);
                setEditAliases((b.aliases ?? []).join(", "));
              }}
              className={`ds-table-row w-full text-left ${
                selected === b._id ? "bg-[var(--ds-color-muted)]" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {b.name}
                {b.aliases?.length ? (
                  <span className="ml-2 text-[11px] font-normal text-[var(--ds-color-muted-foreground)]">
                    +{b.aliases.length} alias
                  </span>
                ) : null}
              </span>
              <span className="w-[72px] shrink-0 font-mono">
                {b.canonicalCount}
              </span>
              <span className="w-[72px] shrink-0 font-mono">{b.offerCount}</span>
            </button>
          ))}
          {brands === undefined ? (
            <p className="px-[18px] py-6 text-sm text-[var(--ds-color-muted-foreground)]">
              Carregando…
            </p>
          ) : !brands.length ? (
            <p className="px-[18px] py-6 text-sm text-[var(--ds-color-muted-foreground)]">
              Nenhuma marca.
            </p>
          ) : null}
        </section>

        <div className="space-y-4">
          <section className="ds-card space-y-3 p-4">
            <h2 className="text-[15px] font-semibold">Nova marca</h2>
            <input
              className="ds-search w-full"
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="ds-search w-full"
              placeholder="Aliases (vírgula)"
              value={createAliases}
              onChange={(e) => setCreateAliases(e.target.value)}
            />
            <button
              type="button"
              className="ds-btn ds-btn--outline"
              disabled={!name.trim()}
              onClick={onCreate}
            >
              Criar
            </button>
          </section>

          {detail ? (
            <section className="ds-card space-y-3 p-4">
              <h2 className="text-[15px] font-semibold">{detail.name}</h2>
              <p className="text-[12px] text-[var(--ds-color-muted-foreground)]">
                slug {detail.slug} · {detail.canonicalCount} canônicos ·{" "}
                {detail.offerCount} ofertas
              </p>
              <label className="ds-label-caps block">Aliases</label>
              <input
                className="ds-search w-full"
                value={editAliases}
                onChange={(e) => setEditAliases(e.target.value)}
              />
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                onClick={onSave}
              >
                Salvar aliases
              </button>

              <label className="ds-label-caps mt-2 block">
                Merge nesta marca (destino)
              </label>
              <select
                className="ds-search w-full"
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
              >
                <option value="">Selecionar destino…</option>
                {(brands ?? [])
                  .filter((b) => b._id !== selected)
                  .map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="ds-btn ds-btn--outline"
                disabled={!mergeTarget}
                onClick={onMerge}
              >
                Merge (apaga {detail.name})
              </button>

              {detail.products.length ? (
                <div className="pt-2">
                  <p className="ds-label-caps mb-2">Canônicos</p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                    {detail.products.map((p) => (
                      <li key={p._id}>
                        <Link
                          href={`/admin/products/${p._id}`}
                          className="hover:underline"
                        >
                          {p.canonicalName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {msg ? (
            <p className="text-sm text-[var(--ds-color-muted-foreground)]">{msg}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
