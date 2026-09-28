// Controla o painelblackbr.com: um único Chrome (visível, por causa do Cloudflare) reaproveitado entre chamadas.
import puppeteer from 'puppeteer-extra';
import Stealth from 'puppeteer-extra-plugin-stealth';
import { fileURLToPath } from 'node:url';

puppeteer.use(Stealth());
try { process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url))); } catch {}

const SITE = 'https://painelblackbr.com/#/dashboard';
export const PLANO = '⚜️ TESTE P2P BINSTREAM ELITE C/ ADULTOS ⚜️';
const sleep = (min, max) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
const CF = /moment|verif|attention/i;
// ponytail: todo waitForFunction usa polling: 500 — o padrão (rAF) trava com a janela minimizada

let browser, page;

export async function abrir() {
  if (page && !page.isClosed() && browser.connected) return page;
  const { PANEL_EMAIL, PANEL_PASS, HEADLESS } = process.env;
  if (!PANEL_EMAIL || !PANEL_PASS) throw new Error('Defina PANEL_EMAIL e PANEL_PASS no scraper/.env');

  browser = await puppeteer.launch({
    headless: HEADLESS === 'true',
    userDataDir: fileURLToPath(new URL('session', import.meta.url)), // sessão salva entre execuções
    defaultViewport: null,
    protocolTimeout: 60000, // comando travado falha antes do timeout de 90s do central
    handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false, // quem encerra é fechar()
    args: [
      '--window-size=1366,768', '--lang=pt-BR',
      // sem isso, janela minimizada/aba em segundo plano fica "congelada" e o clique trava
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    ],
  });
  // o Chrome restaura abas antigas da sessão salva: fecha todas e fica só com uma, na frente
  page = await browser.newPage();
  for (const old of await browser.pages()) if (old !== page) await old.close();
  await page.bringToFront();
  await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 60000 });

  // Cloudflare: espera um humano clicar na janela. O cf_clearance fica salvo em ./session.
  if (await page.$('input[name=username]') === null && CF.test(await page.title())) {
    console.log('Cloudflare pediu verificação — clique no "Verify you are human" na janela (até 3 min)...');
    await page.waitForFunction(re => !new RegExp(re, 'i').test(document.title), { timeout: 180000, polling: 500 }, CF.source);
    await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
  }

  if (page.url().includes('sign-in')) {
    await page.waitForSelector('input[name=username]');
    await sleep(500, 1200);
    await page.type('input[name=username]', PANEL_EMAIL, { delay: 60 + Math.random() * 60 });
    await sleep(300, 800);
    await page.type('input[name=password]', PANEL_PASS, { delay: 60 + Math.random() * 60 });
    await sleep(400, 900);
    await Promise.all([
      page.waitForFunction(() => !location.hash.includes('sign-in'), { timeout: 30000, polling: 500 }),
      page.click('#kt_sign_in_submit'),
    ]).catch(async () => {
      await page.screenshot({ path: fileURLToPath(new URL('erro-login.png', import.meta.url)) });
      throw new Error('Login falhou (captcha ou senha?). Veja scraper/erro-login.png');
    });
    await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
    console.log('Logado no painelblackbr. Sessão salva.');
  }
  return page;
}

export async function fechar() {
  await Promise.race([browser?.close(), new Promise(r => setTimeout(r, 5000))]).catch(() => {});
}

// Clica no botão do plano no dashboard do site e devolve o texto do modal "Detalhes do Cliente".
async function criar(plano) {
  const p = await abrir();
  if (!p.url().includes('#/dashboard')) await p.goto(SITE, { waitUntil: 'networkidle2' });
  if (p.url().includes('sign-in')) { await browser.close(); page = null; return criar(plano); } // sessão caiu: reloga

  const achar = (nome) => [...document.querySelectorAll('button.cd-tr-item')].find(e => e.innerText.replace(/[\u200b-\u200d\ufeff]/g, '').trim() === nome.replace(/[\u200b-\u200d\ufeff]/g, '').trim());
  await p.waitForFunction(achar, { timeout: 30000, polling: 500 }, plano).catch(() => { throw new Error(`Botão "${plano}" não encontrado no dashboard`); });
  await sleep(300, 900);

  const eCriar = (x) => x.url().endsWith('/api/customers') && x.method() === 'POST';
  const resp = p.waitForResponse(r => eCriar(r.request()), { timeout: 60000 });
  resp.catch(() => {}); // evita derrubar o processo se nunca chegar

  // Logo após carregar o botão às vezes ainda não responde: só re-clica se o POST NÃO saiu (sem risco de duplicar).
  let saiu = false;
  for (let i = 0; i < 3 && !saiu; i++) {
    const req = p.waitForRequest(eCriar, { timeout: 8000 }).then(() => true, () => false);
    // ponytail: mouse no centro do botão; o .click() do puppeteer espera IntersectionObserver e trava minimizado
    const { x, y } = await p.evaluate((n) => {
      const el = [...document.querySelectorAll('button.cd-tr-item')].find(e => e.innerText.replace(/[\u200b-\u200d\ufeff]/g, '').trim() === n.replace(/[\u200b-\u200d\ufeff]/g, '').trim());
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width * (0.3 + Math.random() * 0.4), y: r.y + r.height * (0.3 + Math.random() * 0.4) };
    }, plano);
    await p.mouse.move(x - 40, y - 20);
    await p.mouse.click(x, y, { delay: 50 + Math.random() * 80 });
    saiu = await req;
    if (!saiu) await sleep(1000, 2000);
  }
  if (!saiu) {
    await p.screenshot({ path: fileURLToPath(new URL('erro-teste.png', import.meta.url)) });
    throw new Error('O botão do teste não respondeu. Veja scraper/erro-teste.png');
  }
  const r = await resp;
  const json = await r.json().catch(() => ({}));
  if (!r.ok()) throw new Error('Site recusou: ' + (json.message || r.status()));
  const d = json.data;

  // Texto pronto do modal; se o layout mudar, monta um básico com os dados da API.
  const texto = await p.waitForFunction(u => {
    const m = [...document.querySelectorAll('.modal.show')].find(e => e.innerText.includes(u));
    return m && m.innerText.replace(/^Detalhes do Cliente\s*/, '').replace(/\s*WhatsApp\s*Copiar\s*Fechar[\s\S]*$/, '').trim();
  }, { timeout: 10000, polling: 500 }, d.username).then(h => h.jsonValue()).catch(() =>
    `✅ Usuário: ${d.username}\n✅ Senha: ${d.password}\n📦 Plano: ${d.package}\n🗓️ Vencimento: ${new Date(d.expires_at).toLocaleString('pt-BR')}`);

  await sleep(400, 900);
  await p.evaluate(() => [...document.querySelectorAll('.modal.show button')].find(b => b.innerText.trim() === 'Fechar')?.click());
  return { content: texto, username: d.username, expires_at: Date.parse(d.expires_at) };
}

// ponytail: fila global — um clique por vez no mesmo Chrome; basta pro volume de uma revenda
let fila = Promise.resolve();
export function criarTeste(plano = PLANO) {
  const r = fila.then(() => criar(plano));
  fila = r.catch(() => {});
  return r;
}
