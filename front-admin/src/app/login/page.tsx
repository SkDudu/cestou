"use client";

import { Suspense, type FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, adminApi } from "@/lib/api";

function nextPath(raw: string | null) {
  if (raw?.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/admin";
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="ds-meta grid min-h-dvh place-items-center">Carregando…</p>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = nextPath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    void adminApi.me().then(
      () => alive && router.replace(next),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [next, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await adminApi.login(email, password);
      router.replace(next);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? "E-mail ou senha inválidos."
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--ds-color-muted)] px-6 text-[var(--ds-color-foreground)]">
      <form onSubmit={submit} className="ds-card w-full max-w-sm gap-5 !p-8">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[13px] font-bold text-white"
            style={{ background: "var(--ds-color-harbor)" }}
          >
            C
          </span>
          <span className="text-sm font-medium">Cestou Ops</span>
        </div>
        <div>
          <p className="ds-label-caps">Acesso</p>
          <h1 className="mt-1 text-2xl font-semibold">Entrar</h1>
          <p className="mt-1 text-sm text-[var(--ds-color-muted-foreground)]">
            Painel de extração de encartes e ofertas
          </p>
        </div>
        <label className="block text-sm">
          <span className="ds-label-caps">E-mail</span>
          <input
            id="email"
            name="email"
            required
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="ds-input mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="ds-label-caps">Senha</span>
          <input
            id="password"
            name="password"
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="ds-input mt-1"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-[var(--ds-color-danger)]">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={submitting} className="ds-btn ds-btn--primary w-full disabled:opacity-60">
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
