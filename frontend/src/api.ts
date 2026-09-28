export type User = { id: number; name: string; email: string; role: "admin" | "user" };

export const getUser = (): User | null => JSON.parse(localStorage.getItem("user") || "null");

export function saveSession(s: { token: string; user: User }) {
  localStorage.setItem("token", s.token);
  localStorage.setItem("user", JSON.stringify(s.user));
}

export function logout() {
  localStorage.clear();
  location.href = "/login";
}

export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (localStorage.getItem("token") || "") },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch((): null => null);
  if (res.status === 401 && localStorage.getItem("token")) logout();
  if (!res.ok) throw new Error(data?.message || "Erro inesperado");
  return data;
}

// Tempo real (admin): chama cb a cada teste criado. Retorna a função que fecha a conexão.
export function aoVivo(cb: (ev: { tipo: "teste" | "pagamento" | "liberacao"; id: number; name?: string | null; plano?: string; valor?: number; at: number }) => void) {
  const es = new EventSource("/api/admin/events?token=" + encodeURIComponent(localStorage.getItem("token") || ""));
  es.onmessage = (e) => cb(JSON.parse(e.data));
  return () => es.close();
}
