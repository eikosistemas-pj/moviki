/*!
 * MOVIKI api/visita.js | versao 2026-10-07-visita1 | repo: moviki (site publico)
 *
 * P75, fase 0 — ponte do aviso de VISITA a Meta, so para quem chegou por
 * anuncio da Meta (o navegador so chama isto quando tem fbc na sessao).
 *
 * POR QUE UMA PONTE NO SITE: as paginas do site so deixam o navegador falar
 * com o proprio dominio e com o Google (CSP connect-src). A chave da Meta mora
 * no moviki-robo. Em vez de abrir o CSP de cinco paginas grandes, o navegador
 * fala com /api/visita (mesmo dominio) e esta funcao repassa ao robo, servidor
 * a servidor, com o IP e o navegador REAIS do visitante — que so ela enxerga.
 *
 * O QUE NUNCA FAZ: nao grava nada, nao le banco, nao recebe e-mail, telefone
 * ou uid. Responde sempre 204, sem detalhe. Se o robo estiver fora, a pagina
 * nao percebe nada.
 *
 * ENV (opcional, ja existe): ROBO_URL — padrao https://moviki-robo.vercel.app
 */
'use strict';

const ORIGENS = ['https://www.moviki.com.br', 'https://moviki.com.br'];
const ROBO = String(process.env.ROBO_URL || 'https://moviki-robo.vercel.app').replace(/\/+$/, '');

function corpoDe(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  try { return JSON.parse(String(b || '{}')); } catch (_) { return {}; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const origem = String((req.headers && req.headers.origin) || '');
  if (ORIGENS.indexOf(origem) < 0) { res.status(403).end(); return; }

  try {
    const b = corpoDe(req);
    const h = req.headers || {};
    const envio = {
      evento: String(b.evento || '').slice(0, 20),
      fbc: String(b.fbc || '').slice(0, 500),
      fbp: String(b.fbp || '').slice(0, 100),
      url: String(b.url || '').slice(0, 1000),
      eventId: String(b.eventId || '').slice(0, 64),
      ip: String(h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim().slice(0, 45),
      ua: String(h['user-agent'] || '').slice(0, 500),
    };
    // O robo valida tudo de novo; aqui so se evita viagem a toa.
    if (!envio.fbc || !envio.evento) { res.status(204).end(); return; }

    const ctrl = new AbortController();
    const t = setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, 4000);
    try {
      await fetch(ROBO + '/api/meta-visita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envio),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(t); }
  } catch (e) {
    console.error('visita (ignorado):', (e && e.message) || e);
  }
  res.status(204).end();
};
