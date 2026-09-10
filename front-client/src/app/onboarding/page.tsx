"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GpsFix } from "@phosphor-icons/react";
import { Button, Field, Input, Select } from "@/components/ui";
import { clientApi } from "@/lib/api";

const STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [city, setCity] = useState("Fortaleza");
  const [state, setState] = useState("CE");
  const [neighborhood, setNeighborhood] = useState("");
  const [lat, setLat] = useState<number | undefined>();
  const [lng, setLng] = useState<number | undefined>();
  const [gpsHint, setGpsHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useGps() {
    if (!navigator.geolocation) {
      setGpsHint("Geolocalização indisponível neste navegador.");
      return;
    }
    setGpsHint("Obtendo posição…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsHint("Posição salva. Confirme cidade e estado.");
      },
      () => setGpsHint("Não foi possível obter a localização."),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await clientApi("/location", { method: "PUT", body: JSON.stringify({
        city,
        state,
        neighborhood: neighborhood || undefined,
        lat,
        lng,
      }) });
      router.replace("/mercados");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[100dvh] max-w-[1400px] grid-cols-1 bg-[var(--ds-color-muted)] lg:grid-cols-[0.95fr_1.05fr]">
      <section className="flex flex-col justify-center border-b border-[var(--ds-color-border)] bg-[var(--ds-color-background)] px-5 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-8 sm:py-14 lg:border-b-0 lg:border-r lg:px-16">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[13px] font-bold text-white"
            style={{ background: "var(--ds-color-harbor)" }}
          >
            C
          </span>
          <span className="text-sm font-medium">Cestou</span>
        </div>
        <h1 className="mt-6 max-w-[16ch] text-[32px] font-bold leading-9 tracking-[-0.04em] sm:mt-8 sm:text-[44px] sm:leading-[48px] md:text-5xl">
          Onde você costuma comprar?
        </h1>
        <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-[var(--ds-color-muted-foreground)] sm:mt-4">
          Cidade e estado filtram as filiais. GPS é opcional e só ordena por
          distância — sem mapa e sem endereço automático.
        </p>
      </section>

      <section className="flex items-center px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-14 lg:px-16">
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
          <Button type="button" variant="outline" className="w-full" onClick={useGps}>
            <GpsFix size={16} weight="bold" aria-hidden />
            Usar minha localização
          </Button>
          {gpsHint ? (
            <p className="text-xs text-[var(--ds-color-muted-foreground)]">
              {gpsHint}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>
          ) : null}
          <Button type="submit" disabled={busy} className="w-full ds-btn--lg">
            {busy ? "Salvando…" : "Continuar"}
            {!busy ? <ArrowRight size={16} weight="bold" aria-hidden /> : null}
          </Button>
        </form>
      </section>
    </div>
  );
}
