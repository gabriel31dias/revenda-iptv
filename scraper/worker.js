// Roda na sua máquina: mantém o Chrome logado no painelblackbr e atende pedidos do servidor central via Socket.IO.
import { io } from 'socket.io-client';
import { abrir, criarTeste, fechar } from './blackbr.js';
import { iniciarWhats, enviar } from './whats.js';

const { CENTRAL_URL, WORKER_KEY } = process.env;
if (!CENTRAL_URL || !WORKER_KEY) throw new Error('Defina CENTRAL_URL e WORKER_KEY no scraper/.env');

process.on('unhandledRejection', (e) => console.log('erro não tratado:', e?.message || e)); // nunca derruba o worker

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { console.log('encerrando...'); await fechar(); process.exit(0); });

await iniciarWhats();
await abrir(); // loga já na partida, pra resolver o Cloudflare antes do primeiro pedido

const socket = io(CENTRAL_URL, { auth: { key: WORKER_KEY } }); // reconecta sozinho se cair
socket.on('connect', () => console.log(new Date().toLocaleTimeString(), 'conectado ao central', CENTRAL_URL));
socket.on('disconnect', (r) => console.log(new Date().toLocaleTimeString(), 'desconectado:', r));
socket.on('connect_error', (e) => console.log(new Date().toLocaleTimeString(), 'erro ao conectar:', e.message));

socket.on('criar-teste', async ({ plano } = {}, responder) => {
  console.log(new Date().toLocaleTimeString(), 'pedido de teste recebido:', plano);
  try {
    const t = await criarTeste(plano);
    console.log('  criado:', t.username);
    responder({ ok: true, ...t });
  } catch (e) {
    console.log('  falhou:', e.message);
    responder({ ok: false, erro: e.message });
  }
});

// Central avisa quando um PIX é aprovado -> manda no seu WhatsApp pra você ativar no painelblackbr.
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
socket.on('pagamento', async (p, responder) => {
  console.log(new Date().toLocaleTimeString(), 'pagamento aprovado:', p.usuario);
  try {
    await enviar([
      '💰 *PAGAMENTO APROVADO — ATIVAR*',
      '',
      `👤 *Usuário:* ${p.usuario ?? '?'}`,
      `📦 *Teste:* ${p.teste ?? '?'}`,
      `💵 *Valor:* ${brl(p.valor)} (${p.plano})`,
      `📧 *E-mail:* ${p.email ?? '-'}`,
      `🕒 *Pago em:* ${new Date(p.pagoEm).toLocaleString('pt-BR')}`,
      '',
      `👉 Ativar: https://painelblackbr.com/#/customers (busque por ${p.usuario})`,
      `🧾 Teste #${p.testeId} no painel: ${p.painel}`,
    ].join('\n'));
    responder({ ok: true });
  } catch (e) {
    console.log('  WhatsApp falhou:', e.message);
    responder({ ok: false, erro: e.message });
  }
});
