"use client";

// Thin fetch wrappers for the /api routes. Cookies (the Supabase session) ride
// along automatically because these are same-origin requests.

async function handle(res: Response) {
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json;
}

export function apiPost(path: string, body: unknown) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle);
}

export function apiPatch(path: string, body: unknown) {
  return fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle);
}

export function apiDelete(path: string) {
  return fetch(path, { method: "DELETE" }).then(handle);
}
