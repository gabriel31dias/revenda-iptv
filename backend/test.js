// node test.js — banco em memória, verifica cadastro/login e que teste usado não sai de novo
process.env.DB_FILE = ":memory:";
const { register, login, generate, db } = await import("./server.js");
import assert from "node:assert";

const admin = register({ name: "Adm", email: "a@a.com", password: "123456" });
assert.equal(admin.user.role, "admin");
const u1 = register({ name: "U1", email: "u1@a.com", password: "123456" }).user;
const u2 = register({ name: "U2", email: "u2@a.com", password: "123456" }).user;
assert.equal(u1.role, "user");
assert.throws(() => register({ name: "X", email: "u1@a.com", password: "123456" }));
assert.equal(login({ email: "U1@a.com", password: "123456" }).user.id, u1.id);
assert.throws(() => login({ email: "u1@a.com", password: "errada" }));

// site falso: cada chamada devolve um teste novo
let n = 0;
const fake = async () => ({ content: "teste " + ++n });
const t0 = 1_000_000_000;
const a = await generate(u1.id, t0, fake);
const b = await generate(u1.id, t0 + 1, fake);
assert.notEqual(b.id, a.id);
assert.ok(b.content.startsWith("teste 2\n💳"));
await generate(u2.id, t0 + 2, fake);
await assert.rejects(generate(u2.id, t0, async () => { throw new Error("site fora"); }), (e) => e[0] === 502);
// limite: 5 a cada 10 min (u2 já tem 1 em t0+2)
const u3 = register({ name: "U3", email: "u3@a.com", password: "123456" }).user;
for (let i = 0; i < 5; i++) await generate(u3.id, t0 + i * 60_000, fake);
await assert.rejects(generate(u3.id, t0 + 5 * 60_000, fake), (e) => e[0] === 429 && e[1].includes("5 min"));
assert.ok(await generate(u3.id, t0 + 10 * 60_000 + 1, fake), "primeiro saiu da janela, libera 1");
// pedidos simultâneos também contam
const u4 = register({ name: "U4", email: "u4@a.com", password: "123456" }).user;
const lento = () => new Promise((r) => setTimeout(() => r({ content: "x" }), 20));
const res = await Promise.allSettled(Array.from({ length: 7 }, () => generate(u4.id, t0, lento)));
assert.equal(res.filter((r) => r.status === "fulfilled").length, 5);
const { comCheckout, verCheckout, criarPix } = await import("./server.js");
const site = "📦 *Plano:* TESTE C/ ADULTOS\n💳 *Assinar/Renovar Plano:* https://painelblackbr.com/#/checkout/241KARvDmx/yb1BpYopDP\n💵 Preço";
assert.equal(comCheckout(site, "https://meu/checkout/abc"), "📦 *Plano:* TESTE C/ ADULTOS\n💳 *Assinar/Renovar Plano:* https://meu/checkout/abc\n💵 Preço");
assert.equal(comCheckout("📦 *Plano:* X\n💵 Preço", "L"), "📦 *Plano:* X\n💳 *Assinar/Renovar Plano:* L\n💵 Preço", "sem linha do site: põe abaixo do plano");
// cada teste gerado ganha um checkout próprio
const g = await generate(u1.id, t0 + 99 * 864e5, async () => ({ content: "✅ *Usuário:* abc123\n" + site }));
const code = g.content.match(/\/checkout\/([\w-]+)/)[1];
assert.ok(!g.content.includes("painelblackbr"));
const ck = verCheckout(code);
assert.equal(ck.usuario, "abc123");
assert.equal(ck.adultos, true);
assert.equal(ck.pagamento, undefined);
assert.throws(() => verCheckout("naoexiste"), (e) => e[0] === 404);
await assert.rejects(criarPix(code, { plano: "xx", email: "a@a.com" }), (e) => e[0] === 400);
await assert.rejects(criarPix(code, { plano: "mensal", email: "ruim" }), (e) => e[0] === 400);
// tipo de teste: só os da lista, e o plano certo vai pro worker
let pedido;
await generate(u1.id, t0 + 200 * 864e5, async (p) => { pedido = p; return { content: "✅ *Usuário:* x" }; }, "unitv");
assert.equal(pedido, "🔴®️ TESTE UNI TV COMPLETO C/ ADULTOS ®️🔴");
await assert.rejects(generate(u1.id, t0 + 200 * 864e5, fake, "outro"), (e) => e[0] === 400);
// liberação: pago entra como "aguardando"; admin muda pra "liberado"
const { listarPagamentos, mudarLiberacao } = await import("./server.js");
db.prepare("INSERT INTO pagamentos (test_id, plano, valor, mp_id, status, created_at, paid_at) VALUES (?,?,?,?,?,?,?)").run(g.id, "mensal", 8, "mp1", "approved", t0, t0);
db.prepare("INSERT INTO pagamentos (test_id, plano, valor, mp_id, status, created_at) VALUES (?,?,?,?,?,?)").run(g.id, "mensal", 8, "mp2", "pending", t0);
const [pg1] = listarPagamentos();
assert.equal(listarPagamentos().length, 1, "só aprovados");
assert.equal(pg1.liberacao, "aguardando");
assert.equal(pg1.usuario, "abc123");
mudarLiberacao(pg1.id, "liberado", t0 + 5);
assert.equal(listarPagamentos()[0].liberacao, "liberado");
assert.equal(listarPagamentos()[0].liberado_at, t0 + 5);
assert.throws(() => mudarLiberacao(pg1.id, "hack"), (e) => e[0] === 400);
assert.throws(() => mudarLiberacao(999, "liberado"), (e) => e[0] === 404);
console.log("ok");
const { stats } = await import("./server.js");
const s = stats(t0);
assert.equal(s.total, 16);
assert.equal(s.clientes, 4);
assert.equal(s.recentes.length, 8);
console.log("stats ok");
