/*!
 * MOVIKI api/live.js | versao 2026-09-15-b5a | repo: moviki (site publico)
 *
 * O QUE ESTE ARQUIVO FAZ
 * E a PORTA do Modo Live. O lojista aperta "Entrar ao vivo" no estudio
 * (app.moviki.com.br/live.html); o estudio manda o idToken do Firebase para
 * ca; este endpoint:
 *   1. confere o token (assinatura RS256 do Google, sem firebase-admin);
 *   2. le assinaturas/{uid} com a conta de servico SO-LEITURA (lib/gauth.js);
 *   3. decide o nivel da live pelo plano — premium, enterprise ou nenhum;
 *   4. cria (uma vez) ou reaproveita a entrada de live do lojista no
 *      Cloudflare Stream e devolve o endereco de transmissao (WHIP) e o de
 *      reproducao (WHEP).
 *
 * POR QUE A PORTA E AQUI, E NAO NA TELA
 * Regra de ouro: gate que afeta dinheiro nao existe so na UI. Cada minuto de
 * live assistido e pago pelo Moviki ao Cloudflare. Sem este endpoint o
 * lojista nao tem endereco de transmissao nenhum — o plano e conferido no
 * servidor, a partir de um documento que so o robo escreve.
 *
 * O ENDERECO WHIP E SEGREDO. Quem tem ele transmite na entrada daquele
 * lojista. So sai daqui para o dono da conta, conferido pelo token. O WHEP
 * (reproducao) e publico por natureza e vai para o Firestore.
 *
 * TETO DE FUNCOES: a regra dos 12 e do projeto moviki-robo. O projeto
 * Vercel do SITE passa a usar 3 (og, vitrine, live).
 *
 * SEGURANCA (rodada de 11/09, tarde) — o 'iniciar' so entrega o endereco se:
 *   - o lojista NAO esta bloqueado (live_bloqueios/{uid}, escrito pelo dono);
 *   - ele aceitou a versao vigente das Regras da Live
 *     (negocios/{uid}/estado/liveAceite.versao == ACEITE_VERSAO);
 *   - titulo e produtos nao batem na lista de termos proibidos.
 * E o dono do Moviki tem 'adm_encerrar': apaga a entrada de video do lojista no
 * Cloudflare — a transmissao cai na hora, mesmo que ele tente religar pelo
 * console. Admin conferido em admins/{uid}, lido no servidor.
 *
 * ENV (projeto Vercel do SITE, Production):
 *   CF_ACCOUNT_ID    = id da conta Cloudflare (painel > lado direito)
 *   CF_STREAM_TOKEN  = token de API com permissao Conta > Stream > Editar
 *   FIREBASE_SA_LEITURA  (ja existe desde 04/09 — lib/gauth.js)
 *   LIVE_ORIGENS     = opcional; lista separada por virgula. Padrao abaixo.
 * Sem CF_*, responde 503 {erro:'config'} — falha FECHADA, nunca aberta.
 */
'use strict';

const crypto = require('crypto');
const gauth = require('../lib/gauth');

const PROJ = 'moviki-app';
const BASE_REST = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents';
const CERTS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CF_API = 'https://api.cloudflare.com/client/v4/accounts/';
const ACEITE_VERSAO = '1.0';   // mudou o texto das Regras da Live -> sobe aqui, no estudio e na pagina de regras

  /* ---- FILTRO DE CONTEUDO DA LIVE — 11/09/2026 ----
     Mesma lista, byte a byte, em 4 lugares: estudio (moviki-app/live.html),
     pagina publica (moviki/live.html), painel do dono (eikoadm01.html) e
     servidor (moviki/api/live.js). A fonte e uma so; mudou aqui, muda nos 4.
     Termos EXTRAS o dono cadastra no painel (configuracoes/liveTermos) sem
     precisar de deploy. Filtro de palavra nao pega tudo: e a primeira
     barreira. As outras sao o aceite das regras, a denuncia e o botao de
     encerrar do dono. */
  const MV_TERMOS={"grupos":{"drogas":["maconha","cocaina","crack","oxi","lsd","ecstasy","mdma","haxixe","skunk","heroina","ketamina","lanca perfume","cogumelo magico","cogumelos magicos","psilocibina","thc","cbd","entorpecente","entorpecentes"],"armas":["arma de fogo","armas de fogo","pistola","pistolas","revolver","revolveres","fuzil","fuzis","espingarda","espingardas","carabina","metralhadora","submetralhadora","municao","municoes","simulacro","explosivo","explosivos","dinamite","granada","soco ingles","taser","arma de choque","spray de pimenta","silenciador"],"sexual":["sexo","porno","pornografia","conteudo adulto","nude","nudes","pack de fotos","acompanhante","acompanhantes","garota de programa","garoto de programa","programa sexual","onlyfans","xvideos","sexo ao vivo","erotico","erotica","sex shop","vibrador","novinha","novinhas"],"medicamentos":["anabolizante","anabolizantes","esteroide","esteroides","sibutramina","ozempic","mounjaro","semaglutida","tirzepatida","tarja preta","receita controlada","rivotril","clonazepam","ritalina","zolpidem","viagra","cytotec","misoprostol","abortivo"],"tabaco":["vape","vapes","pod descartavel","cigarro eletronico","cigarros eletronicos","juul","cigarro","cigarros","tabaco"],"fraude":["dinheiro falso","nota falsa","notas falsas","cedula falsa","cartao clonado","cartoes clonados","documento falso","cnh falsa","rg falso","diploma falso","atestado falso","conta hackeada","dados de cartao","roubado","roubada","roubados","furtado","furtada"],"apostas":["bet365","rifa","rifas","sorteio","sorteios","jogo do bicho","aposta","apostas","bet","cassino","tigrinho","fortune tiger","bingo"],"animais":["animal silvestre","animais silvestres","trafico de animais"],"golpe":["piramide financeira","renda garantida","lucro garantido","dinheiro facil"]},"excecoes":["pistola de agua","pistola de cola","pistola de pintura","pistola de ar","pistola de solda","sexo do bebe","beijo roubado","beijos roubados","bingo de sabores"]};
  let MV_TERMOS_EXTRAS=[];
  const MV_LEET={'0':'o','@':'a','4':'a','1':'i','!':'i','3':'e','$':'s'};
  /* digito vira letra so ENTRE letras (c0caina -> cocaina), sem estragar bet365 */
  function mvNormaliza(s){return (' '+String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/([a-z])([0@41!3$]+)(?=[a-z]|[^a-z0-9]|$)/g,(m,a,d)=>a+d.split('').map(c=>MV_LEET[c]).join('')).replace(/[^a-z0-9]+/g,' ')+' ');}
  function mvProibido(s){
    let n=mvNormaliza(s);
    MV_TERMOS.excecoes.forEach(e=>{n=n.split(' '+e+' ').join(' ');});
    for(const g in MV_TERMOS.grupos)for(const t of MV_TERMOS.grupos[g])if(n.includes(' '+t+' '))return {grupo:g,termo:t};
    for(const t of MV_TERMOS_EXTRAS){const x=mvNormaliza(t).trim();if(x&&n.includes(' '+x+' '))return {grupo:'extra',termo:x};}
    return null;
  }



/* O que cada nivel libera. O estudio desenha as ferramentas a partir desta
   lista, e a pagina publica confere o plano de novo antes de mostrar as do
   Enterprise. Mudar aqui muda nos dois lugares. */
const NIVEIS = {
  premium: {
    nivel: 'premium', limiteMin: 60, sacolaMax: 5,
    ferramentas: ['transmitir', 'destaque', 'sacola', 'chat', 'assistindo', 'agendar', 'compartilhar']
  },
  enterprise: {
    nivel: 'enterprise', limiteMin: 180, sacolaMax: 20,
    ferramentas: ['transmitir', 'destaque', 'sacola', 'chat', 'assistindo', 'agendar', 'compartilhar',
                  'oferta', 'estoque', 'cupom', 'brinde', 'fila', 'dados', 'cortes', 'local']
  }
};

function origens() {
  const env = String(process.env.LIVE_ORIGENS || '').split(',').map(s => s.trim()).filter(Boolean);
  return env.length ? env : ['https://app.moviki.com.br', 'https://moviki.com.br', 'https://www.moviki.com.br'];
}

function cors(req, res) {
  const o = req.headers.origin || '';
  if (origens().indexOf(o) >= 0) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function responder(res, cod, obj) {
  res.statusCode = cod;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

/* ---------------- 1. conferencia do idToken ---------------- */
let certCache = { mapa: null, expira: 0 };

async function certificados() {
  const agora = Date.now();
  if (certCache.mapa && agora < certCache.expira) return certCache.mapa;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(CERTS, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const mapa = await r.json();
    const cc = r.headers.get('cache-control') || '';
    const m = /max-age=(\d+)/.exec(cc);
    const dura = m ? Math.max(300, Number(m[1])) : 3600;
    certCache = { mapa, expira: agora + dura * 1000 };
    return mapa;
  } catch (e) { clearTimeout(t); return null; }
}

function b64urlBuf(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/* Devolve o uid, ou '' se o token nao e valido. Nunca lanca. */
async function uidDoToken(tk) {
  try {
    const partes = String(tk || '').split('.');
    if (partes.length !== 3) return '';
    const cab = JSON.parse(b64urlBuf(partes[0]).toString('utf8'));
    const corpo = JSON.parse(b64urlBuf(partes[1]).toString('utf8'));
    if (cab.alg !== 'RS256' || !cab.kid) return '';
    const certs = await certificados();
    if (!certs || !certs[cab.kid]) return '';
    const ok = crypto.createVerify('RSA-SHA256')
      .update(partes[0] + '.' + partes[1])
      .verify(certs[cab.kid], b64urlBuf(partes[2]));
    if (!ok) return '';
    const agora = Math.floor(Date.now() / 1000);
    if (corpo.aud !== PROJ) return '';
    if (corpo.iss !== 'https://securetoken.google.com/' + PROJ) return '';
    if (!corpo.exp || corpo.exp < agora) return '';
    if (corpo.iat && corpo.iat > agora + 300) return '';
    if (typeof corpo.sub !== 'string' || !corpo.sub || corpo.sub.length > 128) return '';
    return corpo.sub;
  } catch (e) { return ''; }
}

/* ---------------- 2. plano, lido no servidor ---------------- */
async function lerAssinatura(uid) {
  const token = await gauth.tokenLeitura();
  if (!token) return { erro: 'sa' };             // sem conta de servico: fecha
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(BASE_REST + '/assinaturas/' + encodeURIComponent(uid), {
      signal: ctrl.signal, headers: { Authorization: 'Bearer ' + token }
    });
    clearTimeout(t);
    if (r.status === 404) return { doc: null };
    if (!r.ok) return { erro: 'firestore' };
    const j = await r.json();
    return { doc: (j && j.fields) || {} };
  } catch (e) { clearTimeout(t); return { erro: 'firestore' }; }
}

/* Le um documento qualquer pela conta de servico e devolve os campos ja
   convertidos para JS comum, ou null. Nunca lanca. */
function valorRest(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(valorRest);
  if ('mapValue' in v) { const o = {}; const f = (v.mapValue && v.mapValue.fields) || {}; for (const k in f) o[k] = valorRest(f[k]); return o; }
  return null;
}
async function lerDoc(caminho) {
  const token = await gauth.tokenLeitura();
  if (!token) return { erro: 'sa' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(BASE_REST + '/' + caminho, { signal: ctrl.signal, headers: { Authorization: 'Bearer ' + token } });
    clearTimeout(t);
    if (r.status === 404) return { doc: null };
    if (!r.ok) return { erro: 'firestore' };
    const j = await r.json();
    const o = {}; const f = (j && j.fields) || {};
    for (const k in f) o[k] = valorRest(f[k]);
    return { doc: o };
  } catch (e) { clearTimeout(t); return { erro: 'firestore' }; }
}

/* Mesma conta do painel (carregarPlanoPainel): ativo === true e nao vencido.
   Teste gratis conta como Premium na live — decisao de 11/09. */
function nivelDaAssinatura(f) {
  if (!f) return null;
  const ativo = f.ativo && f.ativo.booleanValue === true;
  if (!ativo) return null;
  const vence = f.vence_em && f.vence_em.timestampValue ? Date.parse(f.vence_em.timestampValue) : 0;
  if (vence && vence < Date.now()) return null;
  const plano = (f.plano && f.plano.stringValue) || '';
  const periodo = (f.periodo && f.periodo.stringValue) || '';
  if (plano === 'enterprise') return NIVEIS.enterprise;
  if (plano === 'premium') return NIVEIS.premium;
  if (periodo === 'trial') return NIVEIS.premium;
  return null;
}

/* Periodo da assinatura, para a cota do teste gratis saber quem e quem.
   Mesma leitura que nivelDaAssinatura ja fez — nao custa chamada nova. */
function periodoDaAssinatura(f) {
  if (!f) return '';
  return (f.periodo && f.periodo.stringValue) || '';
}

/* ===========================================================================
   O FREIO — achado B5 da auditoria de 15/09

   Este arquivo nao tinha limite de chamadas. Um lojista rodando `iniciar` em
   laco fazia, a cada erro de cache, um GET da LISTA INTEIRA de entradas do
   Cloudflare. Estourado o teto do token da conta, o Cloudflare responde 429 e
   **NENHUM lojista consegue comecar uma live** — um uid derrubando o Modo Live
   inteiro, com a fatura do Firestore subindo junto.

   Duas barreiras, nesta ordem:
     1. AQUI, em memoria da instancia: a rajada do mesmo processo morre sem
        custar leitura nenhuma;
     2. no robo (`live_reservar`, em live_throttle/{uid}): contador duravel que
        pega a rajada espalhada por varias instancias frias da Vercel — que a
        barreira 1, sozinha, nao pegaria.

   E as duas rodam ANTES do Cloudflare.
=========================================================================== */
/* AJUSTE de 15/09, depois do teste no ar: a versao anterior era 1 tentativa a
   cada 20 s, seca. O teste real pegou o caso legitimo — live de 10 segundos,
   encerrou, tentou de novo e levou freio. Reabrir depois de encerrar e uso
   normal, nao laco.
   Agora a janela permite um PEQUENO SURTO (2 tentativas) antes de segurar, e o
   `live_fechar` zera o contador de minuto do lado do robo. O laco continua
   morrendo: a 3a tentativa seguida ja para aqui, de graca. */
const MEM_JANELA_MS = 20000;        // janela do surto, por uid, por instancia
const MEM_SURTO = 2;                // tentativas livres dentro da janela
let memFreio = new Map();           // uid -> { desde, n }

function freioMemoria(uid) {
  const agora = Date.now();
  /* Limpeza barata: a instancia e efemera, mas um laco com uid variavel faria o
     mapa crescer. Acima de 500, joga fora o que ja venceu. */
  if (memFreio.size > 500) {
    for (const [k, v] of memFreio) if (agora - v.desde > MEM_JANELA_MS) memFreio.delete(k);
    if (memFreio.size > 2000) memFreio = new Map();
  }
  const r = memFreio.get(uid);
  if (!r || (agora - r.desde) > MEM_JANELA_MS) {
    memFreio.set(uid, { desde: agora, n: 1 });
    return 0;                                          // livre
  }
  if (r.n < MEM_SURTO) { r.n++; return 0; }            // ainda no surto
  return Math.max(1, Math.ceil((MEM_JANELA_MS - (agora - r.desde)) / 1000));
}

/* Fala com o robo (Admin SDK). O segredo compartilhado vive em LIVE_SEGREDO,
   cadastrado NOS DOIS projetos com a mesma string. */
const ROBO_URL = process.env.ROBO_URL || 'https://moviki-robo.vercel.app/api/pontos';

async function chamarRobo(acao, dados) {
  const segredo = process.env.LIVE_SEGREDO || '';
  if (segredo.length < 20) {
    console.error('live: LIVE_SEGREDO ausente ou curta — live nao abre (falha fechada)');
    return { ok: false, erro: 'config' };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(ROBO_URL, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-moviki-live': segredo },
      body: JSON.stringify({ acao, dados }),
    });
    clearTimeout(t);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) {
      console.error('live: robo recusou', acao, r.status, j && j.erro);
      return { ok: false, erro: (j && j.erro) || 'robo', usadas: j && j.usadas, cota: j && j.cota, escala: j && j.escala, teto: j && j.teto };
    }
    return j;
  } catch (e) {
    clearTimeout(t);
    console.error('live: robo nao respondeu', String(e));
    return { ok: false, erro: 'rede' };
  }
}

/* ---------------- 3. Cloudflare Stream ---------------- */
async function cf(caminho, opcoes) {
  const conta = process.env.CF_ACCOUNT_ID, tok = process.env.CF_STREAM_TOKEN;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(CF_API + conta + '/stream' + caminho, Object.assign({
      signal: ctrl.signal,
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }
    }, opcoes || {}));
    clearTimeout(t);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.success === false) {
      console.error('live: cloudflare', r.status, JSON.stringify(j && j.errors || j).slice(0, 400));
      return null;
    }
    return j.result;
  } catch (e) { clearTimeout(t); console.error('live: cloudflare falhou', String(e)); return null; }
}

/* Uma entrada por lojista, reaproveitada para sempre. O nome carrega o uid
   para que ela seja reencontrada sem gravar nada no Firestore (a conta de
   servico daqui e so leitura, de proposito). A lista fica em memoria da
   instancia por 10 min. */
let listaCache = { mapa: null, expira: 0 };

async function acharEntrada(nome) {
  if (listaCache.mapa && Date.now() < listaCache.expira && listaCache.mapa[nome]) return listaCache.mapa[nome];
  const r = await cf('/live_inputs', { method: 'GET' });
  if (!r) return null;
  const itens = Array.isArray(r) ? r : (r.liveInputs || []);
  const mapa = {};
  itens.forEach(i => { const n = i && i.meta && i.meta.name; if (n) mapa[n] = i.uid; });
  listaCache = { mapa, expira: Date.now() + 600000 };
  return mapa[nome] || '';
}

function enderecos(ent) {
  const whip = ent && ent.webRTC && ent.webRTC.url;
  const whep = ent && ent.webRTCPlayback && ent.webRTCPlayback.url;
  if (!whip || !whep) return null;
  if (!/^https:\/\/customer-[a-z0-9]+\.cloudflarestream\.com\/[A-Za-z0-9]+\/webRTC\/publish$/.test(whip)) return null;
  if (!/^https:\/\/customer-[a-z0-9]+\.cloudflarestream\.com\/[a-f0-9]{32}\/webRTC\/play$/.test(whep)) return null;
  /* 15/09/2026: o id da entrada sobe junto. Sem ele, encerrar uma live obriga a
     listar a conta inteira do Cloudflare e a adivinhar pelo meta.name — que foi
     como nasceram as entradas duplicadas do achado B6. */
  return { whip, whep, entradaId: (ent && ent.uid) || '' };
}

async function entradaDoLojista(uid, idConhecido) {
  const nome = 'mv-' + uid;
  /* CAMINHO BARATO: o robo guarda o id da entrada em live_sessoes/{uid}. Com
     ele, uma leitura direta (`GET /live_inputs/{id}`) resolve — e a listagem da
     conta inteira, que era a chamada cara do achado B5, deixa de acontecer no
     caminho normal. So cai na listagem quem nunca fez live. */
  if (idConhecido && /^[a-f0-9]{16,64}$/i.test(idConhecido)) {
    const direto = await cf('/live_inputs/' + idConhecido, { method: 'GET' });
    const e = direto && enderecos(direto);
    if (e) return e;
  }
  const achado = await acharEntrada(nome);
  if (achado === null) return null;               // Cloudflare fora: nao cria duplicata
  let ent = null;
  if (achado) ent = await cf('/live_inputs/' + achado, { method: 'GET' });
  if (!ent) {
    ent = await cf('/live_inputs', {
      method: 'POST',
      body: JSON.stringify({ meta: { name: nome }, recording: { mode: 'off' } })
    });
    if (ent && ent.uid && listaCache.mapa) listaCache.mapa[nome] = ent.uid;
    if (ent && ent.uid && !enderecos(ent)) ent = await cf('/live_inputs/' + ent.uid, { method: 'GET' });
  }
  return enderecos(ent);
}

/* ---------------- handler ---------------- */
module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return responder(res, 405, { erro: 'metodo' });

  let corpo = req.body;
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; } }
  corpo = corpo || {};

  const uid = await uidDoToken(corpo.idToken);
  if (!uid) return responder(res, 401, { erro: 'token' });

  /* ---- acoes do DONO do Moviki ---- */
  if (corpo.acao === 'adm_encerrar') {
    const adm = await lerDoc('admins/' + encodeURIComponent(uid));
    if (adm.erro) return responder(res, 503, { erro: adm.erro });
    if (!adm.doc) return responder(res, 403, { erro: 'nao_admin' });
    const alvo = String(corpo.uid || '');
    if (!/^[A-Za-z0-9]{10,128}$/.test(alvo)) return responder(res, 400, { erro: 'uid' });
    if (!process.env.CF_ACCOUNT_ID || !process.env.CF_STREAM_TOKEN) return responder(res, 503, { erro: 'config' });
    listaCache = { mapa: null, expira: 0 };
    const idEntrada = await acharEntrada('mv-' + alvo);
    if (idEntrada === null) return responder(res, 502, { erro: 'cloudflare' });
    if (idEntrada) {
      const del = await cf('/live_inputs/' + idEntrada, { method: 'DELETE' });
      if (del === null) return responder(res, 502, { erro: 'cloudflare' });
    }
    listaCache = { mapa: null, expira: 0 };
    console.log('live: encerrada pelo dono', alvo, 'por', uid);
    return responder(res, 200, { ok: true, entradaApagada: !!idEntrada });
  }

  const a = await lerAssinatura(uid);
  if (a.erro) return responder(res, 503, { erro: a.erro });
  const nivel = nivelDaAssinatura(a.doc);
  if (!nivel) return responder(res, 403, { erro: 'plano', mensagem: 'A live faz parte dos planos Premium e Enterprise.' });

  /* acao 'nivel': so diz o que o plano libera (abre o estudio sem gastar nada). */
  if (corpo.acao === 'nivel') return responder(res, 200, { ok: true, nivel: nivel.nivel, limiteMin: nivel.limiteMin, sacolaMax: nivel.sacolaMax, ferramentas: nivel.ferramentas });

  if (corpo.acao !== 'iniciar') return responder(res, 400, { erro: 'acao' });
  if (!process.env.CF_ACCOUNT_ID || !process.env.CF_STREAM_TOKEN) return responder(res, 503, { erro: 'config' });

  /* BARREIRA 1 — memoria desta instancia. Nao custa leitura nenhuma. */
  const esperaMem = freioMemoria(uid);
  if (esperaMem) {
    return responder(res, 429, {
      erro: 'freio', esperaSeg: esperaMem,
      mensagem: 'Espere ' + esperaMem + ' segundos antes de tentar de novo.',
    });
  }

  /* ---- portas de seguranca, todas lidas NO SERVIDOR ---- */
  const [bl, ac, es, te] = await Promise.all([
    lerDoc('live_bloqueios/' + uid),
    lerDoc('negocios/' + uid + '/estado/liveAceite'),
    lerDoc('negocios/' + uid + '/estado/live'),
    lerDoc('configuracoes/liveTermos'),
  ]);
  if (bl.erro || ac.erro || es.erro) return responder(res, 503, { erro: 'firestore' });

  /* Chave-mestra: o dono desliga TODA live pelo painel, sem deploy e sem mexer
     em env. Falha FECHADA de proposito — se o documento nao pode ser lido, a
     leitura ja devolveu erro acima. */
  if (te.doc && te.doc.liveDesligada === true) {
    return responder(res, 403, { erro: 'desligada', mensagem: 'As transmissoes ao vivo estao temporariamente desligadas para manutencao.' });
  }

  /* Lista de liberacao (beta fechado). Regra: lista VAZIA ou ausente = live
     aberta a todo mundo. Lista com pelo menos um uid = so esses transmitem.
     E o que deixa o modulo subir inteiro sem nenhum lojista ver. */
  const beta = (te.doc && Array.isArray(te.doc.liveBeta)) ? te.doc.liveBeta.filter((x) => typeof x === 'string') : [];
  if (beta.length && beta.indexOf(uid) < 0) {
    return responder(res, 403, { erro: 'beta', mensagem: 'A live ainda esta em preparacao e sera liberada em breve.' });
  }

  if (bl.doc) {
    const ate = bl.doc.ate || 0;
    if (!ate || ate > Date.now()) return responder(res, 403, { erro: 'bloqueado', ate: ate || null, motivo: String(bl.doc.motivo || '').slice(0, 200) });
  }
  if (!ac.doc || ac.doc.versao !== ACEITE_VERSAO) return responder(res, 403, { erro: 'aceite', versao: ACEITE_VERSAO });
  MV_TERMOS_EXTRAS = (te.doc && Array.isArray(te.doc.extras)) ? te.doc.extras.filter(x => typeof x === 'string').slice(0, 300) : [];
  const est = es.doc || {};
  const textos = [String(corpo.titulo || ''), String(est.titulo || '')]
    .concat((Array.isArray(corpo.produtos) ? corpo.produtos : []).slice(0, 40).map(String))
    .concat((Array.isArray(est.sacola) ? est.sacola : []).map(x => x && x.nome ? String(x.nome) : ''))
    .concat(est.fixado && est.fixado.nome ? [String(est.fixado.nome)] : []);
  for (const t of textos) {
    const p = mvProibido(t);
    if (p) return responder(res, 403, { erro: 'conteudo', termo: p.termo, grupo: p.grupo, texto: t.slice(0, 60) });
  }

  /* BARREIRA 2 — freio duravel e cota, no robo, ANTES do Cloudflare.
     Contar a cota so depois (como era ate aqui) deixava a entrada do Cloudflare
     ja criada quando a cota estava estourada. */
  const reserva = await chamarRobo('live_reservar', { uid, periodo: periodoDaAssinatura(a.doc) });
  if (!reserva.ok) {
    if (reserva.erro === 'cota') {
      return responder(res, 403, {
        erro: 'cota', usadas: reserva.usadas || 0, cota: reserva.cota || 0,
        mensagem: 'Voce ja usou as lives do periodo de teste. Assinando, a quantidade deixa de ter limite.',
      });
    }
    if (reserva.erro === 'freio') {
      return responder(res, 429, {
        erro: 'freio', escala: reserva.escala || '', teto: reserva.teto || 0,
        esperaSeg: reserva.esperaSeg || 60,
        mensagem: 'Muitas tentativas seguidas. Espere um pouco e tente de novo.',
      });
    }
    return responder(res, 503, { erro: 'sessao', mensagem: 'Nao consegui abrir a live agora. Tente de novo.' });
  }

  const e = await entradaDoLojista(uid, reserva.entradaId);
  if (!e) return responder(res, 502, { erro: 'cloudflare' });

  /* ---- A SESSAO NASCE NO SERVIDOR ----
     Ate 15/09/2026 quem escrevia "estou no ar" e "toque este video" era o
     navegador do lojista, em negocios/{uid}/estado/live — documento que ele
     escreve livremente. Com isso, um lojista em teste gratis copiava o `whep`
     de uma live de verdade (negocios/* e read:true) e retransmitia a imagem
     alheia na propria pagina, com o proprio WhatsApp e o proprio Pix, sem
     aceite, sem beta e sem filtro (auditoria de 15/09, achado A2).

     Agora o endereco do video e o estado "no ar" sao gravados pelo ROBO, em
     estado/liveSessao, que nas regras e `write: if false` para o cliente. Esta
     funcao aqui nao grava nada: a conta de servico e so de leitura, de
     proposito, e continua assim.

     FALHA FECHADA: se o robo nao confirmar, a live NAO comeca. Sessao sem dono
     no servidor e exatamente o buraco que estamos fechando — melhor o lojista
     ver "tente de novo" do que voltar a ter um estado que so ele escreve. */
  const sessao = await chamarRobo('live_abrir', {
    uid, whep: e.whep, entradaId: e.entradaId,
    nivel: nivel.nivel, limiteMin: nivel.limiteMin,
    periodo: periodoDaAssinatura(a.doc),
    jaReservado: true,          /* a cota ja andou no live_reservar */
  });
  if (!sessao.ok) {
    return responder(res, 503, { erro: 'sessao', mensagem: 'Nao consegui abrir a live agora. Tente de novo.' });
  }

  return responder(res, 200, {
    ok: true, nivel: nivel.nivel, limiteMin: nivel.limiteMin, sacolaMax: nivel.sacolaMax,
    ferramentas: nivel.ferramentas, whip: e.whip, whep: e.whep,
    sessaoId: sessao.sessaoId || '',
    restam: (reserva.restam == null ? null : reserva.restam), cota: reserva.cota || null,
  });
};
