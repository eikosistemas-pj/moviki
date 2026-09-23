/*!
 * MOVIKI api/criadores.js | versao 2026-09-22-criadores2 | repo: moviki (site publico)
 *
 * TRES PORTAS DO PROGRAMA DE CRIADORES, NUM ARQUIVO SO
 *
 * 1) GET  -> as pecas que podem ir para as redes oficiais do Moviki.
 *    Quem chama: o robo social (moviki-assistente-social, secret CRIADORES_URL).
 *    Contrato: moviki-assistente-social/conteudo/CRIADORES-CONTRATO.md
 *    So sai peca com AS DUAS CHAVES:
 *      - autorizaRedes == true, nao revogada, dentro da validade (12 meses);
 *      - status == 'aprovada' (o dono aprovou no painel).
 *    E so de criador com cadastro de parceiro aprovado e marcado como criador.
 *    Conjunto FECHADO de campos: nada de e-mail, Pix, comissao ou uid de
 *    lojista. O nome e o @ do credito vem do cadastro (parceiros/{uid}), nao
 *    do que o criador escreveu na peca.
 *
 * 2) POST {acao:'trafego', idToken, dias} -> visitas vindas dos links dos
 *    criadores, lidas no Google Analytics 4. Quem chama: o painel do dono.
 *    O /c/apelido (e o /p/apelido) carimbam utm_source=criador|parceiro e
 *    utm_content=apelido desde 19/09 — o dado ja existe no GA4, so nao havia
 *    como ve-lo por criador. So admin (admins/{uid}, lido no servidor).
 *
 * 3) POST {acao:'meu_trafego', idToken, dias} -> as visitas do PROPRIO link,
 *    para o painel do criador (parceiro.html). O apelido vem do cadastro
 *    (parceiros/{uid}.slug, lido no servidor) — nunca do corpo do pedido: um
 *    parceiro nao consegue ver o trafego de outro. So cadastro aprovado.
 *
 * POR QUE AQUI E NAO NO ROBO DO DINHEIRO
 *   Nada disso mexe em dinheiro. A conta de servico do site e SOMENTE LEITURA
 *   (Firestore) e, com o GA4 liberado para ela, so le relatorio. O
 *   moviki-robo continua mudando o minimo.
 *
 * ENV (projeto Vercel do SITE):
 *   FIREBASE_SA_LEITURA   (ja existe) — a mesma conta le Firestore e GA4
 *   GA4_PROPRIEDADE       opcional; padrao 551687492 (propriedade "Moviki")
 *   CRIADORES_SECRET      opcional; se existir, o GET exige Bearer <valor>
 *   LIVE_ORIGENS          opcional; mesma lista de origens do api/live.js
 *
 * PARA O TRAFEGO FUNCIONAR (duas acoes no console, uma vez so):
 *   a) GA4 > Administrador > Gerenciamento de acesso a propriedade > "+" >
 *      e-mail moviki-site-leitura@moviki-app.iam.gserviceaccount.com, papel
 *      LEITOR.
 *   b) Google Cloud (projeto moviki-app) > APIs e servicos > ativar
 *      "Google Analytics Data API".
 *   Sem isso o POST responde {erro:'ga4', detalhe:...} e o painel avisa.
 */
'use strict';

const crypto = require('crypto');
const gauth = require('../lib/gauth');

const PROJ = 'moviki-app';
const BASE_REST = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents';
const CERTS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const GA4 = String(process.env.GA4_PROPRIEDADE || '551687492').replace(/\D/g, '');
const TETO = 300;                        // resposta nunca vira dump
const VALIDADE_MS = 365 * 24 * 3600 * 1000;   // termo v3.1: 12 meses
const FORMATOS = ['feed', 'story', 'reel'];

/* ---------------- utilitarios ---------------- */
function origens() {
  const env = String(process.env.LIVE_ORIGENS || '').split(',').map(s => s.trim()).filter(Boolean);
  return env.length ? env : ['https://app.moviki.com.br', 'https://moviki.com.br', 'https://www.moviki.com.br'];
}
function cors(req, res) {
  const o = req.headers.origin || '';
  if (origens().indexOf(o) >= 0) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}
function responder(res, cod, obj) {
  res.statusCode = cod;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
function txt(f) { return f && typeof f.stringValue === 'string' ? f.stringValue : ''; }
function num(f) {
  if (!f) return null;
  if (typeof f.doubleValue === 'number') return f.doubleValue;
  if (f.integerValue != null) return Number(f.integerValue);
  return null;
}
function bool(f) { return !!(f && f.booleanValue === true); }
function quando(f) {
  if (!f || !f.timestampValue) return 0;
  const t = Date.parse(f.timestampValue);
  return isNaN(t) ? 0 : t;
}
function iso(ms) { return ms ? new Date(ms).toISOString() : null; }
function iguais(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function chamar(url, opcoes, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 6000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctrl.signal }, opcoes));
    clearTimeout(t);
    const corpo = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, corpo };
  } catch (e) { clearTimeout(t); return { ok: false, status: 0, corpo: null }; }
}

async function lerDoc(caminho, token) {
  const r = await chamar(BASE_REST + '/' + caminho, { headers: { Authorization: 'Bearer ' + token } }, 4000);
  if (r.status === 404) return { existe: false, f: {} };
  if (!r.ok || !r.corpo) return null;
  return { existe: true, f: r.corpo.fields || {} };
}

/* ---------------- idToken (mesmo desenho do api/live.js) ---------------- */
let certCache = { mapa: null, expira: 0 };
async function certificados() {
  const agora = Date.now();
  if (certCache.mapa && agora < certCache.expira) return certCache.mapa;
  const r = await chamar(CERTS, {}, 3000);
  if (!r.ok || !r.corpo) return null;
  certCache = { mapa: r.corpo, expira: agora + 3600 * 1000 };
  return r.corpo;
}
function b64urlBuf(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
async function uidDoToken(tk) {
  try {
    const p = String(tk || '').split('.');
    if (p.length !== 3) return '';
    const cab = JSON.parse(b64urlBuf(p[0]).toString('utf8'));
    const corpo = JSON.parse(b64urlBuf(p[1]).toString('utf8'));
    if (cab.alg !== 'RS256' || !cab.kid) return '';
    const certs = await certificados();
    if (!certs || !certs[cab.kid]) return '';
    const ok = crypto.createVerify('RSA-SHA256').update(p[0] + '.' + p[1]).verify(certs[cab.kid], b64urlBuf(p[2]));
    if (!ok) return '';
    const agora = Math.floor(Date.now() / 1000);
    if (corpo.aud !== PROJ || corpo.iss !== 'https://securetoken.google.com/' + PROJ) return '';
    if (!corpo.exp || corpo.exp < agora) return '';
    if (corpo.iat && corpo.iat > agora + 300) return '';
    if (typeof corpo.sub !== 'string' || !corpo.sub || corpo.sub.length > 128) return '';
    return corpo.sub;
  } catch (e) { return ''; }
}

/* ================= 1. GET — pecas liberadas para o robo ================= */
async function pecasLiberadas(token) {
  // Duas igualdades: o Firestore resolve com os indices automaticos.
  const r = await chamar(BASE_REST + ':runQuery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'criador_pecas' }],
        where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'aprovada' } } },
          { fieldFilter: { field: { fieldPath: 'autorizaRedes' }, op: 'EQUAL', value: { booleanValue: true } } }
        ] } },
        limit: TETO
      }
    })
  }, 7000);
  if (!r.ok || !Array.isArray(r.corpo)) return null;

  const agora = Date.now();
  const brutas = [];
  for (const linha of r.corpo) {
    const d = linha && linha.document;
    if (!d || !d.fields) continue;
    const f = d.fields;
    const autEm = quando(f.autorizaRedesEm);
    if (!autEm || quando(f.revogadaEm) > autEm) continue;          // revogada
    if (agora > autEm + VALIDADE_MS) continue;                      // vencida
    const url = txt(f.url);
    if (!/^https:\/\/firebasestorage\.googleapis\.com\//.test(url)) continue;
    const formato = txt(f.formato);
    if (FORMATOS.indexOf(formato) < 0) continue;
    brutas.push({ id: String(d.name || '').split('/').pop(), f, autEm, url, formato });
  }

  // Credito vem do CADASTRO, nao do que o criador digitou na peca. E so
  // criador com cadastro aprovado e marcado como criador sai daqui.
  const uids = Array.from(new Set(brutas.map(b => txt(b.f.uid)).filter(Boolean)));
  const cad = {};
  await Promise.all(uids.map(async uid => {
    const p = await lerDoc('parceiros/' + encodeURIComponent(uid), token);
    if (p && p.existe && txt(p.f.status) === 'aprovado' && bool(p.f.criador)) {
      cad[uid] = { nome: txt(p.f.nome).slice(0, 60), arroba: txt(p.f.arroba).replace(/[^A-Za-z0-9._@]/g, '').slice(0, 31) };
    }
  }));

  const itens = [];
  for (const b of brutas) {
    const uid = txt(b.f.uid);
    if (!cad[uid]) continue;
    const capa = txt(b.f.capa);
    itens.push({
      id: b.id,
      formato: b.formato,
      midia: txt(b.f.midia),
      url: b.url,
      capa: /^https:\/\/firebasestorage\.googleapis\.com\//.test(capa) ? capa : null,
      w: num(b.f.w), h: num(b.f.h), duracao: num(b.f.duracao),
      titulo: txt(b.f.titulo).slice(0, 120),
      legenda: txt(b.f.legenda).slice(0, 2200),
      categoria: txt(b.f.categoria).slice(0, 40) || 'geral',
      criador: { uid: uid, nome: cad[uid].nome, arroba: cad[uid].arroba },
      autorizacao: {
        autorizado: true,
        versao_termo: txt(b.f.termoVersao).slice(0, 20),
        em: iso(b.autEm),
        expira_em: iso(b.autEm + VALIDADE_MS),
        revogada_em: null
      },
      aprovacao: { aprovada: true, em: iso(quando(b.f.avaliadaEm)) }
    });
  }
  return itens;
}

/* ================= 2. POST — trafego por criador (GA4) ================= */
/* Uma consulta ao GA4 serve todo mundo por 10 min (a mesma instancia da
   Vercel atende o dono e os criadores). Protege a cota do GA4 de um painel
   aberto e recarregado varias vezes. */
let cacheTraf = { quando: 0, dias: 0, r: null };
async function trafego(dias) {
  if (cacheTraf.r && cacheTraf.dias >= dias && Date.now() - cacheTraf.quando < 10 * 60 * 1000) return cacheTraf.r;
  const r = await trafegoGA4(dias);
  if (r && r.ok) cacheTraf = { quando: Date.now(), dias: dias, r: r };
  return r;
}

async function trafegoGA4(dias) {
  const tk = await gauth.tokenAnalytics();
  if (!tk) return { erro: 'sa' };
  const r = await chamar('https://analyticsdata.googleapis.com/v1beta/properties/' + GA4 + ':runReport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({
      dateRanges: [{ startDate: dias + 'daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'date' }, { name: 'sessionSource' }, { name: 'sessionManualAdContent' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      dimensionFilter: { filter: { fieldName: 'sessionSource',
        inListFilter: { values: ['criador', 'parceiro'], caseSensitive: false } } },
      limit: 20000
    })
  }, 9000);
  if (!r.ok) {
    const msg = (r.corpo && r.corpo.error && r.corpo.error.message) || ('HTTP ' + r.status);
    return { erro: 'ga4', detalhe: String(msg).slice(0, 300), conta: gauth.emailDaConta() };
  }
  // porRef:   { apelido: { 'AAAA-MM-DD': {s: sessoes, u: usuarios, criador, parceiro} } }
  // porCanal: { apelido: { 'AAAA-MM-DD': { canal: sessoes } } }  (canal = ?canal= do link)
  const porRef = {}, porCanal = {};
  for (const l of (r.corpo && r.corpo.rows) || []) {
    const d = (l.dimensionValues || []).map(x => x.value || '');
    const m = (l.metricValues || []).map(x => Number(x.value) || 0);
    const ref = String(d[2] || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (!ref || ref === 'sem_ref' || ref === '(not set)' || ref === 'notset') continue;
    const dia = d[0].length === 8 ? d[0].slice(0, 4) + '-' + d[0].slice(4, 6) + '-' + d[0].slice(6, 8) : d[0];
    const x = ((porRef[ref] = porRef[ref] || {})[dia] = porRef[ref][dia] || { s: 0, u: 0, criador: 0, parceiro: 0 });
    x.s += m[0]; x.u += m[1];
    x[String(d[1]).toLowerCase() === 'criador' ? 'criador' : 'parceiro'] += m[0];
    const canal = String(d[3] || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 12) || 'indicacao';
    const c = ((porCanal[ref] = porCanal[ref] || {})[dia] = porCanal[ref][dia] || {});
    c[canal] = (c[canal] || 0) + m[0];
  }
  return { ok: true, porRef, porCanal };
}

/* ================= entrada ================= */
module.exports = async function (req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const token = await gauth.tokenLeitura();
  if (!token) return responder(res, 503, { erro: 'config' });     // falha FECHADA

  if (req.method === 'GET') {
    const seg = String(process.env.CRIADORES_SECRET || '');
    if (seg) {
      const aut = String(req.headers.authorization || '');
      if (!iguais(aut, 'Bearer ' + seg)) return responder(res, 401, { erro: 'nao_autorizado' });
    }
    const itens = await pecasLiberadas(token);
    if (!itens) return responder(res, 502, { erro: 'leitura' });
    return responder(res, 200, { versao: 1, gerado_em: new Date().toISOString(), itens });
  }

  if (req.method !== 'POST') return responder(res, 405, { erro: 'metodo' });

  let corpo = req.body;
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; } }
  corpo = corpo || {};
  if (corpo.acao !== 'trafego' && corpo.acao !== 'meu_trafego') return responder(res, 400, { erro: 'acao' });

  const uid = await uidDoToken(corpo.idToken);
  if (!uid) return responder(res, 401, { erro: 'token' });

  if (corpo.acao === 'meu_trafego') {
    const p = await lerDoc('parceiros/' + encodeURIComponent(uid), token);
    if (!p) return responder(res, 503, { erro: 'leitura' });
    if (!p.existe || txt(p.f.status) !== 'aprovado') return responder(res, 403, { erro: 'parceiro' });
    const slug = txt(p.f.slug).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (!slug) return responder(res, 200, { ok: true, slug: '', porDia: {} });
    const r = await trafego(400);
    if (r.erro) return responder(res, 200, { erro: r.erro === 'ga4' ? 'ga4' : r.erro });   // sem detalhe tecnico para o parceiro
    return responder(res, 200, { ok: true, slug: slug, porDia: (r.porRef && r.porRef[slug]) || {}, porCanal: (r.porCanal && r.porCanal[slug]) || {} });
  }

  const adm = await lerDoc('admins/' + encodeURIComponent(uid), token);
  if (!adm) return responder(res, 503, { erro: 'leitura' });
  if (!adm.existe) return responder(res, 403, { erro: 'admin' });

  const r = await trafego(400);
  if (r.erro) return responder(res, 200, r);                       // o painel mostra o aviso
  return responder(res, 200, { ok: true, dias: 400, porRef: r.porRef });
};
