import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { categories, cents, validate, type Draft } from "@/lib/domain";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieName = "bolsillo_session";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
function origins() { return [process.env.APP_ORIGIN, process.env.VERCEL_URL && `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`].filter(Boolean).map(v => new URL(v!).origin); }
async function owner(req: NextRequest) {
  const token = req.cookies.get(cookieName)?.value;
  if (!token) return null;
  const r = await db.execute({ sql: "SELECT space_id FROM sessions WHERE token_hash=?", args: [hash(token)] });
  return r.rows[0]?.space_id as string | undefined;
}
function expense(row: Record<string, unknown>) {
  return { id: row.id, concept: row.concept, category: row.category_id, date: row.date, amountCents: String(row.amount_cents), isExample: Boolean(row.is_example), version: Number(row.version), createdAt: row.created_at, updatedAt: row.updated_at };
}
async function handle(req: NextRequest, paths: string[]) {
  // Keep earlier API callers working; Spanish paths are the public contract.
  paths = paths.map((part, i) => i === 0 && part === "gastos" ? "expenses" : i === 2 && part === "editar" ? "update" : i === 2 && part === "eliminar" ? "delete" : part);
  if (req.method === "POST" && !origins().includes(req.headers.get("origin") || "")) return response({ error: "Origen no permitido." }, 403);
  const space = await owner(req);
  if (paths.join("/") === "session" && req.method === "POST") {
    if (space) return response({ ready: true });
    const token = randomBytes(32).toString("hex"), sid = randomUUID(), now = new Date().toISOString();
    const seed = [["Mercado", "Alimentación", "2026-06-01", 4500000], ["Bus", "Transporte", "2026-06-02", 320000], ["Cuaderno", "Otros", "2026-06-03", 1200000]];
    await db.batch([
      { sql: "INSERT INTO spaces(id,created_at) VALUES (?,?)", args: [sid, now] },
      { sql: "INSERT INTO sessions(token_hash,space_id,created_at) VALUES (?,?,?)", args: [hash(token), sid, now] },
      { sql: "INSERT INTO seed_markers(space_id,created_at) VALUES (?,?)", args: [sid, now] },
      ...seed.map(([concept, category, date, amount]) => ({ sql: "INSERT INTO expenses(id,space_id,concept,category_id,date,amount_cents,is_example,version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,1,?,?)", args: [randomUUID(), sid, concept, category, date, amount, now, now] }))
    ], "write");
    const res = response({ ready: true });
    const secure = new URL(req.headers.get("origin")!).protocol === "https:";
    res.cookies.set(cookieName, token, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 365, secure, sameSite: secure ? "none" : "lax", ...(secure ? { partitioned: true } : {}) });
    return res;
  }
  if (paths.join("/") === "categories" && req.method === "GET") {
    const r = await db.execute("SELECT id,name FROM categories ORDER BY rowid");
    return response({ categories: r.rows });
  }
  if (!space) return response({ error: "No pudimos acceder a tu sesión. Permite las cookies de este sitio y reintenta." }, 401);
  if (paths[0] !== "expenses") return response({ error: "No encontrado." }, 404);
  if (req.method === "GET") {
    if (paths.length === 2) { const r = await db.execute({ sql: "SELECT * FROM expenses WHERE id=? AND space_id=?", args: [paths[1], space] }); return r.rows[0] ? response({ expense: expense(r.rows[0]) }) : response({ error: "Gasto no disponible." }, 404); }
    const category = req.nextUrl.searchParams.get("categoria") || req.nextUrl.searchParams.get("category") || "";
    if (category && !(categories as readonly string[]).includes(category)) return response({ error: "Categoría no válida." }, 400);
    const reads = await db.batch([
      { sql: "SELECT * FROM expenses WHERE space_id=? AND (?='' OR category_id=?) ORDER BY date DESC, created_at DESC, id DESC", args: [space, category, category] },
      "SELECT name FROM categories ORDER BY rowid"
    ], "read");
    const records = reads[0].rows.map(expense);
    return response({ expenses: records, categories: reads[1].rows.map(r => r.name), count: records.length, totalCents: records.reduce((v, r) => v + BigInt(r.amountCents), 0n).toString() });
  }
  const type = paths.length === 1 ? "create" : paths.length === 3 && ["update", "delete"].includes(paths[2]) ? paths[2] : null;
  if (!type) return response({ error: "No encontrado." }, 404);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return response({ error: "JSON no válido." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "Formato no válido." }, 400);
  const fields = ["key", ...(type !== "create" ? ["expectedVersion"] : []), ...(type !== "delete" ? ["concept", "category", "date", "amount", ...(Object.hasOwn(body, "amountCents") ? ["amountCents"] : [])] : [])];
  if (Object.keys(body).some(k => !fields.includes(k))) return response({ error: "Campos no permitidos." }, 400);
  if (typeof body.key !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(body.key)) return response({ error: "Clave de guardado no válida." }, 400);
  if (type !== "create" && (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1)) return response({ error: "Versión no válida." }, 400);
  if (type !== "delete") {
    const errors = validate(Object.fromEntries(["concept", "category", "date", "amount"].map(k => [k, typeof body[k] === "string" ? body[k] : ""])) as Draft);
    if (Object.keys(errors).length) return response({ error: "Revisa los campos indicados.", errors }, 400);
    if (Object.hasOwn(body, "amountCents") && (typeof body.amountCents !== "string" || !/^[0-9]+$/.test(body.amountCents) || body.amountCents !== cents(String(body.amount)).toString())) return response({ error: "El importe en centavos no coincide.", errors: { amount: "El importe en centavos no coincide con la entrada decimal." } }, 400);
  }
  // Preserve raw submitted intent in a canonical, immutable envelope.
  const payload = JSON.stringify({ type, target: type === "create" ? null : paths[1], ...Object.fromEntries([...fields].sort().map(k => [k, body[k]])) });
  const tx = await db.transaction("write");
  try {
    const op = await tx.execute({ sql: "SELECT payload,response FROM operations WHERE space_id=? AND key=?", args: [space, body.key] });
    if (op.rows.length) { await tx.rollback(); return op.rows[0].payload === payload ? response(JSON.parse(String(op.rows[0].response))) : response({ error: "Esta clave pertenece a otro envío. Recupera el envío original.", code: "key_reused" }, 409); }
    let existing;
    if (type !== "create") {
      const r = await tx.execute({ sql: "SELECT * FROM expenses WHERE id=? AND space_id=?", args: [paths[1], space] });
      if (!r.rows[0]) { await tx.rollback(); return response({ error: "Gasto no disponible.", code: "unavailable" }, 404); }
      existing = r.rows[0];
      if (Number(existing.version) !== body.expectedVersion) { await tx.rollback(); return response({ error: "El gasto cambió desde que lo abriste.", current: expense(existing), code: "version_conflict" }, 409); }
    }
    const id = type === "create" ? randomUUID() : paths[1], now = new Date().toISOString();
    if (type === "delete") await tx.execute({ sql: "DELETE FROM expenses WHERE id=? AND space_id=? AND version=?", args: [id, space, Number(body.expectedVersion)] });
    else {
      const args = [String(body.concept).trim(), String(body.category), String(body.date), cents(String(body.amount))];
      if (type === "create") await tx.execute({ sql: "INSERT INTO expenses(id,space_id,concept,category_id,date,amount_cents,is_example,version,created_at,updated_at) VALUES (?,?,?,?,?,?,0,1,?,?)", args: [id, space, ...args, now, now] });
      else await tx.execute({ sql: "UPDATE expenses SET concept=?,category_id=?,date=?,amount_cents=?,version=version+1,updated_at=? WHERE id=? AND space_id=? AND version=?", args: [...args, now, id, space, Number(body.expectedVersion)] });
    }
    const saved = type === "delete" ? null : (await tx.execute({ sql: "SELECT * FROM expenses WHERE id=? AND space_id=?", args: [id, space] })).rows[0];
    const result = type === "delete" ? { deleted: id } : { expense: expense(saved!) };
    await tx.execute({ sql: "INSERT INTO operations(space_id,key,type,target_id,payload,response,created_at) VALUES (?,?,?,?,?,?,?)", args: [space, body.key, type, id, payload, JSON.stringify(result), now] });
    await tx.commit();
    return response(result);
  } catch (e) { if (!tx.closed) await tx.rollback(); throw e; } finally { tx.close(); }
}
async function route(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try { return await handle(req, (await ctx.params).path); } catch { return response({ error: "No pudimos completar la solicitud. Reintenta para comprobar el resultado." }, 503); }
}
export const GET = route;
export const POST = route;
