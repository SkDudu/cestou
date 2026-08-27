"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OpsHeader, OpsKpi, OpsTabs, statusDot } from "@/components/admin/ops";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatNumber } from "@/lib/format";

export default function SupermarketsPage() {
  const list = useQuery(api.supermarkets.list);
  const overview = useQuery(api.dashboard.overview);
  const create = useMutation(api.supermarkets.create);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const stores = list ?? [];
  const withoutFlyer = stores.filter((s) => s.flyerCount === 0);
  const workerFail = new Set(
    (overview?.workers ?? [])
      .filter((w) => w.status === "fail")
      .map((w) => w.supermarketId),
  );
  const failStores = stores.filter((s) => workerFail.has(s._id));
  const active = stores.filter((s) => s.active);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return stores.filter((s) => {
      if (tab === "active" && !s.active) return false;
      if (tab === "noflyer" && s.flyerCount > 0) return false;
      if (tab === "fail" && !workerFail.has(s._id)) return false;
      if (!needle) return true;
      return (
        s.name.toLowerCase().includes(needle) ||
        s.city.toLowerCase().includes(needle) ||
        s.slug.includes(needle)
      );
    });
  }, [stores, tab, q, workerFail]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const s of rows) {
      const key = s.name.split(/\s+/)[0] || "Rede";
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [rows]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const id = await create({
        name: String(fd.get("name") ?? ""),
        city: String(fd.get("city") ?? "Fortaleza"),
        state: String(fd.get("state") ?? "CE"),
        country: String(fd.get("country") ?? "BR"),
        websiteUrl: String(fd.get("websiteUrl") ?? "") || undefined,
        active: true,
      });
      window.location.href = `/admin/supermarkets/${id}`;
    } catch (err) {
      setError(String(err));
    }
  }

  if (list === undefined) return <p className="ds-meta">Carregando…</p>;

  const redes = new Set(stores.map((s) => s.name.split(/\s+/)[0])).size;

  return (
    <div>
      <OpsHeader
        title="Lojas"
        subtitle={`${stores.length} filiais · ${redes} redes`}
        filterTarget={() => searchRef.current?.focus()}
        primary={
          <button
            type="button"
            className="ds-btn ds-btn--primary"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Fechar" : "Nova filial"}
          </button>
        }
      />

      {open ? (
        <form onSubmit={onSubmit} className="ds-form ds-form-2">
          <input name="name" required placeholder="Nome" className="ds-input" />
          <input name="city" defaultValue="Fortaleza" className="ds-input" />
          <input name="state" defaultValue="CE" className="ds-input" />
          <input name="country" defaultValue="BR" className="ds-input" />
          <input
            name="websiteUrl"
            placeholder="Website"
            className="ds-input"
            style={{ gridColumn: "1 / -1" }}
          />
          {error ? (
            <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>
          ) : null}
          <button type="submit" className="ds-btn ds-btn--primary ds-btn--lg">
            Criar
          </button>
        </form>
      ) : null}

      <section className="flex gap-4 pb-4">
        <OpsKpi label="Redes" value={redes} foot="grupos" />
        <OpsKpi label="Filiais" value={stores.length} foot="operando sob as redes" />
        <OpsKpi
          label="Encartes vigentes"
          value={formatNumber(stores.reduce((n, s) => n + (s.activeFlyer ? 1 : 0), 0))}
          foot="ciclos publicados agora"
        />
        <OpsKpi
          label="Workers em falha"
          value={failStores.length}
          danger={failStores.length > 0}
          foot={failStores[0]?.name ?? "nenhuma falha"}
        />
      </section>

      <OpsTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "all", label: "Todas", count: stores.length },
          { id: "active", label: "Ativas", count: active.length },
          { id: "noflyer", label: "Sem encarte", count: withoutFlyer.length },
          {
            id: "fail",
            label: "Worker falha",
            count: failStores.length,
            warn: true,
          },
        ]}
      />

      <section className="ds-table-card">
        <div className="ds-table-head">
          <h2 className="text-[15px] font-semibold">Filiais por rede</h2>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar rede ou filial"
            className="ds-search"
          />
        </div>
        <div className="ds-table-cols">
          <span className="ds-label-caps w-[228px] shrink-0">Filial</span>
          <span className="ds-label-caps w-[160px] shrink-0">Cidade</span>
          <span className="ds-label-caps w-[92px] shrink-0">Status</span>
          <span className="ds-label-caps w-[80px] shrink-0">Encartes</span>
          <span className="ds-label-caps w-[80px] shrink-0">Ofertas</span>
          <span className="ds-label-caps min-w-0 flex-1">Último ciclo</span>
        </div>
        {groups.map(([rede, items]) => (
          <div key={rede}>
            <div className="ds-group-row">
              <span>{rede} rede</span>
              <span className="font-normal text-[var(--ds-color-muted-foreground)]">
                {items.length} {items.length === 1 ? "filial" : "filiais"}
              </span>
            </div>
            {items.map((s) => (
              <Link
                key={s._id}
                href={`/admin/supermarkets/${s._id}`}
                className="ds-table-row"
                style={{ height: 64 }}
              >
                <span className="flex w-[228px] shrink-0 items-center gap-2">
                  <span
                    className="ds-dot"
                    style={{
                      background: workerFail.has(s._id)
                        ? statusDot("fail")
                        : statusDot("ok"),
                    }}
                  />
                  <span>
                    <span className="block font-medium">{s.name}</span>
                    <span className="font-mono text-xs text-[var(--ds-color-muted-foreground)]">
                      {s.slug}
                    </span>
                  </span>
                </span>
                <span className="w-[160px] shrink-0">
                  {s.city} · {s.state}
                </span>
                <span className="w-[92px] shrink-0">
                  <StatusBadge status={s.active ? "active" : "disabled"} />
                </span>
                <span className="w-[80px] shrink-0 font-mono">{s.flyerCount}</span>
                <span className="w-[80px] shrink-0 font-mono">{s.offerCount}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--ds-color-muted-foreground)]">
                  {s.activeFlyer?.title ?? "—"}
                </span>
              </Link>
            ))}
          </div>
        ))}
        {!rows.length ? (
          <p className="px-[18px] py-8 text-center text-sm text-[var(--ds-color-muted-foreground)]">
            Nenhuma filial.
          </p>
        ) : null}
      </section>
    </div>
  );
}
