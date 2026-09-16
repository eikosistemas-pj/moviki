/*!
 * MOVIKI api/live.js | versao 2026-09-16-tetoplano | repo: moviki (site publico)
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
const CF_GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';

/* ================= TETO DE VIDEO (16/09/2026) =================
   O Cloudflare Stream NAO tem teto de gasto. "Budget alerts" existem em
   Manage Account > Billing > Billable Usage, mas a propria documentacao diz
   que sao informativos: nao pausam nem limitam nada. O preco e por minuto
   ENTREGUE (US$ 1 por 1.000), ou seja, espectadores x duracao. Uma live de
   3 horas com 500 conexoes custa US$ 90 — e nao precisa ser ataque: basta dar
   certo.
   Entao a parede e aqui. O consumo real vem da analytics do proprio
   Cloudflare (dataset streamMinutesViewedAdaptiveGroups), medido no maximo
   uma vez a cada 15 minutos por instancia, e comparado com o teto que o dono
   escreve no painel (configuracoes/liveTermos.tetoMinutosMes).
   Teto ausente ou zero = SEM teto, igual a lista do beta vazia.

   ESTA TRAVA FALHA ABERTA, DE PROPOSITO — e a unica do projeto que falha
   assim. Se a analytics nao responder, a live COMECA. Derrubar a
   transmissao de todo mundo porque uma API de RELATORIO esteve fora seria
   trocar um risco de conta por uma parada de produto. O painel do dono
   mostra quando a medicao esta velha; a chave-mestra continua sendo o botao
   de emergencia.

   O token precisa da permissao Account Analytics, alem de Stream Editar. Sem
   ela a medicao volta com erro e o painel diz exatamente isso. */
const CONSUMO_TTL_MS = 900000;
let consumoCache = { em: 0, mes: 0, semana: 0, erro: 'nunca', desde: '', ciclo: 0 };

function diaUTC(d) { return new Date(d).toISOString().slice(0, 10); }

/* O ciclo de faturamento do Cloudflare NAO e o mes-calendario: ele comeca no
   dia em que a conta assinou (na conta do Moviki, dia 12). Medir de 01 ate
   hoje deixaria o teto 11 dias fora de fase com a fatura — nos primeiros dias
   do mes o contador zerava enquanto o dinheiro continuava correndo.
   O dia da virada fica em configuracoes/liveTermos.cicloDia (padrao 1), e o
   dono ve e edita esse numero no painel. Teto de 28 para nao quebrar em
   fevereiro. */
function inicioDoCiclo(diaVirada) {
  const d = Math.max(1, Math.min(28, Number(diaVirada) || 1));
  const hoje = new Date();
  let ano = hoje.getUTCFullYear(), mes = hoje.getUTCMonth();
  if (hoje.getUTCDate() < d) { mes -= 1; if (mes < 0) { mes = 11; ano -= 1; } }
  return diaUTC(Date.UTC(ano, mes, d));
}

async function medirConsumo(cicloDia) {
  const ciclo = Math.max(1, Math.min(28, Number(cicloDia) || 1));
  /* trocar o dia do ciclo muda a janela: a medicao antiga nao vale mais */
  if (consumoCache.em && consumoCache.ciclo === ciclo && Date.now() - consumoCache.em < CONSUMO_TTL_MS) return consumoCache;
  const conta = process.env.CF_ACCOUNT_ID, tok = process.env.CF_STREAM_TOKEN;
  if (!conta || !tok) { consumoCache = { em: Date.now(), mes: 0, semana: 0, erro: 'config', desde: '', ciclo: ciclo }; return consumoCache; }
  const primeiro = inicioDoCiclo(ciclo);
  const amanha = diaUTC(Date.now() + 86400000);
  const seteDias = diaUTC(Date.now() - 6 * 86400000);
  const query = 'query($t:string!,$m:Date,$s:Date,$f:Date){viewer{accounts(filter:{accountTag:$t}){'
    + 'mes:streamMinutesViewedAdaptiveGroups(filter:{date_geq:$m,date_lt:$f},limit:1){sum{minutesViewed}}'
    + 'semana:streamMinutesViewedAdaptiveGroups(filter:{date_geq:$s,date_lt:$f},limit:1){sum{minutesViewed}}'
    + '}}}';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(CF_GRAPHQL, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { t: conta, m: primeiro, s: seteDias, f: amanha } }),
    });
    clearTimeout(t);
    const j = await r.json().catch(() => null);
    const erros = j && j.errors;
    if (!r.ok || (erros && erros.length)) {
      const txt = JSON.stringify(erros || j || {}).slice(0, 300);
      console.error('live: analytics', r.status, txt);
      const semPerm = /authentic|permission|not authorized|forbidden/i.test(txt) || r.status === 403;
      consumoCache = { em: Date.now(), mes: consumoCache.mes, semana: consumoCache.semana,
                       erro: semPerm ? 'sem_permissao' : 'analytics', desde: primeiro, ciclo: ciclo };
      return consumoCache;
    }
    const c = j && j.data && j.data.viewer && j.data.viewer.accounts && j.data.viewer.accounts[0];
    const somar = (lista) => (Array.isArray(lista) ? lista : [])
      .reduce((n, x) => n + (Number(x && x.sum && x.sum.minutesViewed) || 0), 0);
    consumoCache = { em: Date.now(), mes: somar(c && c.mes), semana: somar(c && c.semana), erro: '', desde: primeiro, ciclo: ciclo };
    return consumoCache;
  } catch (e) {
    clearTimeout(t);
    console.error('live: analytics falhou', String(e));
    consumoCache = { em: Date.now(), mes: consumoCache.mes, semana: consumoCache.semana, erro: 'rede', desde: primeiro, ciclo: ciclo };
    return consumoCache;
  }
}
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

/* Um lugar so decide se a proxima live e barrada — e o painel do dono mostra
   exatamente este veredito, com o motivo. Ate 16/09 a trava era invisivel
   quando NAO disparava, e um teste com teto de 1 minuto passava sem que
   ninguem soubesse por que: a medicao vinha zerada, e `0 >= 1` e falso.
   A trava estava certa; a tela e que nao contava.

   `mes` e a medicao da analytics do Cloudflare, que NAO e tempo real: ela
   demora alguns minutos e, com volume pequeno, arredonda para zero. Este teto
   e uma parede de CONTA MENSAL, com atraso de minutos — nao e um freio de
   transmissao. Quem corta na hora e a chave-mestra. */
async function vereditoTeto(termos) {
  const teto = Number(termos.tetoMinutosMes || 0);
  const ciclo = Number(termos.cicloDia || 1);
  if (!(teto > 0)) return { barra: false, motivo: 'sem_teto', teto: 0, mes: 0, ciclo: ciclo, desde: '', erro: '' };
  const c = await medirConsumo(ciclo);
  if (c.erro) return { barra: false, motivo: 'medicao_falhou', teto: teto, mes: c.mes || 0, ciclo: ciclo, desde: c.desde || '', erro: c.erro };
  if (c.mes >= teto) return { barra: true, motivo: 'teto_atingido', teto: teto, mes: c.mes, ciclo: ciclo, desde: c.desde || '', erro: '' };
  if (!c.mes) return { barra: false, motivo: 'medicao_zerada', teto: teto, mes: 0, ciclo: ciclo, desde: c.desde || '', erro: '' };
  return { barra: false, motivo: 'abaixo_do_teto', teto: teto, mes: c.mes, ciclo: ciclo, desde: c.desde || '', erro: '' };
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

/* ---- B4 (16/09/2026): a entrada do Cloudflare vive UMA live ----
   Ate aqui a entrada era criada uma vez por lojista e "reaproveitada para
   sempre". Como o WHEP e publico — ele precisa ser, quem assiste e anonimo —
   qualquer visitante copiava o endereco do JS da pagina e ficava com a chave
   de TODAS as lives futuras daquele lojista, para sempre, sem passar pela
   pagina, sem chat, sem aceite e sem denuncia.
   Agora toda live comeca com entrada NOVA: a anterior e apagada antes. Custa
   duas chamadas ao Cloudflare por live iniciada (DELETE + POST), atras do
   freio de 3/min do B5.
   O que isto fecha e o que isto NAO fecha:
   - fecha a reutilizacao eterna: o endereco vazado morre na proxima live, e
     entre uma live e outra nao ha publisher, logo nao ha minuto faturado;
   - NAO fecha o abuso DURANTE a transmissao. Para isso seria preciso
     requireSignedURLs + token por espectador, e o endpoint que emite o token
     seria publico do mesmo jeito: o atacante pediria N tokens. O que contem
     prejuizo ali e teto de gasto no Cloudflare e alerta, que e configuracao,
     nao codigo. */
async function apagarEntrada(uid, idConhecido) {
  let id = (idConhecido && /^[a-f0-9]{16,64}$/i.test(idConhecido)) ? idConhecido : '';
  if (!id) {
    const achado = await acharEntrada('mv-' + uid);
    if (achado === null) return null;             // Cloudflare fora: nao segue
    id = achado || '';
  }
  if (!id) return '';                             // nunca fez live: nada a apagar
  const del = await cf('/live_inputs/' + id, { method: 'DELETE' });
  if (del === null) return null;
  if (listaCache.mapa) delete listaCache.mapa['mv-' + uid];
  return id;
}

async function entradaNovaDoLojista(uid, idConhecido) {
  const nome = 'mv-' + uid;
  if (await apagarEntrada(uid, idConhecido) === null) return null;
  let ent = await cf('/live_inputs', {
    method: 'POST',
    body: JSON.stringify({ meta: { name: nome }, recording: { mode: 'off' } })
  });
  if (!ent || !ent.uid) return null;
  if (listaCache.mapa) listaCache.mapa[nome] = ent.uid;
  if (!enderecos(ent)) ent = await cf('/live_inputs/' + ent.uid, { method: 'GET' });
  return enderecos(ent);
}

/* Mantida para o caminho que NAO inicia live nenhuma (nada hoje) e como
   referencia do desenho antigo. Nao e mais usada pelo `iniciar`. */
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
  /* ---- o dono pergunta quanto de video ja foi entregue no mes ---- */
  if (corpo.acao === 'adm_consumo') {
    const adm0 = await lerDoc('admins/' + encodeURIComponent(uid));
    if (adm0.erro) return responder(res, 503, { erro: adm0.erro });
    if (!adm0.doc) return responder(res, 403, { erro: 'nao_admin' });
    if (corpo.agora === true) consumoCache = { em: 0, mes: consumoCache.mes, semana: consumoCache.semana, erro: consumoCache.erro, desde: consumoCache.desde, ciclo: 0 };
    const t0 = await lerDoc('configuracoes/liveTermos');
    const teto = Number((t0.doc && t0.doc.tetoMinutosMes) || 0);
    const cicloDia = Number((t0.doc && t0.doc.cicloDia) || 1);
    /* mede SEMPRE, mesmo sem teto: o card existe para mostrar o numero, e
       vereditoTeto() nao mede quando o teto e zero. O cache faz a segunda
       chamada sair de graca. */
    const c = await medirConsumo(cicloDia);
    const v = await vereditoTeto(t0.doc || {});
    return responder(res, 200, {
      ok: true, mes: c.mes, semana: c.semana, erro: c.erro || '',
      medidoEm: c.em || 0, teto: teto, cicloDia: cicloDia, desde: c.desde || '',
      barra: v.barra === true, motivo: v.motivo,
      /* US$ 1 por 1.000 minutos entregues, preco publico do Stream. O
         armazenamento e cobrado a parte e nao entra nesta conta: as lives do
         Moviki sao criadas com recording desligado. */
      custoUsd: Math.round((c.mes / 1000) * 100) / 100,
    });
  }

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

  /* TETO DE VIDEO DO CICLO. Quem decide e vereditoTeto(), a MESMA funcao que
     responde ao painel do dono — para a tela nunca dizer uma coisa e o
     servidor fazer outra. */
  const vt = await vereditoTeto(te.doc || {});
  if (vt.barra) {
    console.log('live: teto de video atingido', vt.mes, '/', vt.teto);
    return responder(res, 403, {
      erro: 'teto_video',
      mensagem: 'As transmissoes ao vivo estao pausadas ate o proximo ciclo. Tente novamente mais tarde.',
    });
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
  const reserva = await chamarRobo('live_reservar', { uid, periodo: periodoDaAssinatura(a.doc), nivel: nivel.nivel });
  if (!reserva.ok) {
    if (reserva.erro === 'cota') {
      return responder(res, 403, {
        erro: 'cota', usadas: reserva.usadas || 0, cota: reserva.cota || 0,
        mensagem: 'Voce ja usou as lives do periodo de teste. Assinando, a quantidade deixa de ter limite.',
      });
    }
    /* 16/09/2026 — teto de minutos de VIDEO do plano (espectadores x duracao),
       diferente do relogio da live. Recusado aqui, antes do Cloudflare. */
    if (reserva.erro === 'teto_video') {
      return responder(res, 403, {
        erro: 'teto_video', usadoMin: reserva.usadoMin || 0, tetoMin: reserva.tetoMin || 0,
        mensagem: 'Seu plano atingiu o limite de minutos de video deste ciclo (' +
                  (reserva.usadoMin || 0) + ' de ' + (reserva.tetoMin || 0) + ' min). ' +
                  'O limite conta espectadores x duracao e renova no proximo ciclo.',
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

  const e = await entradaNovaDoLojista(uid, reserva.entradaId);
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
