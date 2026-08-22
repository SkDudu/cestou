"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { ArrowRight } from "@phosphor-icons/react";
import { api } from "@convex/_generated/api";
import { useSession } from "@/components/SessionProvider";
import { Button, Field, Input, Select } from "@/components/ui";

const STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export default function OnboardingPage() {
  const { userId, ready } = useSession();
  const upsert = useMutation(api.clientLocation.upsertLocation);
  const router = useRouter();
  const [city, setCity] = useState("Fortaleza");
  const [state, setState] = useState("CE");
  const [neighborhood, setNeighborhood] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await upsert({
        userId,
        city,
        state,
        neighborhood: neighborhood || undefined,
      });
      router.replace("/mercados");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !userId) {
    return (
      <div className="grid min-h-[100dvh] place-items-center text-[var(--muted)]">
        Preparando sessão…
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-[100dvh] max-w-[1400px] grid-cols-1 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="flex flex-col justify-center border-b border-[var(--line)] px-8 py-14 lg:border-b-0 lg:border-r lg:px-16">
        <p className="font-mono text-[11px] font-bold tracking-[0.28em] text-[var(--amber)]">
          CESTOU
        </p>
        <h1 className="mt-6 max-w-[16ch] text-4xl font-semibold tracking-tighter md:text-5xl">
          Onde você costuma comprar?
        </h1>
        <p className="mt-4 max-w-[48ch] text-sm leading-relaxed text-[var(--muted)]">
          Cidade e estado bastam para filtrar supermercados e ofertas. GPS e
          mapa entram depois — o modelo de região já está pronto.
        </p>
      </section>

      <section className="flex items-center px-8 py-14 lg:px-16">
        <form onSubmit={onSubmit} className="w-full max-w-md space-y-5">
          <Field label="Cidade">
            <Input
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </Field>
          <Field label="Estado">
            <Select value={state} onChange={(e) => setState(e.target.value)}>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bairro" hint="Opcional">
            <Input
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Ex.: Aldeota"
            />
          </Field>
          {error ? <p className="text-sm text-[var(--alert)]">{error}</p> : null}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Salvando…" : "Continuar"}
            {!busy ? <ArrowRight size={16} weight="bold" aria-hidden /> : null}
          </Button>
        </form>
      </section>
    </div>
  );
}
