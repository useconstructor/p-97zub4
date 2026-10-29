export class ApiError extends Error { constructor(public status: number, public data: Record<string, unknown>) { super(String(data.error)); } }
export async function api(url: string, payload?: unknown) {
  const response = await fetch(url, { method: payload ? "POST" : "GET", credentials: "same-origin", cache: "no-store", ...(payload ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}) });
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body);
  return body;
}
