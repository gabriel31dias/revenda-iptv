// Bot de WhatsApp (Baileys, sem navegador). Primeira vez: escaneie o QR (abre whats-qr.png na tela).
// Sessão fica em ./whats-session; depois reconecta sozinho.
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from 'baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('whats-session', import.meta.url));
const QR_PNG = fileURLToPath(new URL('whats-qr.png', import.meta.url));
const QR_HTML = fileURLToPath(new URL('whats-qr.html', import.meta.url));
// o QR muda a cada ~20s: a página recarrega a imagem sozinha
const PAGINA = `<!doctype html><meta charset="utf-8"><title>WhatsApp QR</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:sans-serif;background:#f7f7fa">
<div style="text-align:center"><h2>Painel TV — conectar WhatsApp</h2><img id="q" width="360" height="360">
<p>WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho</p><p id="s" style="color:#888"></p></div>
<script>setInterval(()=>{const i=new Image();i.onload=()=>{q.src=i.src;s.textContent='atualizado '+new Date().toLocaleTimeString()};i.onerror=()=>{s.textContent='Conectado! Pode fechar.'};i.src='whats-qr.png?'+Date.now()},2000)</script>`;

let sock, pronto = false, abriuQr = false;

export async function iniciarWhats() {
  const { state, saveCreds } = await useMultiFileAuthState(DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({}));
  sock = makeWASocket({ auth: state, version, logger: pino({ level: 'silent' }), browser: ['Painel TV', 'Chrome', '1.0'] });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      await QRCode.toFile(QR_PNG, qr, { width: 400, margin: 2 });
      console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
      console.log('WhatsApp: escaneie o QR acima (ou a imagem', QR_PNG + ') em WhatsApp > Aparelhos conectados');
      if (!abriuQr) { abriuQr = true; writeFileSync(QR_HTML, PAGINA); spawn('xdg-open', [QR_HTML], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); }
    }
    if (connection === 'open') {
      pronto = true;
      rmSync(QR_PNG, { force: true });
      rmSync(QR_HTML, { force: true });
      console.log('WhatsApp conectado:', sock.user?.id);
    }
    if (connection === 'close') {
      pronto = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('WhatsApp desconectado pelo celular. Apagando sessão; um novo QR vai aparecer.');
        rmSync(DIR, { recursive: true, force: true });
        abriuQr = false;
      }
      setTimeout(() => iniciarWhats().catch(e => console.log('WhatsApp erro:', e.message)), 3000);
    }
  });
}

// Destino: WHATS_DESTINO (ex.: 5511999999999) ou, se vazio, o próprio número conectado ("mensagem pra mim").
export async function enviar(texto) {
  if (!pronto) throw new Error('WhatsApp não conectado');
  const num = (process.env.WHATS_DESTINO || sock.user.id.split(':')[0].split('@')[0]).replace(/\D/g, '');
  const [c] = await sock.onWhatsApp(num); // acha o JID real (celular BR às vezes está cadastrado sem o 9)
  if (!c?.exists) throw new Error(`Número ${num} não tem WhatsApp`);
  await sock.sendMessage(c.jid, { text: texto });
}
