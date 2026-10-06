/*!
 * MOVIKI lib/gauth.js | versao 2026-10-06-cerca | antes 2026-09-22-gauth2 | repo: moviki (site publico)
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * O App Check protege o Firestore contra quem NAO e um navegador de verdade.
 * O problema: o proprio site tem duas pecas que falam com o Firestore DE
 * SERVIDOR (api/og.js e api/vitrine.js). Requisicao de servidor nao carrega
 * token de App Check — com o enforcement ligado, elas seriam recusadas e todo
 * link de lojista compartilhado viraria cartao cinza.
 *
 * A SAIDA e falar com o Firestore como CONTA DE SERVICO. Chamada autenticada
 * por conta de servico passa por IAM, nao pela chave publica do app: nao e
 * "cliente", entao o App Check nao se aplica a ela — por definicao, nao por
 * gambiarra.
 *
 * POR QUE NAO O firebase-admin
 * O repo do site nao tem package.json e nao tem node_modules. Puxar o
 * firebase-admin so para LER quatro documentos criaria um passo de instalacao
 * no deploy e engordaria o cold start da unica funcao que serve TODA rota
 * /apelido — a rota de entrada de cada negocio. O que o Admin SDK faz aqui e
 * uma coisa so: assinar um JWT e trocar por um token OAuth. O Node ja sabe
 * assinar RS256 sozinho (modulo crypto). Zero dependencia, zero instalacao.
 *
 * A CONTA DE SERVICO E SOMENTE LEITURA (papel "Visualizador do Cloud
 * Datastore"). NAO e a mesma do moviki-robo: aquela tem escrita total e nao
 * pode chegar perto do repo mais exposto do projeto. Se um dia a env vazar,
 * o estrago maximo e ler o que as regras ja deixam ler.
 *
 * ATENCAO PERMANENTE: conta de servico PASSA POR CIMA das regras do Firestore.
 * Quem usar este modulo so pode ler os documentos que ja lia pelo navegador —
 * nunca colecao de dinheiro, nunca campo que a pagina nao mostra.
 *
 * ENV (projeto Vercel do SITE, Production e Preview):
 *   FIREBASE_SA_LEITURA = JSON inteiro da chave da conta de servico
 * Sem a env, tokenLeitura() devolve string vazia e quem chamou cai sozinho no
 * modo antigo (chave publica). E o que mantem o site no ar enquanto a conta
 * nao existe.
 */
'use strict';

const crypto = require('crypto');

/* O token vale 1 hora. A Vercel reaproveita a mesma instancia entre
   requisicoes, entao guardar aqui evita uma ida ao Google a cada chamada.
   Renova 5 min antes de vencer. Um cache POR ESCOPO (22/09/2026): o token do
   Firestore e o do Google Analytics sao tokens diferentes. */
const ESCOPO_FIRESTORE = 'https://www.googleapis.com/auth/datastore';
const ESCOPO_ANALYTICS = 'https://www.googleapis.com/auth/analytics.readonly';
const caches = {};

function b64url(x) {
  return Buffer.from(x).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function conta() {
  const bruto = process.env.FIREBASE_SA_LEITURA || '';
  if (!bruto.trim()) return null;
  try {
    const sa = JSON.parse(bruto);
    if (!sa || !sa.client_email || !sa.private_key) return null;
    /* Chave colada em variavel de ambiente as vezes chega com \n literais. */
    sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
    return sa;
  } catch (e) { return null; }
}

function temConta() { return !!conta(); }

/* Devolve um token OAuth para o escopo pedido, ou '' se nao for possivel.
   NUNCA lanca: falhar aqui tem que degradar, nao derrubar a pagina publica. */
async function tokenPara(escopo) {
  const agora = Date.now();
  const cache = caches[escopo];
  if (cache && cache.token && agora < cache.expira) return cache.token;

  const sa = conta();
  if (!sa) return '';

  const seg = Math.floor(agora / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: escopo,
    aud: 'https://oauth2.googleapis.com/token',
    iat: seg,
    exp: seg + 3600
  }));

  let jwt;
  try {
    const assinatura = crypto.createSign('RSA-SHA256')
      .update(cabecalho + '.' + corpo).sign(sa.private_key);
    jwt = cabecalho + '.' + corpo + '.' + b64url(assinatura);
  } catch (e) { return ''; }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer' +
            '&assertion=' + encodeURIComponent(jwt)
    });
    clearTimeout(t);
    if (!r.ok) return '';
    const j = await r.json();
    if (!j || !j.access_token) return '';
    const dura = Math.max(60, (Number(j.expires_in) || 3600) - 300);
    caches[escopo] = { token: j.access_token, expira: agora + dura * 1000 };
    return j.access_token;
  } catch (e) { return ''; }
}

/* Leitura do Firestore — o mesmo de sempre (og.js, vitrine.js, live.js). */
function tokenLeitura() { return tokenPara(ESCOPO_FIRESTORE); }

/* Leitura do Google Analytics 4 (22/09/2026, api/criadores.js). So funciona
   depois que o e-mail da conta de servico for adicionado como LEITOR na
   propriedade do GA4 e a "Google Analytics Data API" estiver ativada no
   projeto do Google Cloud. Sem isso, o GA4 responde 403 e quem chamou avisa. */
function tokenAnalytics() { return tokenPara(ESCOPO_ANALYTICS); }

function emailDaConta() { const sa = conta(); return sa ? sa.client_email : ''; }

/* =====================================================================
 * CERCA DA CONTA DE LEITURA — 06/10/2026 (plano de seguranca 2.5)
 *
 * A conta de servico enxerga o banco inteiro (o Google nao tem permissao por
 * colecao). Esta cerca e a lista FECHADA do que o site pode ler. Toda leitura
 * do Firestore feita pelas funcoes do site passa por cerca(url, corpo) antes
 * do fetch: caminho fora da lista lanca erro, a leitura nao acontece e sai um
 * aviso no log (e no Telegram, se as envs existirem no projeto do site).
 * Colecao nova que o site precise ler entra AQUI, de proposito, em PR.
 * ===================================================================== */
const CERCA_PROJETO = 'moviki-app';
// colecoes de primeiro nivel: documento inteiro pode ser lido
const CERCA_COLECOES = new Set(['negocios', 'slugs', 'ponto_slugs', 'pontos', 'assinaturas',
  'live_sessoes', 'live_bloqueios', 'admins', 'parceiros', 'criador_pecas', 'parceiros_publicos']);
// subcaminhos permitidos dentro de um documento (colecao -> lista de "sub/doc")
const CERCA_SUB = { negocios: new Set(['estado/live', 'estado/liveSessao', 'estado/liveAceite', 'resumo/avaliacoes']) };
// documentos unicos permitidos em colecoes de configuracao
const CERCA_DOCS = new Set(['configuracoes/liveTermos']);
// colecoes que podem ser consultadas por runQuery
const CERCA_QUERY = new Set(['negocios', 'live_sessoes', 'criador_pecas']);

function cercaAvisar(motivo) {
  console.error('[gauth] CERCA DE LEITURA barrou:', motivo);
  const TOKEN = process.env.TELEGRAM_TOKEN, CHAT = process.env.TELEGRAM_CHAT_ID;
  if (!TOKEN || !CHAT) return;
  try {
    fetch('https://api.telegram.org/bot' + TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: '\u26a0 Site tentou ler fora da cerca: ' + motivo }),
    }).catch(function () {});
  } catch (_) {}
}

/* Lanca Error('cerca_leitura') quando a leitura nao e permitida. Nao e
   Firestore (ex.: Analytics) -> passa sem conferir. */
function cerca(url, corpo) {
  let u;
  try { u = new URL(String(url)); } catch (_) { throw new Error('cerca_leitura: url invalida'); }
  if (u.hostname !== 'firestore.googleapis.com') return true;
  const m = /^\/v1\/projects\/([^/]+)\/databases\/\(default\)\/documents(:[A-Za-z]+)?(?:\/(.*))?$/.exec(u.pathname);
  if (!m || m[1] !== CERCA_PROJETO) { cercaAvisar('projeto/caminho estranho ' + u.pathname); throw new Error('cerca_leitura'); }
  const operacao = m[2] || '';
  const resto = decodeURIComponent(m[3] || '');
  if (operacao && operacao !== ':runQuery' && operacao !== ':runAggregationQuery') { cercaAvisar('operacao nao prevista ' + operacao); throw new Error('cerca_leitura'); }

  if (operacao) {   // :runQuery ou :runAggregationQuery (contagem): mesma lista de colecoes
    let q = corpo;
    if (typeof q === 'string') { try { q = JSON.parse(q); } catch (_) { q = null; } }
    const sq = q && (q.structuredQuery || (q.structuredAggregationQuery && q.structuredAggregationQuery.structuredQuery));
    const from = (sq && sq.from) || [];
    if (!from.length) { cercaAvisar('runQuery sem colecao'); throw new Error('cerca_leitura'); }
    for (const f of from) {
      if (!f || !CERCA_QUERY.has(String(f.collectionId)) || f.allDescendants) {
        cercaAvisar('runQuery em ' + (f && f.collectionId)); throw new Error('cerca_leitura');
      }
    }
    if (sq.parent || q.parent) { cercaAvisar('runQuery com parent'); throw new Error('cerca_leitura'); }
    return true;
  }

  if (resto.indexOf(':') >= 0 || resto === '') { cercaAvisar('operacao nao prevista ' + resto); throw new Error('cerca_leitura'); }
  const seg = resto.replace(/^\/+/, '').split('/').filter(Boolean);
  const col = seg[0];
  if (seg.length === 1) { cercaAvisar('listagem de colecao ' + col); throw new Error('cerca_leitura'); }   // GET na colecao = listar tudo
  if (seg.length === 2) {
    if (CERCA_COLECOES.has(col) || CERCA_DOCS.has(col + '/' + seg[1])) return true;
    cercaAvisar(col + '/' + seg[1]); throw new Error('cerca_leitura');
  }
  if (seg.length === 4 && CERCA_COLECOES.has(col) && CERCA_SUB[col] && CERCA_SUB[col].has(seg[2] + '/' + seg[3])) return true;
  cercaAvisar(resto); throw new Error('cerca_leitura');
}

module.exports = { tokenLeitura, tokenAnalytics, temConta, emailDaConta, cerca };
