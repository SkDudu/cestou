"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkWorkerHealth,
  clearSessionHover,
  clickSession,
  confirmSessionScope,
  createBrowserSession,
  hoverSession,
  locateSessionFlyers,
  pickSessionScope,
  probeSessionScope,
  saveBrowserSession,
  scrollSession,
  startBrowserWorker,
  startRecording,
  stopBrowserSession,
  stopRecording,
  subscribeSessionEvents,
  typeSession,
  type ProbeResult,
  type ScopeBox,
  type ScopeNode,
  type SessionAction,
} from "@/lib/browser-session";
import { WorkerStartButton } from "@/components/admin/WorkerStartButton";

type Props = {
  flowId: string;
  startUrl: string;
  onSaved?: () => void;
};

function previewPoint(
  e: React.MouseEvent<HTMLElement>,
  img: HTMLImageElement,
  frame: { width: number; height: number },
) {
  const rect = img.getBoundingClientRect();
  const x = Math.round(((e.clientX - rect.left) / rect.width) * frame.width);
  const y = Math.round(((e.clientY - rect.top) / rect.height) * frame.height);
  return { x, y };
}

function overlayStyle(
  box: ScopeBox,
  img: HTMLImageElement | null,
  frame: { width: number; height: number },
): React.CSSProperties | null {
  if (!img) return null;
  const rect = img.getBoundingClientRect();
  const sx = rect.width / frame.width;
  const sy = rect.height / frame.height;
  return {
    position: "absolute",
    left: box.x * sx,
    top: box.y * sy,
    width: box.width * sx,
    height: box.height * sy,
    border: "2px solid #38bdf8",
    background: "rgba(56,189,248,0.12)",
    pointerEvents: "none",
  };
}

export function BrowserSessionPanel({ flowId, startUrl, onSaved }: Props) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [currentUrl, setCurrentUrl] = useState(startUrl);
  const [frame, setFrame] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 1280, height: 720 });
  const [actions, setActions] = useState<SessionAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [typeBuf, setTypeBuf] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [hoverBox, setHoverBox] = useState<ScopeBox | null>(null);
  const [picked, setPicked] = useState<ScopeNode | null>(null);
  const [scopeIndex, setScopeIndex] = useState(0);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateSource, setLocateSource] = useState<"mimo" | "heuristic" | null>(
    null,
  );
  const imgRef = useRef<HTMLImageElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const hoverAt = useRef(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const ok = await checkWorkerHealth();
      if (alive) setOnline(ok);
    };
    void tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    return () => {
      unsubRef.current?.();
      if (sessionId) void stopBrowserSession(sessionId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachEvents = useCallback((id: string) => {
    unsubRef.current?.();
    unsubRef.current = subscribeSessionEvents(id, (ev) => {
      if (ev.type === "frame") {
        setFrame(`data:image/jpeg;base64,${ev.jpegBase64}`);
        setFrameSize({ width: ev.width, height: ev.height });
      } else if (ev.type === "url") {
        setCurrentUrl(ev.url);
      } else if (ev.type === "status") {
        setStatus(ev.status);
      } else if (ev.type === "actions") {
        setActions(ev.actions);
      } else if (ev.type === "action") {
        setActions((prev) => [...prev, ev.action]);
      } else if (ev.type === "error") {
        setError(ev.message);
      }
    });
  }, []);

  async function openBrowser() {
    setError(null);
    setBusy(true);
    try {
      if (!online) {
        await startBrowserWorker();
        setOnline(true);
      }
      const s = await createBrowserSession({ flowId, startUrl });
      setSessionId(s.sessionId);
      setStatus(s.status);
      setCurrentUrl(s.currentUrl);
      setActions([]);
      attachEvents(s.sessionId);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function closeBrowser() {
    if (!sessionId) return;
    setBusy(true);
    try {
      unsubRef.current?.();
      unsubRef.current = null;
      await stopBrowserSession(sessionId);
      setSessionId(null);
      setStatus("closed");
      setFrame(null);
      setSelectMode(false);
      setPicked(null);
      setProbe(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecord() {
    if (!sessionId) return;
    setBusy(true);
    try {
      if (status === "recording") await stopRecording(sessionId);
      else await startRecording(sessionId);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await saveBrowserSession(sessionId);
      onSaved?.();
      alert(`Salvos ${r.steps} steps`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function exitSelect() {
    setSelectMode(false);
    setHoverBox(null);
    setPicked(null);
    setProbe(null);
    setScopeIndex(0);
    setLocateSource(null);
    if (sessionId) void clearSessionHover(sessionId);
  }

  function onPreviewMove(e: React.MouseEvent<HTMLImageElement>) {
    if (!selectMode || !sessionId || !imgRef.current) return;
    const now = Date.now();
    if (now - hoverAt.current < 100) return;
    hoverAt.current = now;
    const { x, y } = previewPoint(e, imgRef.current, frameSize);
    void hoverSession(sessionId, x, y).then((n) => {
      if (n?.box) setHoverBox(n.box);
    });
  }

  async function onPreviewClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!sessionId || !imgRef.current) return;
    const { x, y } = previewPoint(e, imgRef.current, frameSize);
    if (selectMode) {
      try {
        const n = await pickSessionScope(sessionId, { x, y });
        setPicked(n);
        setHoverBox(n.box);
        setScopeIndex(0);
        setProbe(null);
        setLocateSource(null);
      } catch (err) {
        setError(String(err));
      }
      return;
    }
    void clickSession(sessionId, x, y).catch((err) => setError(String(err)));
  }

  async function climbContainer() {
    if (!sessionId || !picked?.ancestors?.length) return;
    const next = scopeIndex + 1;
    try {
      const n = await pickSessionScope(sessionId, { ancestorIndex: next });
      setPicked(n);
      setHoverBox(n.box);
      setScopeIndex(next);
      setProbe(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function runLocate() {
    if (!sessionId) return;
    setLocating(true);
    setError(null);
    try {
      const r = await locateSessionFlyers(sessionId);
      setSelectMode(true);
      setPicked(r.pick);
      setHoverBox(r.pick.box);
      setScopeIndex(0);
      setProbe(r.probe);
      setLocateSource(r.source);
    } catch (err) {
      setError(String(err));
    } finally {
      setLocating(false);
    }
  }

  async function runProbe() {
    if (!sessionId || !picked?.selectors?.length) return;
    setProbing(true);
    setError(null);
    try {
      const r = await probeSessionScope(sessionId, picked.selectors);
      setProbe(r);
    } catch (err) {
      setError(String(err));
    } finally {
      setProbing(false);
    }
  }

  async function confirmArea() {
    if (!sessionId || !picked?.selectors?.length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await confirmSessionScope(sessionId, {
        selectors: picked.selectors,
        label: picked.label,
        purpose: "flyer-discovery",
        metadata: {
          tagName: picked.tagName,
          id: picked.id,
          className: picked.className,
          textPreview: picked.textPreview,
          childCount: picked.childCount,
          linkCount: picked.linkCount,
          imageCount: picked.imageCount,
        },
      });
      onSaved?.();
      setSelectMode(false);
      alert(`Área salva · ${r.steps} steps`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const recording = status === "recording";
  const overlay = hoverBox
    ? overlayStyle(hoverBox, imgRef.current, frameSize)
    : null;

  return (
    <section className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-zinc-200">Sessão do browser</h2>
        <span
          className={`text-xs ${online ? "text-emerald-400" : "text-rose-400"}`}
        >
          {online === null
            ? "…"
            : online
              ? "● Worker online"
              : "● Worker offline"}
        </span>
        {sessionId ? (
          <span className="text-xs text-zinc-500">{sessionId}</span>
        ) : null}
        {recording ? (
          <span className="rounded border border-rose-800 bg-rose-950 px-2 py-0.5 text-xs text-rose-300">
            GRAVANDO
          </span>
        ) : null}
        {selectMode ? (
          <span className="rounded border border-sky-800 bg-sky-950 px-2 py-0.5 text-xs text-sky-300">
            🔵 Modo de seleção ativo
          </span>
        ) : null}
      </div>

      {online === false ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm text-amber-300">
            Worker offline — inicie aqui para gravar os steps.
          </p>
          <WorkerStartButton onStarted={() => setOnline(true)} />
        </div>
      ) : null}

      <p className="mb-3 truncate text-xs text-zinc-500">
        URL: {currentUrl}
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || Boolean(sessionId)}
          onClick={() => void openBrowser()}
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-40"
        >
          {busy && !sessionId ? "Abrindo…" : "Abrir navegador"}
        </button>
        <button
          type="button"
          disabled={!sessionId || busy}
          onClick={() => void toggleRecord()}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
        >
          {recording ? "Parar gravação" : "Iniciar gravação"}
        </button>
        <button
          type="button"
          disabled={!sessionId || busy}
          onClick={() => {
            if (selectMode) void exitSelect();
            else {
              setSelectMode(true);
              setPicked(null);
              setProbe(null);
            }
          }}
          className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 ${
            selectMode
              ? "border-sky-700 bg-sky-950 text-sky-200"
              : "border-sky-800 text-sky-300 hover:bg-sky-950"
          }`}
        >
          {selectMode ? "Cancelar seleção" : "Selecionar Área"}
        </button>
        <button
          type="button"
          disabled={!sessionId || busy || locating}
          onClick={() => void runLocate()}
          className="rounded-md border border-violet-800 px-3 py-1.5 text-sm text-violet-300 hover:bg-violet-950 disabled:opacity-40"
        >
          {locating ? "MiMo analisando…" : "Detectar flyers (MiMo)"}
        </button>
        <button
          type="button"
          disabled={!sessionId || busy}
          onClick={() => void onSave()}
          className="rounded-md border border-emerald-800 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-950 disabled:opacity-40"
        >
          Salvar steps
        </button>
        <button
          type="button"
          disabled={!sessionId || busy}
          onClick={() => void closeBrowser()}
          className="rounded-md border border-rose-900 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-950 disabled:opacity-40"
        >
          Fechar sessão
        </button>
      </div>

      {selectMode ? (
        <p className="mb-3 text-xs text-sky-300">
          Passe o mouse sobre uma área. Clique para selecionar.
        </p>
      ) : null}

      {picked ? (
        <div className="mb-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
          <div className="mb-2 font-medium text-zinc-100">
            Área selecionada · {picked.tagName}
          </div>
          <div className="mb-2 grid grid-cols-2 gap-1 text-zinc-400 sm:grid-cols-4">
            <span>Links: {picked.linkCount}</span>
            <span>Imagens: {picked.imageCount}</span>
            <span>Textos: {picked.textCount}</span>
            <span>Filhos: {picked.childCount}</span>
          </div>
          {picked.className ? (
            <p className="mb-2 truncate text-zinc-500">{picked.className}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!picked.ancestors?.length}
              onClick={() => void climbContainer()}
              className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-200 disabled:opacity-40"
            >
              ↑ Selecionar container
            </button>
            <button
              type="button"
              disabled={probing}
              onClick={() => void runProbe()}
              className="rounded-md border border-sky-800 px-2 py-1 text-sky-300 disabled:opacity-40"
            >
              {probing ? "Analisando área…" : "Discover Flyers"}
            </button>
            <button
              type="button"
              disabled
              className="rounded-md border border-zinc-800 px-2 py-1 text-zinc-600"
              title="Reservado"
            >
              Discover Stores
            </button>
            <button
              type="button"
              disabled
              className="rounded-md border border-zinc-800 px-2 py-1 text-zinc-600"
            >
              Discover Products
            </button>
            <button
              type="button"
              disabled
              className="rounded-md border border-zinc-800 px-2 py-1 text-zinc-600"
            >
              Discover Offers
            </button>
          </div>
        </div>
      ) : null}

      {probe ? (
        <div className="mb-3 rounded-md border border-zinc-800 p-3">
          {probe.found && probe.flyers.length > 0 ? (
            <>
              <p className="mb-2 text-xs text-emerald-400">
                ✓ Área encontrada · Flyers: {probe.flyers.length}
                {locateSource
                  ? ` · ${locateSource === "mimo" ? "MiMo" : "heurística"}`
                  : ""}
              </p>
              <div className="mb-3 grid gap-2 sm:grid-cols-2">
                {probe.flyers.map((f) => (
                  <div
                    key={f.url}
                    className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
                  >
                    <div className="font-medium text-zinc-100">
                      {f.title || "Flyer"}
                    </div>
                    <div className="text-zinc-500">
                      {f.validFrom && f.validUntil
                        ? `${f.validFrom} → ${f.validUntil}`
                        : f.kind.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmArea()}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
              >
                Confirmar área
              </button>
            </>
          ) : (
            <div className="text-xs text-amber-300">
              <p className="mb-2 font-medium">
                {probe.error ?? "Nenhum flyer encontrado."}
              </p>
              <ul className="mb-2 list-disc pl-4 text-zinc-400">
                <li>A área selecionada não contém flyers</li>
                <li>Conteúdo lazy / precisa scroll</li>
                <li>Flyer só na API — tente ↑ container</li>
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPicked(null);
                    setProbe(null);
                    setHoverBox(null);
                  }}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-200"
                >
                  Selecionar outra área
                </button>
                <button
                  type="button"
                  onClick={() => void runProbe()}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-zinc-200"
                >
                  Reanalisar
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!sessionId}
          onClick={() => {
            setSelectMode(true);
            setPicked(null);
            setProbe(null);
          }}
          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 disabled:opacity-40"
        >
          + Discover Flyer
        </button>
        <button
          type="button"
          disabled
          className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-600"
        >
          + Discover Store
        </button>
        <button
          type="button"
          disabled={!sessionId}
          onClick={() =>
            sessionId &&
            void scrollSession(sessionId, 500).catch((e) => setError(String(e)))
          }
          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 disabled:opacity-40"
        >
          Scroll ↓
        </button>
        <input
          value={typeBuf}
          onChange={(e) => setTypeBuf(e.target.value)}
          placeholder="Digitar no foco…"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
        />
        <button
          type="button"
          disabled={!sessionId || !typeBuf}
          onClick={() => {
            if (!sessionId) return;
            void typeSession(sessionId, typeBuf)
              .then(() => setTypeBuf(""))
              .catch((e) => setError(String(e)));
          }}
          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 disabled:opacity-40"
        >
          Enviar texto
        </button>
      </div>

      {error ? <p className="mb-3 text-sm text-rose-400">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-black">
          {frame ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={frame}
                alt="Browser preview"
                className="w-full cursor-crosshair"
                onClick={(e) => void onPreviewClick(e)}
                onMouseMove={onPreviewMove}
              />
              {selectMode && overlay ? <div style={overlay} /> : null}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-zinc-600">
              Preview (abra o navegador)
            </div>
          )}
          <p className="border-t border-zinc-800 px-2 py-1 text-[10px] text-zinc-600">
            Clique no preview = click no Playwright. Em Selecionar Área, o
            clique só marca o container.
          </p>
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-md border border-zinc-800">
          <div className="border-b border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs uppercase text-zinc-500">
            Steps ao vivo ({actions.length})
          </div>
          <ol className="space-y-1 p-2 text-sm text-zinc-300">
            {actions.map((a, i) => (
              <li
                key={`${i}-${a.kind}-${a.description}`}
                className="rounded bg-zinc-950/60 px-2 py-1.5 text-xs"
              >
                <span className="text-zinc-500">{i + 1}. </span>
                <span className="font-medium text-zinc-100">{a.kind}</span>
                {a.semantic ? (
                  <span className="text-sky-400"> · {a.semantic}</span>
                ) : null}
                <div className="truncate text-zinc-500">
                  {a.description || a.value || a.url || "—"}
                </div>
              </li>
            ))}
            {actions.length === 0 ? (
              <li className="px-2 py-6 text-center text-zinc-600">
                Nenhuma ação ainda
              </li>
            ) : null}
          </ol>
        </div>
      </div>
    </section>
  );
}
