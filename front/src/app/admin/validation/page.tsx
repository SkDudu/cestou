import { Suspense } from "react";
import ValidationPage from "./ValidationPageClient";

export default function ValidationRoute() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
      <ValidationPage />
    </Suspense>
  );
}
