export const categories = ["Alimentación", "Transporte", "Hogar", "Salud", "Ocio", "Otros"] as const;
export type Draft = { concept: string; category: string; date: string; amount: string };
export type Expense = { id: string; concept: string; category: string; date: string; amountCents: string; isExample: boolean; version: number; createdAt: string; updatedAt: string };
export type Errors = Partial<Record<keyof Draft, string>>;
export function cents(raw: string): bigint {
  raw = raw.trim();
  if (!raw) throw Error("Escribe un importe.");
  if (/^-\d+(?:[.,]\d{1,2})?$/.test(raw)) throw Error("Escribe un importe mayor que cero.");
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw Error("Revisa el formato del importe.");
  const [whole, fraction = ""] = raw.split(/[.,]/);
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (value < 1n) throw Error("Escribe un importe mayor que cero.");
  if (value > 9007199254740991n) throw Error("El máximo por gasto es 90.071.992.547.409,91 COP.");
  return value;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1];
}
export function validate(value: Draft): Errors {
  const errors: Errors = {};
  if (!value.concept.trim() || value.concept.trim().length > 120) errors.concept = "Escribe un concepto de 1 a 120 caracteres.";
  if (!(categories as readonly string[]).includes(value.category)) errors.category = "Selecciona una categoría del catálogo.";
  if (!validDate(value.date)) errors.date = "Escribe una fecha real con formato YYYY-MM-DD.";
  try { cents(value.amount); } catch (e) { errors.amount = (e as Error).message; }
  return errors;
}
export function money(raw: string) {
  const v = BigInt(raw), integer = v / 100n, fraction = v % 100n;
  return integer.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + fraction.toString().padStart(2, "0");
}
export function decimal(raw: string) { const v = BigInt(raw); return `${v / 100n}.${(v % 100n).toString().padStart(2, "0")}`; }
export function toDraft(e: Expense): Draft { return { concept: e.concept, category: e.category, date: e.date, amount: decimal(e.amountCents) }; }
export function fresh(): Draft { const d = new Date(); return { concept: "", category: "", date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, amount: "" }; }
