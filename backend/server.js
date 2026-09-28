// ponytail: stdlib only (node:http + node:sqlite + node:crypto). Node >= 22.5.
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes, timingSafeEqual, createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { Server } from "socket.io";

try { process.loadEnvFile(join(import.meta.dirname, ".env")); } catch {}

const PORT = process.env.PORT || 3001;
const SECRET = process.env.JWT_SECRET || "troque-este-segredo";
const WORKER_KEY = process.env.WORKER_KEY;
const DIST = resolve(import.meta.dirname, "../frontend/dist");
const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

export const db = new DatabaseSync(process.env.DB_FILE || join(import.meta.dirname, "data.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user');
  CREATE TABLE IF NOT EXISTS tests (
    id INTEGER PRIMARY KEY, content TEXT NOT NULL,
    used_by INTEGER, used_at INTEGER, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY, test_id INTEGER, user_id INTEGER, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS pagamentos (
    id INTEGER PRIMARY KEY, test_id INTEGER NOT NULL, plano TEXT NOT NULL, valor REAL NOT NULL, email TEXT,
    mp_id TEXT UNIQUE, status TEXT NOT NULL, qr TEXT, qr64 TEXT, expira INTEGER, created_at INTEGER NOT NULL, paid_at INTEGER);
`);
try { db.exec("ALTER TABLE pagamentos ADD COLUMN avisado INTEGER"); } catch {} // bancos antigos
// depois de pago: "aguardando" liberação do servidor até o admin marcar "liberado"
try { db.exec("ALTER TABLE pagamentos ADD COLUMN liberacao TEXT NOT NULL DEFAULT 'aguardando'"); } catch {}
try { db.exec("ALTER TABLE pagamentos ADD COLUMN liberado_at INTEGER"); } catch {}
try { db.exec("ALTER TABLE tests ADD COLUMN checkout TEXT"); } catch {} // bancos antigos
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS tests_checkout ON tests(checkout)");

const hash = (pw) => { const s = randomBytes(16).toString("hex"); return s + ":" + scryptSync(pw, s, 64).toString("hex"); };
const check = (pw, stored) => { const [s, h] = stored.split(":"); return timingSafeEqual(Buffer.from(h, "hex"), scryptSync(pw, s, 64)); };

// token = base64(payload).hmac — ponytail: sem lib JWT, expira em 7 dias
const sign = (p) => { const b = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + 7 * 864e5 })).toString("base64url"); return b + "." + createHmac("sha256", SECRET).update(b).digest("base64url"); };
const verify = (t = "") => {
  const [b, s] = t.split(".");
  if (!b || !s) return null;
  const good = createHmac("sha256", SECRET).update(b).digest("base64url");
  if (s.length !== good.length || !timingSafeEqual(Buffer.from(s), Buffer.from(good))) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  return p.exp > Date.now() ? p : null;
};

// Primeiro usuário cadastrado vira admin; os demais são "user".
export function register({ name, email, password }) {
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || "") || (password || "").length < 6)
    throw [400, "Preencha nome, e-mail válido e senha com 6+ caracteres"];
  const role = db.prepare("SELECT COUNT(*) n FROM users").get().n === 0 ? "admin" : "user";
  try {
    const { lastInsertRowid: id } = db.prepare("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)")
      .run(name.trim(), email.toLowerCase(), hash(password), role);
    return session({ id: Number(id), name: name.trim(), email: email.toLowerCase(), role });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) throw [409, "E-mail já cadastrado"];
    throw e;
  }
}

export function login({ email, password }) {
  const u = db.prepare("SELECT * FROM users WHERE email=?").get((email || "").toLowerCase());
  if (!u || !check(password || "", u.password)) throw [401, "E-mail ou senha inválidos"];
  return session(u);
}

const session = (u) => ({ token: sign({ id: u.id, role: u.role }), user: { id: u.id, name: u.name, email: u.email, role: u.role } });

// Worker (puppeteer na máquina do dono) conecta aqui via Socket.IO com WORKER_KEY e recebe "criar-teste".
let io;
// Testes que o cliente pode escolher (nome exato do botão no dashboard do painelblackbr).
export const TESTES = {
  p2p: { nome: "P2P BINSTREAM", plano: "⚜️ TESTE P2P BINSTREAM ELITE C/ ADULTOS ⚜️" },
  unitv: { nome: "UNI TV", plano: "🔴®️ TESTE UNI TV COMPLETO C/ ADULTOS ®️🔴" },
};
async function criarViaWorker(plano) {
  const [w] = await io.in("workers").fetchSockets(); // ponytail: usa o primeiro worker; round-robin se tiver vários
  if (!w) throw [503, "Gerador de testes offline. Tente em alguns minutos."];
  const r = await w.timeout(90_000).emitWithAck("criar-teste", { plano });
  if (!r?.ok) throw new Error(r?.erro || "worker sem resposta");
  return r;
}

// Troca o link de checkout do painelblackbr pelo nosso (ou põe logo abaixo da linha do plano).
export function comCheckout(txt, link) {
  const linha = `💳 *Assinar/Renovar Plano:* ${link}`;
  const sem = txt.replace(/^.*(painelblackbr\.com\/#\/checkout\/|Assinar\/Renovar Plano).*(\r?\n)?/gim, "");
  return /^.*\*Plano:\*.*$/m.test(sem) ? sem.replace(/^.*\*Plano:\*.*$/m, (l) => l + "\n" + linha) : sem + "\n" + linha;
}
const novoCodigo = () => randomBytes(8).toString("base64url");

// Limite por usuário: 5 testes a cada 10 min (conta os já gerados + os que estão sendo criados agora).
const LIMITE = 5, JANELA = 10 * 60_000;
const criando = new Map(); // userId -> pedidos em andamento

export async function generate(userId, now = Date.now(), criar = criarViaWorker, tipo = "p2p") {
  const teste = TESTES[tipo];
  if (!teste) throw [400, "Escolha o tipo de teste"];
  const recentes = db.prepare("SELECT at FROM logs WHERE user_id=? AND at>? ORDER BY at").all(userId, now - JANELA);
  if (recentes.length + (criando.get(userId) || 0) >= LIMITE) {
    const min = recentes.length >= LIMITE ? Math.ceil((recentes[recentes.length - LIMITE].at + JANELA - now) / 60_000) : 1;
    throw [429, `Limite de ${LIMITE} testes a cada 10 minutos. Tente de novo em ${min} min.`];
  }
  criando.set(userId, (criando.get(userId) || 0) + 1);
  let t;
  try { t = await criar(teste.plano); } catch (e) {
    if (Array.isArray(e)) throw e;
    console.error(e);
    throw [502, "Não foi possível criar o teste no painel. Tente de novo."];
  } finally { criando.set(userId, criando.get(userId) - 1); }
  const checkout = novoCodigo();
  t.content = comCheckout(t.content, `${PUBLIC_URL}/checkout/${checkout}`);
  const id = Number(db.prepare("INSERT INTO tests (content, created_at, used_by, used_at, checkout) VALUES (?,?,?,?,?)")
    .run(t.content, now, userId, now, checkout).lastInsertRowid);
  db.prepare("INSERT INTO logs (test_id, user_id, at) VALUES (?,?,?)").run(id, userId, now);
  const name = db.prepare("SELECT name FROM users WHERE id=?").get(userId)?.name;
  emit({ tipo: "teste", id, name, at: now });
  return { id, content: t.content, used_at: now, checkout };
}

// ---- Checkout próprio: PIX do Mercado Pago, um link por teste ----
// ponytail: preço fixo aqui; vira tabela editável no admin quando precisar
export const PLANOS = { mensal: { nome: "Mensal", valor: 8 } };
const PIX_MIN = 30; // PIX expira em 30 min

const pagPublico = (p) => p && { id: p.id, plano: p.plano, valor: p.valor, status: p.status, qr: p.qr, qr64: p.qr64, expira: p.expira, liberacao: p.liberacao };
const testeDoCheckout = (code) => {
  const t = db.prepare("SELECT id, content FROM tests WHERE checkout=?").get(code);
  if (!t) throw [404, "Checkout não encontrado"];
  return t;
};
const ultimoPag = (testId) => db.prepare("SELECT * FROM pagamentos WHERE test_id=? ORDER BY id DESC LIMIT 1").get(testId);

async function mp(path, opts = {}) {
  if (!MP_TOKEN) throw [503, "Pagamento indisponível (MP_ACCESS_TOKEN não configurado)"];
  const r = await fetch("https://api.mercadopago.com" + path, {
    ...opts, headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json", ...opts.headers },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("Mercado Pago", r.status, j); throw [502, "Mercado Pago recusou: " + (j.message || r.status)]; }
  return j;
}

// PIX pendente com preço antigo não é mostrado (o cliente gera um novo com o valor atual)
const pagAtual = (p) => (p?.status === "pending" && PLANOS[p.plano]?.valor !== p.valor ? undefined : p);

export function verCheckout(code) {
  const t = testeDoCheckout(code);
  return {
    usuario: t.content.match(/Usuário:\*?\s*(\S+)/)?.[1] ?? null,
    adultos: /C\/ ADULTOS|COM ADULTOS/i.test(t.content),
    planos: Object.entries(PLANOS).map(([id, p]) => ({ id, ...p })),
    pagamento: pagPublico(pagAtual(ultimoPag(t.id))),
  };
}

export async function criarPix(code, { plano, email } = {}, now = Date.now()) {
  const t = testeDoCheckout(code);
  const p = PLANOS[plano];
  if (!p) throw [400, "Escolha um plano"];
  if (!/^\S+@\S+\.\S+$/.test(email || "")) throw [400, "Informe um e-mail válido"];
  const ult = ultimoPag(t.id);
  if (ult?.status === "approved") return pagPublico(ult);
  if (ult?.status === "pending" && ult.plano === plano && ult.valor === p.valor && ult.expira > now + 60_000) return pagPublico(ult); // reaproveita PIX ainda válido

  const usuario = verCheckout(code).usuario;
  const j = await mp("/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": randomUUID() },
    body: JSON.stringify({
      transaction_amount: p.valor,
      description: `${p.nome} - usuário ${usuario}`,
      payment_method_id: "pix",
      payer: { email: email.trim().toLowerCase() },
      external_reference: `teste-${t.id}`,
      date_of_expiration: new Date(now + PIX_MIN * 60_000).toISOString(),
      // webhook só funciona com endereço público https
      ...(PUBLIC_URL.startsWith("https://") && { notification_url: `${PUBLIC_URL}/api/mp/webhook` }),
    }),
  });
  const tx = j.point_of_interaction?.transaction_data || {};
  db.prepare(`INSERT INTO pagamentos (test_id, plano, valor, email, mp_id, status, qr, qr64, expira, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(t.id, plano, p.valor, email.trim().toLowerCase(), String(j.id), j.status,
    tx.qr_code ?? null, tx.qr_code_base64 ?? null, now + PIX_MIN * 60_000, now);
  return pagPublico(ultimoPag(t.id));
}

// Consulta o status no Mercado Pago (nunca confia no que o navegador/webhook mandam).
async function atualizar(pag) {
  if (!pag || pag.status !== "pending") return pag;
  const j = await mp(`/v1/payments/${pag.mp_id}`);
  if (j.status === pag.status) return pag;
  const pago = j.status === "approved";
  db.prepare("UPDATE pagamentos SET status=?, paid_at=? WHERE id=?").run(j.status, pago ? Date.now() : null, pag.id);
  if (pago) {
    emit({ tipo: "pagamento", id: pag.test_id, plano: PLANOS[pag.plano]?.nome ?? pag.plano, valor: pag.valor, at: Date.now() });
    avisarWhats();
  }
  return db.prepare("SELECT * FROM pagamentos WHERE id=?").get(pag.id);
}

// Manda pro worker (WhatsApp) cada pagamento aprovado ainda não avisado; só marca avisado quando o worker confirma.
let avisando = false;
async function avisarWhats() {
  if (!io || avisando) return;
  avisando = true;
  try {
    const [w] = await io.in("workers").fetchSockets();
    if (!w) return; // worker offline: tenta de novo quando conectar / no próximo ciclo
    const pend = db.prepare(`SELECT p.*, t.content FROM pagamentos p JOIN tests t ON t.id=p.test_id
      WHERE p.status='approved' AND p.avisado IS NULL`).all();
    for (const p of pend) {
      const r = await w.timeout(30_000).emitWithAck("pagamento", {
        testeId: p.test_id,
        usuario: p.content.match(/Usuário:\*?\s*(\S+)/)?.[1] ?? null,
        teste: p.content.match(/\*Plano:\*\s*(.+)/)?.[1]?.trim() ?? null,
        plano: PLANOS[p.plano]?.nome ?? p.plano, valor: p.valor, email: p.email, pagoEm: p.paid_at,
        painel: `${PUBLIC_URL}/admin`,
      }).catch(() => null);
      if (r?.ok) db.prepare("UPDATE pagamentos SET avisado=? WHERE id=?").run(Date.now(), p.id);
      else console.error("aviso WhatsApp falhou", p.id, r?.erro ?? "sem resposta");
    }
  } finally { avisando = false; }
}

// Admin: pagamentos aprovados e a liberação de cada um.
export const LIBERACOES = ["aguardando", "liberado"];
export function listarPagamentos() {
  return db.prepare(`SELECT p.id, p.test_id, p.plano, p.valor, p.email, p.paid_at, p.liberacao, p.liberado_at,
      t.content, u.name cliente
    FROM pagamentos p JOIN tests t ON t.id=p.test_id LEFT JOIN users u ON u.id=t.used_by
    WHERE p.status='approved' ORDER BY p.liberacao='aguardando' DESC, p.paid_at DESC`).all()
    .map(({ content, ...p }) => ({
      ...p,
      usuario: content.match(/Usuário:\*?\s*(\S+)/)?.[1] ?? null,
      teste: content.match(/\*Plano:\*\s*(.+)/)?.[1]?.trim() ?? null,
    }));
}
export function mudarLiberacao(id, liberacao, now = Date.now()) {
  if (!LIBERACOES.includes(liberacao)) throw [400, "Status inválido"];
  const r = db.prepare("UPDATE pagamentos SET liberacao=?, liberado_at=? WHERE id=? AND status='approved'")
    .run(liberacao, liberacao === "liberado" ? now : null, id);
  if (!r.changes) throw [404, "Pagamento não encontrado"];
  emit({ tipo: "liberacao", id, liberacao, at: now });
  return { ok: true };
}

export async function statusCheckout(code) {
  return pagPublico(await atualizar(ultimoPag(testeDoCheckout(code).id)));
}

async function webhook(body) {
  const pag = db.prepare("SELECT * FROM pagamentos WHERE mp_id=?").get(String(body?.data?.id ?? ""));
  await atualizar(pag).catch((e) => console.error("webhook", e));
  return { ok: true };
}

// SSE: painéis do admin abertos recebem cada teste criado na hora.
const ouvintes = new Set();
const emit = (ev) => { for (const res of ouvintes) res.write(`data: ${JSON.stringify(ev)}\n\n`); };

// Números do dashboard do admin: situação atual + gerados por dia (7 dias).
export function stats(now = Date.now()) {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const n = (sql, ...a) => db.prepare(sql).get(...a).n;
  const total = n("SELECT COUNT(*) n FROM tests");
  const dias = Array.from({ length: 7 }, (_, i) => {
    const start = day.getTime() - (6 - i) * 864e5; // ponytail: ignora DST, erro máx. de 1h no limite do dia
    return { dia: start, total: n("SELECT COUNT(*) n FROM logs WHERE at>=? AND at<?", start, start + 864e5) };
  });
  return {
    total,
    clientes: n("SELECT COUNT(*) n FROM users WHERE role='user'"),
    hoje: dias[6].total,
    dias,
    recentes: db.prepare(`SELECT l.at, u.name, t.content FROM logs l
      LEFT JOIN users u ON u.id=l.user_id LEFT JOIN tests t ON t.id=l.test_id
      ORDER BY l.at DESC LIMIT 8`).all(),
  };
}

const routes = {
  "GET /api/admin/stats": () => stats(),
  "POST /api/register": (_, body) => register(body),
  "POST /api/login": (_, body) => login(body),
  "GET /api/me": (u) => db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(u.id),
  "POST /api/tests/generate": (u, body) => generate(u.id, undefined, undefined, body.tipo),
  "GET /api/tests/tipos": () => Object.entries(TESTES).map(([id, t]) => ({ id, nome: t.nome })),
  "GET /api/tests/mine": (u) =>
    db.prepare("SELECT tests.id, tests.content, tests.used_at, tests.checkout, p.paid_at pago_em, p.liberacao FROM tests LEFT JOIN pagamentos p ON p.id=(SELECT id FROM pagamentos WHERE test_id=tests.id AND status='approved' ORDER BY id DESC LIMIT 1) WHERE tests.used_by=? ORDER BY tests.used_at DESC LIMIT 50").all(u.id),
  "GET /api/admin/tests": () => db.prepare(`
    SELECT t.id, t.content, t.created_at, t.used_at, u.name used_by_name,
      (SELECT p.plano || '|' || p.valor || '|' || p.liberacao FROM pagamentos p WHERE p.test_id=t.id AND p.status='approved' ORDER BY p.id DESC LIMIT 1) pago
    FROM tests t LEFT JOIN users u ON u.id=t.used_by ORDER BY t.id DESC`).all(),
  "GET /api/admin/pagamentos": () => listarPagamentos(),
  "PUT /api/admin/pagamentos": (_, body, id) => mudarLiberacao(id, body.liberacao),
  "GET /api/checkout": (_, __, code) => verCheckout(code),
  "POST /api/checkout/pix": (_, body, code) => criarPix(code, body),
  "GET /api/checkout/status": (_, __, code) => statusCheckout(code),
  "POST /api/mp/webhook": (_, body) => webhook(body),
  "DELETE /api/admin/tests": (_, __, id) => { db.prepare("DELETE FROM tests WHERE id=?").run(id); return { ok: true }; },
};
const PUBLIC = new Set(["POST /api/register", "POST /api/login", "GET /api/checkout", "POST /api/checkout/pix", "GET /api/checkout/status", "POST /api/mp/webhook"]);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

async function handle(req, res) {
  const send = (code, data) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  const url = new URL(req.url, "http://x");

  if (!url.pathname.startsWith("/api/")) {
    // serve o build do frontend (SPA)
    const file = join(DIST, url.pathname);
    const path = file.startsWith(DIST) && extname(file) ? file : join(DIST, "index.html");
    let data;
    try { data = await readFile(path); } catch { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream" });
    return res.end(data);
  }

  // /api/admin/tests/123 -> rota "DELETE /api/admin/tests" com id=123
  // /api/checkout/<código>/pix -> rota "POST /api/checkout/pix" com o código
  const ck = url.pathname.match(/^\/api\/checkout\/([\w-]+)(\/\w+)?$/);
  const m = ck ? [, "/api/checkout" + (ck[2] || ""), ck[1]] : url.pathname.match(/^(.*?)(?:\/(\d+))?$/);
  const key = `${req.method} ${m[1]}`;
  if (key === "GET /api/admin/events") {
    // EventSource não manda header, então o token vem na query
    if (verify(url.searchParams.get("token") || "")?.role !== "admin") return send(401, { message: "Sessão expirada" });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": ok\n\n");
    ouvintes.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000); // ponytail: mantém proxies/navegador conectados
    return req.on("close", () => { clearInterval(ping); ouvintes.delete(res); });
  }

  const fn = routes[key];
  if (!fn) return send(404, { message: "Rota não encontrada" });

  try {
    let user = null;
    if (!PUBLIC.has(key)) {
      user = verify(req.headers.authorization?.replace("Bearer ", ""));
      if (!user) return send(401, { message: "Sessão expirada" });
      if (m[1].startsWith("/api/admin") && user.role !== "admin") return send(403, { message: "Acesso negado" });
    }
    let raw = "";
    for await (const c of req) { raw += c; if (raw.length > 1e6) return send(413, { message: "Payload muito grande" }); }
    send(200, await fn(user, raw ? JSON.parse(raw) : {}, ck ? ck[1] : m[2] && Number(m[2])));
  } catch (e) {
    if (Array.isArray(e)) return send(e[0], { message: e[1] });
    console.error(e);
    send(500, { message: "Erro interno" });
  }
}

if (process.argv[1] === import.meta.filename) {
  const http = createServer(handle);
  io = new Server(http);
  io.use((socket, next) => {
    const key = String(socket.handshake.auth?.key || "");
    const ok = WORKER_KEY && key.length === WORKER_KEY.length && timingSafeEqual(Buffer.from(key), Buffer.from(WORKER_KEY));
    next(ok ? undefined : new Error("chave inválida"));
  });
  io.on("connection", (s) => {
    s.join("workers");
    console.log("worker conectado", s.handshake.address);
    setTimeout(avisarWhats, 5000); // entrega avisos que ficaram pendentes enquanto o worker estava offline
    s.on("disconnect", () => console.log("worker desconectado", s.handshake.address));
  });
  http.listen(PORT, () => console.log(`API em http://localhost:${PORT}`));

  // Confere no Mercado Pago os PIX pendentes a cada 20s, mesmo com a página do cliente fechada (até 5 min após expirar).
  // ponytail: polling simples; com PUBLIC_URL https o webhook já avisa na hora e isto vira só garantia
  setInterval(async () => {
    const pendentes = db.prepare("SELECT * FROM pagamentos WHERE status='pending' AND expira > ?").all(Date.now() - 5 * 60_000);
    for (const p of pendentes) await atualizar(p).catch((e) => console.error("polling MP", e));
    avisarWhats(); // re-tenta avisos que falharam (ex.: WhatsApp estava desconectado)
  }, 20_000);
}
