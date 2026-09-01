"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import {
  checkWorkerHealth,
  chooseSelectOption,
  clickSession,
  confirmSessionScope,
  createBrowserSession,
  clearSessionHover,
  hoverSession,
  locateSessionFlyers,
  pickSessionScope,
  removeSessionAction,
  saveBrowserSession,
  scrollSession,
  startBrowserWorker,
  startRecording,
  stopBrowserSession,
  stopRecording,
  subscribeSessionEvents,
  type LocateCandidate,
  type LocateFlyersResult,
  type ScopeBox,
  type ScopeNode,
  type SelectAtPoint,
  type SessionAction,
} from "@/lib/browser-session";

function locatePhase(sec: number): string {
  return `MiMo lendo HTML (${sec}s)`;
}

function formatLocateErr(err: unknown): string {
  return String(err instanceof Error ? err.message : err).replace(
    /^Error:\s*/,
    "",
  );
}

function overlayStyle(
  box: ScopeBox,
  img: HTMLImageElement | null,
  frame: { width: number; height: number },
): CSSProperties | null {
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

function nodeFromCandidate(c: LocateCandidate): ScopeNode | null {
  if (!c.box) return null;
  return {
    tagName: "DIV",
    selectors: c.selectors,
    label: c.label,
    box: c.box,
    linkCount: 0,
    imageCount: 0,
    textCount: 0,
    childCount: 0,
  };
}

export type WorkerSetupRecordHandle = {
  persist: () => Promise<number>;
  actions: SessionAction[];
  busy: boolean;
  canPersist: boolean;
  sessionId: string | null;
};

type Props = {
  flowId: string;
  startUrl: string;
  /** edit = Chromium-only worker step editor (Reanalisar + Salvar). */
  variant?: "setup" | "edit";
  flowVersion?: number;
  onError?: (msg: string | null) => void;
};

export const WorkerSetupRecord = forwardRef<WorkerSetupRecordHandle, Props>(
  function WorkerSetupRecord(
    { flowId, startUrl, variant = "setup", flowVersion, onError },
    ref,
  ) {
    const isEdit = variant === "edit";
    const [online, setOnline] = useState<boolean | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [status, setStatus] = useState("idle");
    const [currentUrl, setCurrentUrl] = useState(startUrl);
    const [frame, setFrame] = useState<string | null>(null);
    const [frameSize, setFrameSize] = useState({ width: 1280, height: 720 });
    const [actions, setActions] = useState<SessionAction[]>([]);
    const [busy, setBusy] = useState(false);
    const [locating, setLocating] = useState(false);
    const [locateSec, setLocateSec] = useState(0);
    const [proposedN, setProposedN] = useState<number | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [pick, setPick] = useState<ScopeNode | null>(null);
    const [locateSource, setLocateSource] = useState<
      "dump" | "mimo" | "heuristic" | null
    >(null);
    const [teach, setTeach] = useState<{
      awaitDetail: boolean;
      listingCount?: number;
      notes?: string;
      viewerMode?: string;
      openKind?: "download" | "viewer" | "need_click";
      itemSelectors?: string[];
    } | null>(null);
    const [locateStatus, setLocateStatus] = useState<
      "ready" | "need_click" | "not_found" | null
    >(null);
    const [candidates, setCandidates] = useState<LocateCandidate[]>([]);
    const [candIdx, setCandIdx] = useState(0);
    const [approved, setApproved] = useState(false);
    const [selectMode, setSelectMode] = useState(false);
    const [nativeSelect, setNativeSelect] = useState<SelectAtPoint | null>(
      null,
    );
    const [hoverBox, setHoverBox] = useState<ScopeBox | null>(null);
    const [scopeIndex, setScopeIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const unsubRef = useRef<(() => void) | null>(null);
    const sessionRef = useRef<string | null>(null);
    const statusRef = useRef("idle");
    const hoverAt = useRef(0);
    const booted = useRef(false);
    const lastDetectUrl = useRef("");
    const approvedRef = useRef(false);
    const selectModeRef = useRef(false);
    const openKindRef = useRef<"download" | "viewer" | "need_click" | null>(
      null,
    );

    sessionRef.current = sessionId;
    statusRef.current = status;
    approvedRef.current = approved;
    selectModeRef.current = selectMode;

    const fail = useCallback(
      (msg: string) => {
        setError(msg);
        onError?.(msg);
      },
      [onError],
    );

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
        const id = sessionRef.current;
        if (id) void stopBrowserSession(id);
      };
    }, []);

    useEffect(() => {
      if (!locating) {
        setLocateSec(0);
        return;
      }
      const t0 = Date.now();
      const id = setInterval(
        () => setLocateSec(Math.floor((Date.now() - t0) / 1000)),
        250,
      );
      return () => clearInterval(id);
    }, [locating]);

    useEffect(() => {
      const el = viewportRef.current;
      if (!el) return;
      let acc = 0;
      let raf = 0;
      const flush = () => {
        raf = 0;
        const dy = Math.round(acc);
        acc = 0;
        const id = sessionRef.current;
        if (!id || !dy) return;
        void scrollSession(id, dy).catch((err) => fail(String(err)));
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        acc += e.deltaY;
        if (!raf) raf = requestAnimationFrame(flush);
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        el.removeEventListener("wheel", onWheel);
        if (raf) cancelAnimationFrame(raf);
      };
    }, [fail]);

    const attachEvents = useCallback(
      (id: string) => {
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
            fail(ev.message);
          }
        });
      },
      [fail],
    );

    useEffect(() => {
      if (booted.current) return;
      booted.current = true;
      void (async () => {
        setBusy(true);
        setError(null);
        try {
          let ok = await checkWorkerHealth();
          if (!ok) {
            await startBrowserWorker();
            setOnline(true);
          } else {
            setOnline(true);
          }
          const s = await createBrowserSession({ flowId, startUrl });
          setSessionId(s.sessionId);
          setStatus(s.status);
          setCurrentUrl(s.currentUrl);
          setActions([]);
          attachEvents(s.sessionId);
          await startRecording(s.sessionId);
        } catch (err) {
          fail(String(err));
        } finally {
          setBusy(false);
        }
      })();
    }, [attachEvents, fail, flowId, startUrl]);

    const recording = status === "recording";
    const overlayBox = hoverBox ?? pick?.box ?? null;
    const overlay = overlayBox
      ? overlayStyle(overlayBox, imgRef.current, frameSize)
      : null;
    const canPersist =
      approved &&
      (teach?.openKind === "download" || teach?.openKind === "viewer");

    useImperativeHandle(
      ref,
      () => ({
        actions,
        busy,
        canPersist,
        persist: async () => {
          if (!approved) {
            throw new Error("Aprova a listagem antes de continuar.");
          }
          const id = sessionRef.current;
          if (!id) throw new Error("Sessão fechada.");
          if (statusRef.current === "recording") await stopRecording(id);
          const r = await saveBrowserSession(id);
          unsubRef.current?.();
          unsubRef.current = null;
          await stopBrowserSession(id);
          setSessionId(null);
          return r.steps;
        },
        sessionId,
      }),
      [actions, busy, canPersist, approved, sessionId],
    );

    async function toggleRecord() {
      if (!sessionId) return;
      setBusy(true);
      try {
        if (recording) await stopRecording(sessionId);
        else await startRecording(sessionId);
      } catch (err) {
        fail(String(err));
      } finally {
        setBusy(false);
      }
    }

    const detectListing = useCallback(
      async (sid: string) => {
        setLocating(true);
        setError(null);
        onError?.(null);
        setPick(null);
        setLocateSource(null);
        setLocateStatus(null);
        setCandidates([]);
        setCandIdx(0);
        setProposedN(null);
        setSelectMode(false);
        setApproved(false);
        try {
          const r: LocateFlyersResult = await locateSessionFlyers(sid);
          setPick(r.pick);
          setHoverBox(r.pick?.box ?? null);
          setScopeIndex(0);
          setLocateSource("mimo");
          setLocateStatus(r.status);
          const cands = r.candidates ?? [];
          setCandidates(cands);
          setCandIdx(0);
          setTeach({
            awaitDetail: r.awaitDetail,
            listingCount: r.listingCount,
            notes: r.humanHint,
            openKind: r.openKind,
            itemSelectors: r.itemSelectors,
          });
          openKindRef.current = r.openKind ?? null;
          if (r.stepCount) setProposedN(r.stepCount);
        } catch (err) {
          fail(formatLocateErr(err));
        } finally {
          setLocating(false);
        }
      },
      [fail, onError],
    );

    useEffect(() => {
      if (!sessionId || approvedRef.current || selectModeRef.current) return;
      if (lastDetectUrl.current === currentUrl) return;
      const t = setTimeout(() => {
        lastDetectUrl.current = currentUrl;
        void detectListing(sessionId);
      }, 1200);
      return () => clearTimeout(t);
    }, [sessionId, currentUrl, detectListing]);

    async function chooseCandidate(i: number) {
      const c = candidates[i];
      if (!c) return;
      setCandIdx(i);
      const n = nodeFromCandidate(c);
      if (n) {
        setPick(n);
        setHoverBox(n.box);
      }
      if (!sessionId || !c.selectors.length) return;
      try {
        const picked = await pickSessionScope(sessionId, {
          selectors: c.selectors,
          label: c.label,
        });
        setPick(picked);
        setHoverBox(picked.box);
        setScopeIndex(0);
      } catch (err) {
        fail(String(err));
      }
    }

    async function onConfirmArea() {
      if (!sessionId || !pick?.selectors?.length) return;
      setConfirming(true);
      setError(null);
      try {
        await confirmSessionScope(sessionId, {
          selectors: pick.selectors,
          label: pick.label,
          purpose: "flyer-discovery",
          metadata: {
            tagName: pick.tagName,
            id: pick.id,
            className: pick.className,
            textPreview: pick.textPreview,
            childCount: pick.childCount,
            linkCount: pick.linkCount,
            imageCount: pick.imageCount,
          },
        });
        setApproved(true);
      } catch (err) {
        fail(String(err));
      } finally {
        setConfirming(false);
      }
    }

    function dismissLocate() {
      setPick(null);
      setLocateSource(null);
      setLocateStatus(null);
      setHoverBox(null);
      setSelectMode(false);
      setApproved(false);
      if (sessionId) void clearSessionHover(sessionId);
    }

    function toggleSelect() {
      if (selectMode) {
        setSelectMode(false);
        setHoverBox(pick?.box ?? null);
        if (sessionId) void clearSessionHover(sessionId);
        return;
      }
      setSelectMode(true);
      setTeach(null);
    }

    function onPreviewMove(e: MouseEvent<HTMLImageElement>) {
      if (!selectMode || !sessionId || !imgRef.current) return;
      const now = Date.now();
      if (now - hoverAt.current < 100) return;
      hoverAt.current = now;
      const rect = imgRef.current.getBoundingClientRect();
      const x = Math.round(
        ((e.clientX - rect.left) / rect.width) * frameSize.width,
      );
      const y = Math.round(
        ((e.clientY - rect.top) / rect.height) * frameSize.height,
      );
      void hoverSession(sessionId, x, y).then((n) => {
        if (n?.box) setHoverBox(n.box);
      });
    }

    async function onPreviewClick(e: MouseEvent<HTMLImageElement>) {
      if (!sessionId || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const x = Math.round(
        ((e.clientX - rect.left) / rect.width) * frameSize.width,
      );
      const y = Math.round(
        ((e.clientY - rect.top) / rect.height) * frameSize.height,
      );
      try {
        if (selectMode) {
          const n = await pickSessionScope(sessionId, { x, y });
          setPick(n);
          setHoverBox(n.box);
          setScopeIndex(0);
          setLocateSource("heuristic");
          lastDetectUrl.current = "";
          void detectListing(sessionId);
          return;
        }
        const r = await clickSession(sessionId, x, y);
        if (r.select?.options.length) setNativeSelect(r.select);
        else setNativeSelect(null);
        if (r.viewer) {
          setTeach((t) => ({
            awaitDetail: false,
            listingCount: t?.listingCount,
            notes: r.viewer!.notes,
            viewerMode: r.viewer!.viewerMode,
            openKind: t?.openKind,
            itemSelectors: t?.itemSelectors,
          }));
        }
        if (openKindRef.current === "need_click") {
          lastDetectUrl.current = "";
          void detectListing(sessionId);
        }
      } catch (err) {
        fail(String(err));
      }
    }

    async function applyNativeSelect(opt: { value: string; label: string }) {
      if (!sessionId || !nativeSelect) return;
      try {
        await chooseSelectOption(sessionId, {
          selectors: nativeSelect.selectors,
          value: opt.value,
          label: opt.label,
        });
        setNativeSelect(null);
      } catch (err) {
        fail(String(err));
      }
    }

    async function climbContainer() {
      if (!sessionId || !pick?.ancestors?.length) return;
      const next = scopeIndex + 1;
      try {
        const n = await pickSessionScope(sessionId, { ancestorIndex: next });
        setPick(n);
        setHoverBox(n.box);
        setScopeIndex(next);
      } catch (err) {
        fail(String(err));
      }
    }

    async function removeAt(index: number) {
      if (!sessionId) return;
      try {
        await removeSessionAction(sessionId, index);
      } catch (err) {
        fail(String(err));
      }
    }

    return (
      <div className="ds-setup-split">
        <aside className="ds-setup-steps-panel">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  recording
                    ? "bg-[var(--ds-color-danger)]"
                    : "bg-[var(--ds-color-muted-foreground)]"
                }`}
              />
              <span className="text-sm font-semibold">
                {recording ? "Gravando" : "Parado"}
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--ds-color-muted-foreground)]">
              {actions.length} steps
              {flowVersion != null ? ` · v${flowVersion}` : ""}
            </span>
          </div>
          <p className="text-xs leading-4 text-[var(--ds-color-muted-foreground)]">
            {isEdit
              ? "MiMo lê o HTML da página e aponta a seção de encartes. Confere e Aprovar."
              : "MiMo aponta a seção inteira. Diz se tem download, viewer, ou se precisa clicar o encarte e Detectar de novo."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="ds-btn ds-btn--danger ds-btn--sm"
              disabled={!sessionId || busy || locating}
              onClick={() => void toggleRecord()}
            >
              {recording ? "Parar" : "Gravar"}
            </button>
            <button
              type="button"
              className={`ds-btn ds-btn--sm ${selectMode ? "ds-btn--primary" : "ds-btn--outline"}`}
              disabled={!sessionId || busy || locating}
              onClick={toggleSelect}
            >
              {selectMode ? "Cancelar seleção" : "Selecionar área"}
            </button>
            <button
              type="button"
              className="ds-btn ds-btn--primary ds-btn--sm flex-1"
              disabled={!sessionId || busy || locating || confirming}
              onClick={() => {
                lastDetectUrl.current = "";
                if (sessionId) void detectListing(sessionId);
              }}
            >
              {locating ? `MiMo ${locateSec}s` : "Detectar de novo"}
            </button>
          </div>
          {locating ? (
            <p className="text-xs text-[var(--ds-color-primary)]">
              {locatePhase(locateSec)}
            </p>
          ) : null}
          {selectMode ? (
            <p className="text-xs text-[var(--ds-color-primary)]">
              Clique no preview pra marcar a área. Dump lê HTML/CSS desse
              bloco.
            </p>
          ) : null}
          {approved ? (
            <p className="rounded-[var(--ds-radius-md)] border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-[13px] text-emerald-200">
              Listagem aprovada
              {teach?.listingCount != null
                ? ` · ${teach.listingCount} candidato(s)`
                : ""}
              .
              {teach?.viewerMode
                ? ` Viewer: ${teach.viewerMode}${teach.notes ? ` — ${teach.notes}` : ""}`
                : teach?.openKind === "download"
                  ? " Continuar pra testar o download das páginas."
                  : teach?.openKind === "viewer"
                    ? " Continuar pra colher as páginas já na página."
                    : " Próximo: clica UM card no preview pra mostrar o visualizador."}
            </p>
          ) : null}
          {candidates.length > 1 && locateSource === "heuristic" && !approved ? (
            <ul className="flex flex-col gap-1">
              {candidates.map((c, i) => (
                <li key={`${c.label}-${i}`}>
                  <button
                    type="button"
                    className={`w-full rounded-[var(--ds-radius-md)] border px-2 py-1.5 text-left ${
                      i === candIdx
                        ? "border-sky-700 bg-sky-950/50"
                        : "border-[var(--ds-color-border)] bg-[var(--ds-color-muted)]"
                    }`}
                    onClick={() => void chooseCandidate(i)}
                  >
                    <span className="mr-1.5 font-mono text-[10px] text-violet-300">
                      {i + 1}
                    </span>
                    <span className="text-[12px] font-medium">{c.label}</span>
                    {c.why ? (
                      <p className="truncate text-[11px] text-[var(--ds-color-muted-foreground)]">
                        {c.why}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!approved && locateStatus === "not_found" ? (
            <p className="rounded-[var(--ds-radius-md)] border border-amber-800 bg-amber-950/50 px-3 py-2 text-[13px] text-amber-200">
              {teach?.notes ??
                "Nada no dump. Role, fecha o modal, ou marca a área."}
            </p>
          ) : null}
          {!approved &&
          teach &&
          locateStatus !== "not_found" &&
          teach.notes ? (
            <p className="text-xs text-[var(--ds-color-success)]">
              {teach.notes}
            </p>
          ) : null}
          {pick && !approved ? (
            <div className="flex flex-col gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border)] bg-[var(--ds-color-muted)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">
                    {pick.label || pick.tagName}
                  </div>
                  <p className="truncate font-mono text-[10px] text-[var(--ds-color-muted-foreground)]">
                    {pick.selectors[0] ?? "—"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--ds-color-secondary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ds-color-primary)]">
                  {locateSource === "heuristic"
                    ? "manual"
                    : locateSource === "mimo"
                      ? "mimo"
                      : "auto"}
                </span>
              </div>
              <p className="text-[11px] text-[var(--ds-color-accent)]">
                {teach?.listingCount != null && teach.itemSelectors?.[0]
                  ? `Seção inteira. ${teach.listingCount} cards no padrão ${teach.itemSelectors[0]}.`
                  : "Seção de encartes."}
              </p>
              {teach?.openKind === "download" ? (
                <p className="text-[12px] font-medium text-emerald-300">
                  Download nesta página. Aprovar.
                </p>
              ) : null}
              {teach?.openKind === "viewer" ? (
                <p className="text-[12px] font-medium text-emerald-300">
                  Visualizador de imagem/PDF nesta página. Aprovar.
                </p>
              ) : null}
              {teach?.openKind === "need_click" ? (
                <p className="text-[12px] font-medium text-amber-200">
                  Nada pra baixar aqui. Clica UM encarte no preview — reanalisa
                  sozinho.
                </p>
              ) : null}
              <div className="flex gap-1.5">
                {pick.ancestors?.length ? (
                  <button
                    type="button"
                    className="ds-btn ds-btn--outline ds-btn--sm"
                    disabled={confirming}
                    onClick={() => void climbContainer()}
                  >
                    Subir
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ds-btn ds-btn--outline ds-btn--sm"
                  disabled={confirming}
                  onClick={dismissLocate}
                >
                  Não é isso
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn--primary ds-btn--sm flex-1"
                  disabled={confirming || !pick.selectors.length}
                  onClick={() => void onConfirmArea()}
                >
                  {confirming ? "Salvando…" : "Aprovar"}
                </button>
              </div>
            </div>
          ) : null}
          {nativeSelect ? (
            <div className="flex flex-col gap-1.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border)] bg-[var(--ds-color-muted)] px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold">
                  {nativeSelect.label}
                </p>
                <button
                  type="button"
                  className="text-[11px] text-[var(--ds-color-muted-foreground)]"
                  onClick={() => setNativeSelect(null)}
                >
                  Cancelar
                </button>
              </div>
              <p className="text-[11px] text-[var(--ds-color-muted-foreground)]">
                Select nativo — escolha aqui (lista não aparece no preview).
              </p>
              <ul className="flex max-h-40 flex-col gap-0.5 overflow-auto">
                {nativeSelect.options.map((o) => (
                  <li key={`${o.value}-${o.label}`}>
                    <button
                      type="button"
                      className="w-full truncate rounded px-2 py-1.5 text-left text-[12px] hover:bg-[var(--ds-color-card)]"
                      onClick={() => void applyNativeSelect(o)}
                    >
                      {o.label || o.value || "(vazio)"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <ol className="ds-setup-actions">
            {actions.map((a, i) => (
              <li
                key={`${i}-${a.kind}`}
                className={`ds-setup-action ${
                  i === actions.length - 1 && recording
                    ? "ds-setup-action--live"
                    : ""
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-[var(--ds-color-primary)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{a.kind}</span>
                      {i === actions.length - 1 && recording ? (
                        <span className="ds-setup-live">LIVE</span>
                      ) : null}
                    </div>
                    <div className="truncate font-mono text-[10px] text-[var(--ds-color-muted-foreground)]">
                      {a.description || a.value || a.url || a.semantic || "—"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-[11px] text-[var(--ds-color-muted-foreground)] hover:text-[var(--ds-color-danger)]"
                  disabled={busy}
                  onClick={() => void removeAt(i)}
                >
                  ✕
                </button>
              </li>
            ))}
            {actions.length === 0 ? (
              <li className="px-3 py-8 text-center text-xs text-[var(--ds-color-muted-foreground)]">
                {busy ? "Abrindo Chromium…" : "Nenhum step ainda"}
              </li>
            ) : null}
          </ol>
          {error && error !== teach?.notes ? (
            <p className="text-sm text-[var(--ds-color-danger)]">{error}</p>
          ) : null}
          {online === false ? (
            <p className="text-xs text-[var(--ds-color-danger)]">
              Worker browser offline — tentando subir…
            </p>
          ) : null}
        </aside>

        <div className="ds-setup-browser">
          <div className="ds-setup-chrome">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#E8A0A0]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#E8D48A]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#A8C9B4]" />
            </div>
            <div className="ds-setup-url">
              <span className="truncate font-mono text-[11px] text-[var(--ds-color-muted-foreground)]">
                {currentUrl || startUrl}
              </span>
            </div>
            {recording ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--ds-color-danger)]" />
                <span className="text-[11px] font-semibold text-[var(--ds-color-danger)]">
                  REC
                </span>
              </div>
            ) : null}
          </div>
          <div ref={viewportRef} className="ds-setup-viewport">
            {frame ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={frame}
                  alt="Preview Chromium"
                  className={`w-full ${selectMode ? "cursor-copy" : "cursor-crosshair"}`}
                  onClick={(e) => void onPreviewClick(e)}
                  onMouseMove={onPreviewMove}
                />
                {candidates.length === 0 && overlay ? (
                  <div style={overlay} />
                ) : null}
                {candidates.map((c, i) => {
                  if (!c.box) return null;
                  const st = overlayStyle(c.box, imgRef.current, frameSize);
                  if (!st) return null;
                  const on = i === candIdx;
                  return (
                    <div
                      key={`cand-${i}`}
                      style={{
                        ...st,
                        border: on ? "2px solid #38bdf8" : "2px dashed #c4b5fd",
                        background: on
                          ? "rgba(56,189,248,0.14)"
                          : "rgba(167,139,250,0.08)",
                        pointerEvents: "none",
                        zIndex: on ? 2 : 1,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          left: -1,
                          top: -1,
                          width: 16,
                          height: 16,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: on ? "#0284c7" : "#6d28d9",
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {i + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-[var(--ds-color-muted-foreground)]">
                {busy ? "Carregando página…" : "Preview"}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
);
