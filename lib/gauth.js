/*!
 * MOVIKI lib/gauth.js | versao 2026-09-22-gauth2 | repo: moviki (site publico)
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

module.exports = { tokenLeitura, tokenAnalytics, temConta, emailDaConta };
