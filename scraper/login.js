// npm start — só loga e salva a sessão (útil pra passar pelo Cloudflare antes de subir o backend)
import { abrir } from './blackbr.js';

const page = await abrir();
await page.screenshot({ path: 'dashboard.png' });
console.log('URL:', page.url(), '| screenshot: dashboard.png');
if (process.env.HEADLESS === 'true') await page.browser().close();
