"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { withBrowserSession } from "@/lib/constructor-browser-session";
import { Plus, Check, Info, ChevronDown, RotateCcw, ShieldCheck, AlertCircle, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { api, ApiError } from "@/lib/http";
import Image from "next/image";
import branding from "@/branding.json";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { cents, fresh, money, toDraft, validate, type Draft, type Expense, type Errors } from "@/lib/domain";
declare global { interface Window { constructorTrack?: (event: string) => void; } }
type List = { expenses: Expense[]; count: number; totalCents: string };
type Attempt = { endpoint: string; payload: Record<string, unknown>; draft: Draft; kind: "save" | "delete"; concept: string };
type Modal = { title: string; description: string; target?: {concept: string; amount: string}; action: string; confirm: () => void; danger?: boolean };
const labels: Record<keyof Draft, string> = { concept: "Concepto", category: "Categoría", date: "Fecha", amount: "Importe (COP)" };
const amountGuidance = "Usa punto o coma decimal, sin separadores de miles. Hasta 2 decimales.";
function comparisonValue(value: Draft, key: keyof Draft) {
  if (key === "amount") { try { return `${money(cents(value.amount).toString())} COP`; } catch { /* Keep invalid draft input visible. */ } }
  return value[key] || "Sin completar";
}
export default function Home() {
  const [catalog, setCatalog] = useState<string[]>([]), [list, setList] = useState<List | null>(null), [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [confirmedFilter, setConfirmedFilter] = useState(""), [originalSaved, setOriginalSaved] = useState(false);
  const [draft, setDraft] = useState<Draft>({ concept: "", category: "", date: "", amount: "" }), [base, setBase] = useState<Draft>(draft), [selected, setSelected] = useState<Expense | null>(null);
  const [errors, setErrors] = useState<Errors>({}), [pending, setPending] = useState(false), [notice, setNotice] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]), [separate, setSeparate] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState(false);
  const [conflict, setConflict] = useState<{ current: Expense | null; deleting: boolean } | null>(null);
  const [modal, setModal] = useState<Modal | null>(null), [marker, setMarker] = useState(0);
  const editor = useRef<HTMLHeadingElement>(null), listTitle = useRef<HTMLHeadingElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  const modalAction = useRef<(() => void) | null>(null);
  const deletionFocus = useRef<{ id: string | null } | null>(null);
  const filterRef = useRef(filter), request = useRef(0), draftRef = useRef(draft);
  const conceptInput = useRef<HTMLTextAreaElement>(null);
  const resizeConcept = useCallback(() => {
    const field = conceptInput.current;
    if (field) { field.style.height = "auto"; field.style.height = `${field.scrollHeight + 2}px`; }
  }, []);
  useLayoutEffect(resizeConcept, [draft.concept, resizeConcept]);
  useEffect(() => {
    const field = conceptInput.current;
    if (!field) return;
    let width = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width) { width = entry.contentRect.width; resizeConcept(); }
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [resizeConcept]);
  useEffect(() => { draftRef.current = draft; filterRef.current = filter; }, [draft, filter]);
  const dirty = JSON.stringify(base) !== JSON.stringify(draft);
  const load = useCallback(async (category: string, session = false) => {
    const seq = ++request.current;
    setLoading(true); setLoadError("");
    try {
      if (session) { await withBrowserSession(()=>api("/api/session", {})); const cats = await api("/api/categories"); setCatalog(cats.categories.map((c: { name: string }) => c.name)); }
      const data = await api(`/api/gastos?categoria=${encodeURIComponent(category)}`);
      if (seq === request.current) { setList(data); setConfirmedFilter(category); setLoading(false); }
      return data as List;
    } catch (e) {
      if (seq === request.current) { setLoading(false); setLoadError(e instanceof ApiError && e.status === 401 ? e.message : "No pudimos actualizar tus gastos. La información anterior sigue visible hasta comprobarla."); }
      throw e;
    }
  }, []);
  useEffect(() => { let active = true; queueMicrotask(() => { if (!active) return; const initial = fresh(); setDraft(initial); setBase(initial); load("", true).catch(() => {}); }); return () => { active = false; }; }, [load]);
  useEffect(() => { if (attempts.length) requestAnimationFrame(() => { const region = document.getElementById("uncertain-title"); region?.focus(); region?.scrollIntoView({ block: "start" }); }); }, [attempts.length]);
  useEffect(() => { if (conflict) requestAnimationFrame(() => document.getElementById("comparison-title")?.focus()); }, [conflict]);
  useEffect(() => { if (loadError) requestAnimationFrame(() => document.getElementById("read-error")?.focus()); }, [loadError]);
  useLayoutEffect(() => {
    if (pending || !deletionFocus.current) return;
    const { id } = deletionFocus.current;
    deletionFocus.current = null;
    // Restore context after React has removed the row and enabled its neighbors.
    const next = id ? document.querySelector<HTMLButtonElement>(`[data-edit="${id}"]`) : null;
    if (next && !next.disabled) next.focus();
    else listTitle.current?.focus();
  }, [pending, list]);
  const focusEditor = () => requestAnimationFrame(() => editor.current?.focus());
  const reviewConflict = () => document.getElementById("comparison-title")?.focus();
  function reset(moveFocus = true) { const d = fresh(); setSelected(null); setDraft(d); setBase(d); setErrors({}); setConflict(null); setNotice(""); setOriginalSaved(false); setRecoveryDraft(false); if (moveFocus) focusEditor(); }
  function openModal(m: Modal) { modalAction.current = null; returnFocus.current = document.activeElement as HTMLElement; setModal(m); }
  function transition(action: () => void) {
    if (pending || (attempts.length && !separate)) return;
    if (dirty) openModal({ title: "¿Descartar los cambios?", description: "Los cambios de este borrador no se han enviado. Puedes volver y seguir editando.", action: "Descartar cambios", confirm: action });
    else action();
  }
  function edit(e: Expense) { transition(() => { setSelected(e); const d = toDraft(e); setDraft(d); setBase(d); setErrors({}); setNotice(""); setOriginalSaved(false); setRecoveryDraft(false); setConflict(null); setMarker(m => m + 1); focusEditor(); }); }
  function invalid(err: Errors) { setErrors(err); setNotice(""); const key = Object.keys(err)[0]; requestAnimationFrame(() => { document.getElementById(key)?.focus(); document.querySelector(".validation")?.scrollIntoView({ block: "start" }); }); }
  function change(k: keyof Draft, value: string) { setDraft(d => ({ ...d, [k]: value })); setNotice(""); }
  async function send(attempt: Attempt) {
    setPending(true); setNotice(""); setOriginalSaved(false); setErrors({});
    try {
      const result = await api(attempt.endpoint, attempt.payload);
      // A confirmed mutation stays confirmed even if its following read fails.
      let latest: List | null = null;
      try { latest = await load(filterRef.current); } catch { /* load retains the confirmed snapshot and exposes retry */ }
      setAttempts(a => a.filter(v => v.payload.key !== attempt.payload.key)); setSeparate(false); setConflict(null);
      if (attempt.kind === "delete") {
        if (selected?.id === result.deleted) reset(false);
        setNotice(`Gasto eliminado: ${attempt.concept}.`);
        const deletedIndex = Math.max(0, list?.expenses.findIndex(e => e.id === result.deleted) ?? 0);
        deletionFocus.current = { id: latest?.expenses[Math.min(deletedIndex, latest.expenses.length - 1)]?.id ?? null };
      } else {
        const changed = JSON.stringify(draftRef.current) !== JSON.stringify(attempt.draft);
        const saved = result.expense as Expense;
        let current = latest?.expenses.find(e => e.id === saved.id);
        let noLongerAvailable = false;
        if (latest && !current) {
          try { current = (await api(`/api/gastos/${saved.id}`)).expense; }
          catch (error) { if (error instanceof ApiError && error.status === 404) noLongerAvailable = true; }
        }
        setSelected(saved); setBase(toDraft(saved)); if (!changed) setDraft(toDraft(saved));
        if (noLongerAvailable || (current && current.version !== saved.version)) setConflict({ current: current || null, deleting: false });
        setOriginalSaved(changed);
        // Keep the recovered draft's editing space until it is saved or dismissed.
        setRecoveryDraft(changed && (attempts.length > 0 || recoveryDraft));
        setNotice(changed ? "" : `Gasto guardado.${filterRef.current && saved.category !== filterRef.current ? " Este gasto está fuera del filtro actual." : ""}`);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        setAttempts(a => a.filter(v => v.payload.key !== attempt.payload.key));
        if (e.status === 400 && e.data.errors) invalid(e.data.errors as Errors);
        else if (e.status === 409 || e.status === 404) setConflict({ current: e.data.current as Expense || null, deleting: attempt.kind === "delete" });
        else setNotice(e.message);
      } else { setAttempts(a => a.some(v => v.payload.key === attempt.payload.key) ? a : [...a, attempt]); setSeparate(false); }
    } finally { setPending(false); }
  }
  function save(version?: number) {
    const err = validate(draft); if (Object.keys(err).length) { invalid(err); return; }

    const attempt: Attempt = { endpoint: selected ? `/api/gastos/${selected.id}/editar` : "/api/gastos", payload: { ...draft, amountCents: cents(draft.amount).toString(), key: crypto.randomUUID(), ...(selected ? { expectedVersion: version || selected.version } : {}) }, draft: { ...draft }, kind: "save", concept: draft.concept };
    send(attempt);
  }
  function remove(e: Expense) {
    openModal({ title: "¿Eliminar este gasto?", description: "Esta acción elimina el registro.", target: {concept: e.concept, amount: money(e.amountCents) + " COP"}, action: "Eliminar gasto", danger: true, confirm: () => send({ endpoint: `/api/gastos/${e.id}/eliminar`, payload: { key: crypto.randomUUID(), expectedVersion: e.version }, draft: { ...draft }, kind: "delete", concept: e.concept }) });
  }
  const disabled = pending || !list;
  const blockedDraft = !separate && attempts.some(attempt => JSON.stringify(attempt.draft) !== JSON.stringify(draft));
  const confirmed = notice.startsWith("Gasto guardado") && !dirty && !pending && !conflict && !attempts.length;
  const reconciling = !!(conflict || attempts.length || recoveryDraft);
  const expandedEditor = reconciling || (selected?.concept.length ?? 0) > 60;
  const emptyWorkspace = !!list && !list.count && !confirmedFilter && !selected && !reconciling;
  const saveLabel = pending ? "Guardando…" : conflict ? "Revisar cambios" : selected ? "Guardar cambios" : "Guardar gasto";
  const saveDisabled = disabled || (!!attempts.length && !separate);
  const saveClass = pending ? " disabled:opacity-100" : "";
  const outOfFilter = selected && filter && selected.category !== filter;
  const viewAll = () => { setFilter(""); document.getElementById("filter")?.focus(); load("").catch(() => {}); };
  const viewAllFromList = async () => {
    setFilter("");
    try {
      await load("");
      requestAnimationFrame(() => {
        listTitle.current?.focus({ preventScroll: true });
        listTitle.current?.scrollIntoView({ block: "start", behavior: "instant" });
      });
    } catch { /* The read-error region receives focus and offers retry. */ }
  };
  return <>
    <header className="masthead"><div className="header-inner"><Link className="brand" href="/" aria-label={`${branding.logoText}, inicio`}><Image unoptimized data-brand-logo src={branding.logoImageUrl || "/brand-mark.svg"} width="36" height="36" alt="" /><span>{branding.logoText}</span></Link><span className="session-status"><ShieldCheck size={16} /> Tu espacio privado</span></div></header>
    <main className={`workspace ${expandedEditor ? "expanded-editor" : ""} ${emptyWorkspace ? "empty-workspace" : ""}`}>
      <h1 className="sr-only">Registro de gastos en COP</h1>
      <section className={`summary ${!list ? "unknown" : money(list.totalCents).length > 14 ? "large-total" : ""}`} aria-label="Resumen de gastos" aria-busy={loading}>
        <div className="summary-figures">
          <div className="total"><span className="label">Total filtrado</span><div><strong data-total>{list ? money(list.totalCents) : "—"}</strong><span className="currency">COP</span></div></div>
          <a className="count" href="#list-title" aria-label={`Ver Tus gastos: ${list ? list.count : "—"} gastos filtrados`} onClick={e => { e.preventDefault(); listTitle.current?.focus({ preventScroll: true }); listTitle.current?.scrollIntoView({ block: "start", behavior: "instant" }); }}><span data-count>{list ? list.count : "—"}</span> gastos filtrados <span className="count-action">Ver lista</span></a>
        </div>
        <div className="filter"><label htmlFor="filter">Filtrar por categoría</label><div className="filter-controls"><select id="filter" value={filter} disabled={!catalog.length} onChange={e => { setFilter(e.target.value); load(e.target.value).catch(() => {}); }}><option value="">Todas las categorías</option>{catalog.map(c => <option key={c}>{c}</option>)}</select>{list && !list.count && confirmedFilter && <button className="text-button filter-reset" onClick={viewAll} aria-label="Ver todas las categorías">Ver todos</button>}</div></div>
        <Image unoptimized className="summary-mark" src="/brand-mark.svg" width="24" height="24" alt="" aria-hidden="true" />
        {list && (loadError || loading || conflict || attempts.length > 0) ? <p className="summary-context" role="status">{attempts.length ? <>Último total confirmado · <strong>{confirmedFilter || "Todas"}</strong>{confirmedFilter !== filter && <> · Filtro pendiente: {filter || "Todas"}</>}</> : <>{conflict ? "Listado, total y coincidencias: última lectura confirmada de " : "Total y coincidencias de "}<strong>{confirmedFilter || "Todas"}</strong> · Pendiente de actualizar{confirmedFilter !== filter && <> a {filter || "Todas"}</>}</>}</p> : null}
      </section>
      {loadError && <div id="read-error" tabIndex={-1} className="load-error" role="alert"><AlertCircle size={20} /><div><strong>Información pendiente de actualizar</strong><p>{loadError}</p><Button variant="outline" onClick={() => load(filter, true).catch(() => {})}>Reintentar</Button></div></div>}
      <div className={`work-surface ${reconciling ? "reconciling" : ""} ${expandedEditor || emptyWorkspace ? "wide-editor" : ""}`}>
        <section className={`register ${list && !list.count ? "is-empty" : ""}`} aria-labelledby="list-title" aria-busy={loading}>
          <div className="register-heading"><div><h2 id="list-title" tabIndex={-1} ref={listTitle}>Tus gastos</h2>{!!list?.count && <p className="currency-note">Importes en COP</p>}{loading && <span>Actualizando…</span>}</div>{(selected || dirty) && !confirmed && <Button variant="outline" onClick={() => transition(reset)} disabled={pending || (!!attempts.length && !separate)}><Plus size={18} /> Nuevo gasto</Button>}</div>
          {!!list?.count && <table><thead><tr><th>Concepto</th><th>Categoría</th><th>Fecha</th><th className="numeric">Importe (COP)</th><th>Acciones</th></tr></thead><tbody>
            {list?.expenses.map(e => <tr key={e.id} data-record={e.id} aria-selected={selected?.id === e.id} className={`${selected?.id === e.id ? "selected" : ""} ${money(e.amountCents).length > 14 ? "long-amount" : ""}`}>
              <td data-label="Concepto" className="concept-cell">{selected?.id === e.id && <span key={marker} className="row-marker" aria-hidden="true" />}<span className="concept-text">{e.concept}</span>{e.isExample && <> <span className="example">Ejemplo</span></>}</td><td data-label="Categoría">{e.category}</td><td data-label="Fecha"><time dateTime={e.date}>{e.date}</time></td><td data-label="Importe (COP)" className="numeric amount">{money(e.amountCents)}</td><td data-label="Acciones"><div className="row-actions"><Button variant="ghost" className="px-2" data-edit={e.id} aria-label={`Editar ${e.concept}`} disabled={pending || (!!attempts.length && !separate)} onClick={() => edit(e)}>Editar</Button><Button variant="ghost" className="px-2 delete-expense text-destructive hover:text-destructive" aria-label={`Eliminar ${e.concept}`} disabled={pending || !!attempts.length} onClick={() => remove(e)}>Eliminar</Button></div></td>
            </tr>)}
          </tbody></table>}
          {!list && <div className="empty"><LoaderCircle size={24} /><h3>{loading ? "Cargando tus gastos" : "Tus gastos no están disponibles"}</h3><p>{loading ? "Estamos consultando tu espacio privado." : "Reintenta para acceder a tus registros."}</p></div>}
          {list && !list.count && <div className="empty-ledger"><h3>{confirmedFilter ? `Sin gastos en ${confirmedFilter}` : "Sin gastos"}</h3><div className="empty-ledger-actions"><p>{confirmedFilter ? <><span>Sin coincidencias para este filtro</span>. Tu borrador se conserva.</> : "Agrega tu primer gasto con el formulario."}</p>{confirmedFilter ? <Button variant="outline" disabled={loading} onClick={viewAllFromList}>Ver todos los gastos</Button> : <Button variant="outline" onClick={() => { if (selected) transition(() => { reset(); requestAnimationFrame(() => conceptInput.current?.focus()); }); else conceptInput.current?.focus(); }}>Agregar el primer gasto</Button>}</div></div>}
          {list?.expenses.some(e => e.isExample) && <div className="register-bottom"><p><Info size={16} />Los ejemplos son ficticios. Puedes editarlos o eliminarlos.</p></div>}
        </section>
        <section className={`editor ${selected ? "editing" : ""}`} aria-labelledby="editor-title">
          {selected && <span key={marker} className="selection-marker" aria-hidden="true" />}
          {!!attempts.length && <div className="recovery uncertain" role="alert"><div className="recovery-title"><AlertCircle size={20} /><h3 id="uncertain-title" tabIndex={-1}>No pudimos confirmar el resultado</h3></div><p>El envío podría haberse guardado. Comprueba el envío original antes de continuar. Los cambios posteriores de tu borrador se conservan por separado.</p>{attempts.map(a => <div className="attempt" key={String(a.payload.key)}><p><strong>Envío original:</strong> {a.concept}</p>{JSON.stringify(a.draft) !== JSON.stringify(draft) && <p className="submitted-snapshot">{Object.keys(labels).map(k => <span key={k}>{labels[k as keyof Draft]}: {comparisonValue(a.draft,k as keyof Draft)}</span>)}<strong>Tu borrador cambió. Recuperar conserva el envío original.</strong></p>}<Button disabled={pending} onClick={() => send(a)}><RotateCcw size={16} />{a.kind === "delete" ? "Comprobar eliminación" : "Comprobar guardado"}</Button></div>)}{!separate && <button className="text-button" onClick={() => openModal({ title: "¿Iniciar otro guardado?", description: "El envío anterior podría estar guardado. Si agregas un gasto nuevo, podrías crear otro registro. Conservaremos la comprobación del envío original.", action: "Iniciar otro guardado", confirm: () => { setSeparate(true); setNotice(""); } })}>Quiero iniciar otro guardado</button>}</div>}
            <div className={`editor-top ${confirmed ? "confirmed" : ""} ${attempts.length ? "draft-header" : ""}`}>
              {confirmed && <p className="saved-status" role="status"><Check size={18} /><span>{notice}</span></p>}
              {!selected && <h2 ref={editor} id="editor-title" tabIndex={-1}>{attempts.length ? "Borrador editable" : "Nuevo gasto"}</h2>}
              {!confirmed && (!attempts.length || separate) && <Button className={`save${saveClass}`} type={conflict ? "button" : "submit"} form={conflict ? undefined : "expense-form"} onClick={conflict ? reviewConflict : undefined} disabled={saveDisabled}>{saveLabel}</Button>}
              {selected && !confirmed && <p className="editor-mode">Editar gasto</p>}
              {selected && <h2 ref={editor} id="editor-title" tabIndex={-1}>{selected.concept}</h2>}
              {selected?.isExample && <span className="example">Ejemplo</span>}
              {confirmed && <Button className="another" onClick={() => transition(reset)}><Plus size={16} />Agregar otro gasto</Button>}
              {selected && !confirmed && (!attempts.length || separate) && <Button type="button" className="cancel-edit" variant="outline" disabled={pending} onClick={() => transition(reset)}>Cancelar edición</Button>}
            </div>
            <div className="feedback" aria-live="polite" aria-atomic="true">{pending ? <p className="pending"><LoaderCircle size={18} /> Comprobando el guardado. Conservamos tus datos.</p> : originalSaved && dirty ? <div className="unsaved"><strong>Cambios sin guardar</strong><p>Conservamos tus cambios posteriores como borrador; aún no están guardados.</p><p className="original-confirmation"><Check size={16} />Envío original guardado</p></div> : notice && !confirmed ? <p className={notice.startsWith("Gasto") ? "success" : "warning"}>{notice.startsWith("Gasto") && <Check size={18} />}<span>{notice}</span></p> : null}</div>
          {outOfFilter && <p className="filter-notice">Este gasto está fuera del listado filtrado. <button className="text-button" onClick={viewAll}>Ver todos</button></p>}
          {conflict && <div className="recovery conflict" role="alert"><h3 id="comparison-title" tabIndex={-1}>{conflict.current ? "Este gasto cambió" : "Este gasto ya no está disponible"}</h3><p>Tu borrador sigue aquí. Revisa los valores antes de continuar.</p></div>}
          <form id="expense-form" noValidate onSubmit={e => { e.preventDefault(); if (conflict) reviewConflict(); else if (!disabled && (!attempts.length || separate)) save(); }}>
            {!!Object.keys(errors).length && <div className="validation" role="alert"><strong>Revisa estos datos</strong><ul>{(Object.keys(errors) as (keyof Draft)[]).map(k => <li key={k}><a href={`#${k}`} onClick={e => { e.preventDefault(); document.getElementById(k)?.focus(); }}>{labels[k].replace(" (COP)", "")}</a></li>)}</ul></div>}
            <div className="fields">{(Object.keys(labels) as (keyof Draft)[]).map(k => <div className={`field field-${k}`} key={k}><label htmlFor={k}>{labels[k]}{conflict && <span className="draft-label"> · Tu borrador</span>}</label>{k === "category" ? <select required id={k} value={draft[k]} onChange={e => change(k, e.target.value)} disabled={pending} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `${k}-error` : undefined}><option value="">Selecciona una categoría</option>{catalog.map(c => <option key={c}>{c}</option>)}</select> : k === "concept" ? <textarea ref={conceptInput} required id={k} rows={1} value={draft[k]} onChange={e => change(k, e.target.value)} disabled={pending} placeholder="¿En qué gastaste?" autoComplete="off" aria-invalid={!!errors[k]} aria-describedby={errors[k] ? "concept-error concept-help" : "concept-help"} /> : <input required id={k} value={draft[k]} onChange={e => change(k, e.target.value)} disabled={pending} type="text" inputMode={k === "amount" ? "decimal" : undefined} placeholder={k === "amount" ? "0,00" : "YYYY-MM-DD"} autoComplete="off" aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `${k}-error${k === "date" ? " date-help" : ""}` : `${k}-help`} />}
              {errors[k] && <p className="field-error" id={`${k}-error`}>{errors[k]}{k === "amount" && <> {amountGuidance}</>}</p>}
              {conflict && <dl className="field-comparison" data-field={k}>{conflict.current && comparisonValue(base,k) === comparisonValue(toDraft(conflict.current),k) ? <div className="comparison-shared"><dt>Sin cambios<span className="sr-only"> al abrir y en la versión actual</span>:</dt><dd data-snapshot="base"><span data-snapshot="current">{comparisonValue(base,k)}</span></dd></div> : <>{conflict.current && <div className="comparison-status changed"><dt>Versión actual</dt><dd>Cambió desde que lo abriste</dd></div>}{[base, ...(conflict.current ? [toDraft(conflict.current)] : [])].map((value,i) => <div key={i}><dt>{i === 0 ? "Al abrir" : "Versión actual"}</dt><dd data-snapshot={i === 0 ? "base" : "current"}>{comparisonValue(value,k)}</dd></div>)}</>}</dl>}
              {k === "concept" && <div id="concept-help" className={`field-help ${errors[k] ? "counter-only" : ""}`}>{!errors[k] && <span>De 1 a 120 caracteres</span>}<span>{draft.concept.length} / 120</span></div>}{k === "date" && <p id="date-help" className="field-help">Formato: YYYY-MM-DD. Puedes usar fechas futuras.</p>}{k === "amount" && <>{!errors[k] && <p id="amount-help" className="field-help">{amountGuidance}</p>}<details className="amount-limit"><summary>Límite por gasto <ChevronDown size={14} aria-hidden="true" /></summary><p>Máximo: 90.071.992.547.409,91 COP.</p></details></>}
            </div>)}</div>
            {conflict && <div className="conflict-actions" role="group" aria-label="Resolver los cambios">{conflict.current ? <><Button type="button" variant="outline" onClick={() => openModal({ title: "¿Cargar la versión actual?", description: "Se reemplazará tu borrador por los valores actuales del gasto.", action: "Cargar versión actual", confirm: () => { const current = conflict.current!; setSelected(current); setDraft(toDraft(current)); setBase(toDraft(current)); setConflict(null); setRecoveryDraft(false); setOriginalSaved(false); focusEditor(); load(filter).catch(() => {}); } })}>Cargar versión actual</Button><button type="button" className="text-button" onClick={() => openModal({ title: conflict.deleting ? "¿Eliminar la versión actual?" : "¿Sobrescribir el gasto?", description: "Has revisado los valores actuales. Esta acción usará la versión más reciente.", action: conflict.deleting ? "Eliminar versión actual" : "Sobrescribir con mi borrador", danger: conflict.deleting, confirm: () => { if (conflict.deleting) send({ endpoint: `/api/gastos/${conflict.current!.id}/eliminar`, payload: { key: crypto.randomUUID(), expectedVersion: conflict.current!.version }, draft: { ...draft }, kind: "delete", concept: conflict.current!.concept }); else save(conflict.current!.version); } })}>{conflict.deleting ? "Eliminar versión actual" : "Sobrescribir con mi borrador"}</button></> : <Button type="button" variant="outline" onClick={() => { setSelected(null); setConflict(null); setRecoveryDraft(false); setOriginalSaved(false); setBase(fresh()); focusEditor(); }}>Copiar borrador a un nuevo gasto</Button>}</div>}
            {blockedDraft && <div className="flex flex-wrap items-center gap-3"><p id="draft-save-help" className="text-sm text-[#536058]">Comprueba el envío original antes de guardar este borrador.</p><Button className="save" variant="outline" type="submit" disabled aria-describedby="draft-save-help">Guardar borrador</Button></div>}
            {!confirmed && !conflict && (!attempts.length || separate) && <Button className={`form-save hidden max-[600px]:inline-flex w-full${saveClass}`} type="submit" disabled={saveDisabled}>{saveLabel}</Button>}
          </form>
        </section>
      </div>
      <aside className="notes"><details><summary>Sobre tu espacio privado <ChevronDown size={16} aria-hidden="true" /></summary><p>Los gastos guardados se conservan al recargar. Se guardan en Turso y se vinculan a la sesión anónima de este navegador. No necesitas una cuenta. Si borras sus cookies, perderás el acceso a este espacio. Los borradores no enviados no se conservan al recargar.</p></details></aside>
    </main>
    <AlertDialog open={!!modal} onOpenChange={open => { if (!open) setModal(null); }}><AlertDialogContent onCloseAutoFocus={e => { e.preventDefault(); returnFocus.current?.focus(); const action = modalAction.current; modalAction.current = null; action?.(); }} onEscapeKeyDown={() => setModal(null)}><AlertDialogTitle className="dialog-title">{modal?.title}</AlertDialogTitle><AlertDialogDescription className="dialog-description">{modal?.target && <span className="deletion-target"><strong>{modal.target.concept}</strong><strong>{modal.target.amount}</strong></span>}<span>{modal?.description}</span></AlertDialogDescription><div className="dialog-actions"><AlertDialogCancel asChild><Button variant="outline">Cancelar</Button></AlertDialogCancel><AlertDialogAction asChild><Button variant={modal?.danger ? "destructive" : "default"} onClick={() => { modalAction.current = modal?.confirm || null; setModal(null); }}>{modal?.action}</Button></AlertDialogAction></div></AlertDialogContent></AlertDialog>
  </>;
}
