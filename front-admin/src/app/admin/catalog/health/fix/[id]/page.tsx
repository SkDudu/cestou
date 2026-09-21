"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { OpsHeader } from "@/components/admin/ops";
import { ApiError, adminApi, loadOfferPages, type OfferListItem } from "@/lib/api";
import { needsBrandFix } from "@/lib/commodity";
import { flyerPageFileUrl } from "@/lib/flyer-media";
import { PACK_UNITS, formatCurrency, formatPack } from "@/lib/format";

type OfferFix = "brand" | "qty" | "unit";
type Offer = Awaited<ReturnType<typeof adminApi.offer>>;
type Brand = Awaited<ReturnType<typeof adminApi.brands>>[number];
type Product = Awaited<ReturnType<typeof adminApi.product>>;
type Flyer = Awaited<ReturnType<typeof adminApi.flyer>>;

const FIX_TITLE: Record<OfferFix, string> = {
  brand: "Corrigir marca ausente",
  qty: "Corrigir quantidade ausente",
  unit: "Normalizar unidade",
};

const FIX_ACTION: Record<OfferFix, string> = {
  brand: "Definir marca cadastrada",
  qty: "Definir quantidade",
  unit: "Normalizar unidade",
};

function isOfferFix(v: string | null): v is OfferFix {
  return v === "brand" || v === "qty" || v === "unit";
}

function offerFixReason(fix: OfferFix) {
  if (fix === "brand") return "Marca ausente";
  if (fix === "qty") return "Quantidade ausente";
  return "Unidade inválida";
}

function inQueue(o: OfferListItem, fix: OfferFix) {
  if (fix === "brand") return needsBrandFix(o);
  if (fix === "qty") return !o.quantity && o.quantityValue == null;
  return Boolean(o.unit) && !o.unitNormalized && o.quantityValue == null;
}

function money(value: string | number | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function normBrand(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function CompareRow({
  label,
  status,
}: {
  label: string;
  status: "ok" | "fix" | "review";
}) {
  const text = status === "ok" ? "ok" : status === "fix" ? "corrigir" : "revisar";
  const className =
    status === "ok"
      ? "text-[var(--ds-color-success)]"
      : status === "fix"
        ? "text-[var(--ds-color-danger)]"
        : "text-[var(--ds-color-warning, #b45309)]";
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-[var(--ds-color-muted-foreground)]">{label}</span>
      <span className={`font-medium ${className}`}>{text}</span>
    </div>
  );
}

export default function HealthFixWorkbenchPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const offerId = params.id;
  const fix: OfferFix = isOfferFix(search.get("fix")) ? (search.get("fix") as OfferFix) : "brand";

  const [offer, setOffer] = useState<Offer | null>();
  const [product, setProduct] = useState<Product | null>(null);
  const [flyer, setFlyer] = useState<Flyer | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [queue, setQueue] = useState<OfferListItem[]>([]);
  const [error, setError] = useState<string>();
  const [brandQuery, setBrandQuery] = useState("");
  const [brandId, setBrandId] = useState<string | null | undefined>(undefined);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([adminApi.offer(offerId), adminApi.brands(), loadOfferPages()]).then(
      async ([row, brandRows, offers]) => {
        if (!alive) return;
        setOffer(row);
        setBrands(brandRows);
        setQueue(offers.filter((o) => inQueue(o, fix)));
        setBrandQuery(row.brand?.trim() || row.brandRecord?.name || "");
        setBrandId(row.brandId ?? undefined);
        setNameDraft(row.name);
        setMsg(null);
        if (row.canonicalProductId) {
          const linked = await adminApi.product(row.canonicalProductId);
          if (alive) setProduct(linked);
        } else {
          setProduct(null);
        }
        if (row.flyer?.id) {
          try {
            const linkedFlyer = await adminApi.flyer(row.flyer.id);
            if (alive) setFlyer(linkedFlyer);
          } catch {
            if (alive) setFlyer(null);
          }
        } else if (alive) {
          setFlyer(null);
        }
      },
      (cause: unknown) => {
        if (!alive) return;
        setOffer(null);
        setFlyer(null);
        setError(
          cause instanceof ApiError && cause.status === 404
            ? "Oferta não encontrada."
            : cause instanceof ApiError && cause.status === 401
              ? "Sua sessão expirou."
              : "Não foi possível carregar a bancada.",
        );
      },
    );
    return () => {
      alive = false;
    };
  }, [offerId, fix]);

  const index = queue.findIndex((o) => o.id === offerId);
  const strip = index < 0 ? [] : queue.slice(Math.max(0, index - 1), Math.max(0, index - 1) + 4);
  const reason = offerFixReason(fix);

  const filteredBrands = useMemo(() => {
    const q = normBrand(brandQuery);
    if (!q) return brands.slice(0, 12);
    return brands.filter((b) => normBrand(b.name).includes(q)).slice(0, 12);
  }, [brands, brandQuery]);

  const suggestions = useMemo(() => {
    if (fix !== "brand" || !offer) return [];
    const nameTokens = new Set(
      nameDraft
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .split(" ")
        .filter((t) => t.length > 2),
    );
    return brands
      .map((b) => {
        const tokens = normBrand(b.name).split(" ").filter(Boolean);
        return { ...b, score: tokens.filter((t) => nameTokens.has(t)).length };
      })
      .filter((b) => b.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"))
      .slice(0, 5);
  }, [fix, offer, brands, nameDraft]);

  const selectedBrandName =
    brandId === null
      ? "Sem marca aplicável"
      : brandId
        ? (brands.find((b) => b.id === brandId)?.name ?? null)
        : null;

  const typedBrand = brandQuery.trim();
  const exactBrand = typedBrand
    ? brands.find((b) => normBrand(b.name) === normBrand(typedBrand))
    : undefined;
  const canCreateBrand =
    fix === "brand" &&
    typedBrand.length >= 2 &&
    !exactBrand &&
    brandId === undefined;
  const nameTrimmed = nameDraft.trim();
  const nameDirty = Boolean(offer && nameTrimmed !== offer.name.trim());
  const nameValid = nameTrimmed.length >= 1;
  const canSaveBrand = brandId !== undefined || canCreateBrand || Boolean(exactBrand);
  const canSave = nameValid && (fix !== "brand" ? nameDirty : canSaveBrand || nameDirty);

  function goTo(id: string) {
    router.push(`/admin/catalog/health/fix/${id}?fix=${fix}`);
  }

  async function save(andNext: boolean) {
    if (!nameValid) return;
    if (fix === "brand" && !canSaveBrand && !nameDirty) return;
    if (fix !== "brand" && !nameDirty) return;
    setBusy(true);
    setMsg(null);
    try {
      const patch: { name?: string; brandId?: string | null } = {};
      if (nameDirty) patch.name = nameTrimmed;

      if (fix === "brand" && (canSaveBrand || brandId !== undefined)) {
        let nextBrandId = brandId;
        if (nextBrandId === undefined && exactBrand) {
          nextBrandId = exactBrand.id;
        }
        if (nextBrandId === undefined && canCreateBrand) {
          const created = await adminApi.createBrand({ name: typedBrand });
          setBrands((prev) =>
            prev.some((b) => b.id === created.id)
              ? prev
              : [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
          );
          nextBrandId = created.id;
          setBrandId(created.id);
          setBrandQuery(created.name);
        }
        if (nextBrandId !== undefined) patch.brandId = nextBrandId;
      }

      if (patch.name === undefined && patch.brandId === undefined) return;
      await adminApi.updateOfferCatalog(offerId, patch);
      if (andNext) {
        const next = index >= 0 ? queue[index + 1] ?? queue[index - 1] : undefined;
        if (next && next.id !== offerId) goTo(next.id);
        else router.push("/admin/catalog/health");
      } else {
        const row = await adminApi.offer(offerId);
        setOffer(row);
        setNameDraft(row.name);
        if (row.canonicalProductId) {
          const linked = await adminApi.product(row.canonicalProductId);
          setProduct(linked);
        }
        setMsg("Salvo");
      }
    } catch (cause: unknown) {
      setMsg(
        cause instanceof ApiError
          ? cause.code ?? cause.message
          : cause instanceof Error
            ? cause.message
            : "Erro ao salvar",
      );
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <p className="text-sm text-[var(--ds-color-danger)]">
        {error}{" "}
        <Link href="/admin/catalog/health" className="underline">
          Voltar à fila
        </Link>
      </p>
    );
  }
  if (!offer) {
    return <p className="ds-meta">Carregando…</p>;
  }

  const offerPack = formatPack(offer.quantity, offer.unitNormalized ?? offer.unit);
  const canonPack = product ? formatPack(product.quantity, product.unit) : null;
  const prices = (product?.offers ?? []).map((o) => money(o.price)).filter((n): n is number => n != null);
  const markets = new Set((product?.offers ?? []).map((o) => o.supermarket.name));
  const compare = {
    name:
      !product || normBrand(nameDraft) === normBrand(product.canonicalName) ? ("ok" as const) : ("review" as const),
    unit: fix === "qty" || fix === "unit" ? ("fix" as const) : !product || offerPack === canonPack ? ("ok" as const) : ("review" as const),
    brand: fix === "brand" ? ("fix" as const) : offer.brandId || offer.brandRecord ? ("ok" as const) : ("review" as const),
  };

  return (
    <div>
      <OpsHeader
        crumb={
          <>
            <Link href="/admin/catalog/health" className="hover:underline">
              Catálogo
            </Link>
            {" / "}
            <Link href="/admin/catalog/health" className="hover:underline">
              Saúde
            </Link>
            {" / Fila de correção"}
          </>
        }
        title={FIX_TITLE[fix]}
        stamp={`${queue.length} pendentes`}
        primary={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/catalog/health" className="ds-btn ds-btn--outline">
              Voltar à fila
            </Link>
            <button
              type="button"
              className="ds-btn ds-btn--primary"
              disabled={busy || !canSave}
              onClick={() => void save(true)}
            >
              Salvar e próxima
            </button>
          </div>
        }
      />

      <section className="mb-4 overflow-hidden rounded-[14px] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--ds-color-border)] px-4 py-2">
          <p className="text-[12px] font-medium text-[var(--ds-color-muted-foreground)]">
            Mini-fila · {reason}
            {index >= 0 ? ` · ${index + 1}/${queue.length}` : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="ds-btn ds-btn--ghost"
              disabled={index <= 0}
              onClick={() => goTo(queue[index - 1]!.id)}
            >
              Anterior
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--ghost"
              disabled={index < 0 || index >= queue.length - 1}
              onClick={() => goTo(queue[index + 1]!.id)}
            >
              Próxima
            </button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto px-3 py-3">
          {strip.map((item) => {
            const current = item.id === offerId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(item.id)}
                className={`min-w-[180px] max-w-[220px] shrink-0 rounded-lg border px-3 py-2 text-left ${
                  current
                    ? "border-[var(--ds-color-foreground)] bg-[var(--ds-color-muted)]"
                    : "border-[var(--ds-color-border)] hover:bg-[var(--ds-color-muted)]"
                }`}
              >
                <p className="truncate text-[13px] font-medium">{item.name}</p>
                <p className="mt-0.5 text-[11px] text-[var(--ds-color-muted-foreground)]">
                  {reason} · {formatCurrency(money(item.price) ?? 0)}
                </p>
              </button>
            );
          })}
          {!strip.length ? (
            <p className="px-1 py-2 text-sm text-[var(--ds-color-muted-foreground)]">
              Item fora da fila atual (já corrigido ou filtro diferente).
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="ds-card space-y-3 p-4">
          <h2 className="text-[15px] font-semibold">Evidência da oferta</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="ds-label-caps">Nome</dt>
              <dd>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="ds-search mt-1 w-full font-medium"
                  aria-label="Nome do produto"
                  placeholder="Nome do produto…"
                />
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="ds-label-caps">Preço</dt>
                <dd className="font-mono">{formatCurrency(money(offer.price) ?? 0)}</dd>
              </div>
              <div>
                <dt className="ds-label-caps">Qtd</dt>
                <dd>{offerPack ?? "—"}</dd>
              </div>
            </div>
            <div>
              <dt className="ds-label-caps">Supermercado</dt>
              <dd>{offer.supermarket.name}</dd>
            </div>
            <div>
              <dt className="ds-label-caps">Página</dt>
              <dd>
                {offer.pageNumber ?? "—"}
                {offer.flyer?.id ? (
                  <>
                    {" · "}
                    <Link href={`/admin/flyers/${offer.flyer.id}`} className="hover:underline">
                      {offer.flyer.title ?? "encarte"}
                    </Link>
                  </>
                ) : null}
              </dd>
            </div>
          </dl>
          {offer.flyer?.id && offer.pageNumber ? (
            <a
              href={`/admin/flyers/${offer.flyer.id}`}
              className="block overflow-hidden rounded-lg border border-[var(--ds-color-border)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={flyerPageFileUrl(offer.flyer.id, offer.pageNumber)}
                alt={`Página ${offer.pageNumber} do encarte`}
                className="aspect-[3/4] w-full bg-[var(--ds-color-muted)] object-contain object-top"
              />
              <p className="px-2 py-1 text-[11px] text-[var(--ds-color-muted-foreground)]">
                Página {offer.pageNumber}
                {flyer?.pages?.length ? ` · ${flyer.pages.length} no encarte` : ""}
              </p>
            </a>
          ) : (
            <p className="text-sm text-[var(--ds-color-muted-foreground)]">
              Sem preview de página (oferta sem flyer/página).
            </p>
          )}
          {offer.rawText ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--ds-color-muted-foreground)]">Raw text</summary>
              <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-[12px] text-[var(--ds-color-muted-foreground)]">
                {offer.rawText}
              </p>
            </details>
          ) : null}
        </section>

        <section className="ds-card space-y-3 p-4">
          <h2 className="text-[15px] font-semibold">Produto canônico</h2>
          {product ? (
            <>
              <div>
                <p className="text-[18px] font-semibold leading-6">{product.canonicalName}</p>
                <p className="mt-1 text-sm text-[var(--ds-color-muted-foreground)]">
                  {[product.category, canonPack ?? "—", product.brand?.name ?? "Sem marca"]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-2">
                  <span className="ds-pill ds-pill--fail">{reason}</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[var(--ds-color-muted)] px-2 py-2">
                  <p className="text-[11px] text-[var(--ds-color-muted-foreground)]">Mercados</p>
                  <p className="font-semibold">{markets.size}</p>
                </div>
                <div className="rounded-lg bg-[var(--ds-color-muted)] px-2 py-2">
                  <p className="text-[11px] text-[var(--ds-color-muted-foreground)]">Preço</p>
                  <p className="font-mono text-[13px] font-semibold">
                    {prices.length ? formatCurrency(Math.min(...prices)) : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--ds-color-muted)] px-2 py-2">
                  <p className="text-[11px] text-[var(--ds-color-muted-foreground)]">Ofertas</p>
                  <p className="font-semibold">{product.offers.length}</p>
                </div>
              </div>
              <div className="space-y-1.5 border-t border-[var(--ds-color-border)] pt-3">
                <p className="ds-label-caps mb-1">Oferta vs canônico</p>
                <CompareRow label="Nome" status={compare.name} />
                <CompareRow label="Unidade" status={compare.unit} />
                <CompareRow label="Marca" status={compare.brand} />
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--ds-color-muted-foreground)]">
              Sem produto canônico vinculado. A correção vale na oferta; o match pode ser refeito depois.
            </p>
          )}
        </section>

        <section className="ds-card space-y-4 p-4">
          <h2 className="text-[15px] font-semibold">{FIX_ACTION[fix]}</h2>

          {fix === "brand" ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="ds-label-caps">Buscar marca</span>
                <input
                  value={brandQuery}
                  onChange={(e) => {
                    setBrandQuery(e.target.value);
                    setBrandId(undefined);
                  }}
                  placeholder="Digite o nome da marca…"
                  className="ds-search mt-1 w-full"
                />
              </label>
              {selectedBrandName ? (
                <p className="text-sm">
                  Selecionado: <span className="font-medium">{selectedBrandName}</span>
                </p>
              ) : null}
              {suggestions.length ? (
                <div>
                  <p className="ds-label-caps mb-1.5">Sugestões</p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`rounded-md border px-2.5 py-1 text-[12px] ${
                          brandId === s.id
                            ? "border-[var(--ds-color-foreground)] bg-[var(--ds-color-muted)]"
                            : "border-[var(--ds-color-border)]"
                        }`}
                        onClick={() => {
                          setBrandId(s.id);
                          setBrandQuery(s.name);
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <ul className="max-h-[200px] overflow-y-auto rounded-lg border border-[var(--ds-color-border)]">
                {filteredBrands.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--ds-color-muted)] ${
                        brandId === b.id ? "bg-[var(--ds-color-muted)]" : ""
                      }`}
                      onClick={() => {
                        setBrandId(b.id);
                        setBrandQuery(b.name);
                      }}
                    >
                      {b.name}
                    </button>
                  </li>
                ))}
                {!filteredBrands.length ? (
                  <li className="px-3 py-3 text-sm text-[var(--ds-color-muted-foreground)]">
                    Nenhuma marca cadastrada com esse nome.
                  </li>
                ) : null}
              </ul>
              {canCreateBrand ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-dashed border-[var(--ds-color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--ds-color-muted)]"
                  onClick={() => void save(false)}
                  disabled={busy}
                >
                  Criar marca «{typedBrand}» e usar
                </button>
              ) : null}
              <button
                type="button"
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                  brandId === null
                    ? "border-[var(--ds-color-foreground)] bg-[var(--ds-color-muted)]"
                    : "border-[var(--ds-color-border)]"
                }`}
                onClick={() => {
                  setBrandId(null);
                  setBrandQuery("");
                }}
              >
                Sem marca aplicável
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="ds-label-caps">Quantidade</span>
                <input value={offer.quantity ?? ""} readOnly className="ds-search mt-1 w-full" />
              </label>
              <label className="block text-sm">
                <span className="ds-label-caps">Unidade</span>
                <select value={offer.unitNormalized ?? offer.unit ?? ""} disabled className="ds-search mt-1 w-full">
                  <option value="">Selecionar…</option>
                  {PACK_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {fix === "brand" ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="ds-btn ds-btn--primary w-full"
                disabled={busy || !canSave}
                onClick={() => void save(true)}
              >
                {canCreateBrand ? "Criar, salvar e próxima" : "Salvar e próxima"}
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--outline w-full"
                disabled={busy || !canSave}
                onClick={() => void save(false)}
              >
                {canCreateBrand ? "Criar marca e salvar" : "Salvar"}
              </button>
            </div>
          ) : nameDirty ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="ds-btn ds-btn--primary w-full"
                disabled={busy || !canSave}
                onClick={() => void save(true)}
              >
                Salvar nome e próxima
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--outline w-full"
                disabled={busy || !canSave}
                onClick={() => void save(false)}
              >
                Salvar nome
              </button>
            </div>
          ) : null}
          {msg ? <p className="text-sm text-[var(--ds-color-muted-foreground)]">{msg}</p> : null}
        </section>
      </div>

      <details className="mt-4 rounded-[14px] border border-[var(--ds-color-border)] px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--ds-color-muted-foreground)]">
          Ações secundárias
        </summary>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {offer.canonicalProductId ? (
            <Link href={`/admin/products/${offer.canonicalProductId}`} className="hover:underline">
              Abrir hub completo
            </Link>
          ) : null}
          <Link href={`/admin/offers/${offer.id}`} className="hover:underline">
            Ver oferta completa / raw
          </Link>
        </div>
      </details>
    </div>
  );
}
