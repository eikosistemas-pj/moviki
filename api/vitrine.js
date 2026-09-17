/*!
 * MOVIKI api/vitrine.js | versao 2026-09-16-aovivo2 | repo: moviki (site publico)
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * O og.js nao era o unico pedaco do projeto que fala com o Firestore de fora
 * de um navegador. O robo social (moviki-assistente-social, GitHub Actions)
 * lia /negocios pela REST API com a chave publica do app. Para o Firebase isso
 * e uma requisicao de cliente sem token de App Check: no dia em que o
 * enforcement fosse ligado, o robo pararia de postar e o erro apareceria como
 * "Firestore: ..." dentro de um workflow que ninguem olha todo dia.
 *
 * Dar a chave da conta de servico para o repo do robo NAO e o caminho: aquele
 * repo e PUBLICO e a chave viveria num GitHub Secret so para ler dado que ja e
 * publico. Aqui o segredo fica onde ja tem que ficar — nas variaveis do
 * projeto Vercel do site — e o robo passa a consumir uma lista pronta.
 *
 * O QUE ELA FAZ
 * Devolve, em JSON, os negocios que marcaram autorizaDivulgacao = true, com um
 * conjunto FECHADO de campos: o minimo que o robo social usa para montar a
 * arte e a legenda. Nada de assinatura, contato, comissao ou qualquer campo
 * que a pagina publica ja nao mostre.
 *
 * TRES GANHOS ALEM DE DESTRAVAR O ENFORCEMENT
 * 1. O filtro de opt-in passa a ser SERVER-SIDE. Antes o robo baixava a base
 *    inteira e filtrava em Python: quem nao autorizou trafegava por fora.
 * 2. Custo. Antes eram ate 20 paginas de 300 leituras por rodada; agora uma
 *    consulta filtrada le so os elegiveis.
 * 3. A lista sai igual para qualquer consumidor futuro (landing, parceiro,
 *    campanha) sem ninguem mais falar com o Firestore por fora.
 *
 * TETO DE FUNCOES: a regra dos 12 e do projeto moviki-robo. O projeto Vercel
 * do SITE usava 1 (api/og.js); com esta, 2. Folga de sobra.
 *
 * SEGREDO OPCIONAL: se a env VITRINE_SECRET existir, o endpoint passa a exigir
 * "Authorization: Bearer <valor>". Sem a env, responde aberto — o conteudo e
 * o mesmo que ja esta publico na pagina de cada negocio, e sao negocios que
 * pediram para ser divulgados. Ligar o segredo depois nao muda este arquivo.
 */
'use strict';

const gauth = require('../lib/gauth');

const PROJ = 'moviki-app';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAjr0QED8JfHvIb1UtsM0CWHDXmJzDQhWw';
const BASE_REST = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents';
const TETO = 500;          // trava de tamanho: a resposta nunca vira um dump
const MAX_FOTOS = 6;

/* ---------- leitura de valores tipados do Firestore REST ---------- */
function txt(f) { return f && typeof f.stringValue === 'string' ? f.stringValue : ''; }
function num(f) {
  if (!f) return null;
  if (typeof f.doubleValue === 'number') return f.doubleValue;
  if (f.integerValue != null) return Number(f.integerValue);
  return null;
}
function lista(f) {
  const v = f && f.arrayValue && f.arrayValue.values;
  return Array.isArray(v) ? v.map(txt).filter(Boolean) : [];
}
/* Mesma trava de dominio da pagina publica e do og.js: URL de imagem que nao
   vem de onde a gente hospeda nao sai daqui. */
function fotoOk(u) {
  return typeof u === 'string' &&
    /^https:\/\/[a-z0-9.-]*(ibb\.co|firebasestorage\.googleapis\.com|firebasestorage\.app)\//i.test(u);
}
function corOk(c) { return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : ''; }

async function chamar(caminho, corpo, token) {
  const url = BASE_REST + caminho + (token ? '' : '?key=' + encodeURIComponent(API_KEY));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {}
      ),
      body: JSON.stringify(corpo)
    });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { clearTimeout(t); return null; }
}

/* Consulta filtrada: so quem autorizou divulgacao. Igualdade em campo unico
   usa indice automatico do Firestore — nao precisa criar indice na mao. */
async function elegiveis(token) {
  const j = await chamar(':runQuery', {
    structuredQuery: {
      from: [{ collectionId: 'negocios' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'autorizaDivulgacao' },
          op: 'EQUAL',
          value: { booleanValue: true }
        }
      },
      limit: TETO
    }
  }, token);
  if (!Array.isArray(j)) return null;

  const saida = [];
  for (const linha of j) {
    const d = linha && linha.document;
    if (!d || !d.fields) continue;
    const f = d.fields;
    const uid = String(d.name || '').split('/').pop();
    const slug = txt(f.slug);
    const nome = txt(f.nome);
    if (!uid || !slug || !nome) continue;         // sem link ou sem nome nao vira post

    const fotos = lista(f.fotos).filter(fotoOk).slice(0, MAX_FOTOS);
    const logo = txt(f.markerLogo);
    saida.push({
      uid: uid,
      nome: nome,
      slug: slug,
      segmento: txt(f.segmento),
      cor: corOk(txt(f.cor)),
      lat: num(f.lat),
      lng: num(f.lng),
      markerLogo: fotoOk(logo) ? logo : '',
      fotos: fotos,
      autorizaDivulgacao: true
    });
  }
  return saida;
}

/* ---------- AO VIVO AGORA (16/09/2026) ----------
   Nenhuma superficie publica do Moviki mostrava quem esta transmitindo. A live
   so era descoberta pelo link que o proprio lojista mandava — ou seja, o
   Moviki nao entregava um unico espectador, e "vender para quem esta perto"
   nao acontecia em lugar nenhum.
   Esta consulta e o motor da vitrine. Sai daqui, e nao do navegador, por tres
   motivos: a home nao carrega o SDK do Firebase (ela so o baixa quando alguem
   encosta na newsletter, para continuar leve — e essa leveza e o funil de
   aquisicao); o App Check nao entra no caminho; e a resposta fica no cache da
   CDN, entao mil visitantes na home custam UMA leitura do Firestore.
   `live_sessoes` e `read: true` na regra, e o cartao (slug, nome, segmento,
   logo) foi gravado pelo robo na abertura da live — por isso uma consulta so,
   sem uma leitura de `negocios` por lojista no ar.
   PULSO: a sessao so conta como no ar com pulso de menos de 3 minutos, igual
   ao painel do dono. Aba fechada no meio da feira deixaria um "ao vivo" eterno
   na home — que e pior que nao ter vitrine nenhuma. */
const PULSO_VALIDO_MS = 180000;
const TETO_AOVIVO = 60;

function msDe(f) {
  if (!f) return 0;
  if (f.timestampValue) { const t = Date.parse(f.timestampValue); return isNaN(t) ? 0 : t; }
  if (f.integerValue != null) return Number(f.integerValue);
  if (typeof f.doubleValue === 'number') return f.doubleValue;
  return 0;
}

/* Le UM documento pela REST (GET), sem runQuery. Usado so pelo interruptor da
   vitrine: uma leitura a cada revalidacao do cache (20 s), nao por visitante. */
async function lerDoc(caminho, token) {
  const url = BASE_REST + caminho + (token ? '' : '?key=' + encodeURIComponent(API_KEY));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.fields) || null;
  } catch (e) { clearTimeout(t); return null; }
}

/* INTERRUPTOR DA VITRINE — 16/09/2026.
   A vitrine mudou o perfil de risco do Modo Live: ate ela existir, uma live
   impropria ficava no link que o lojista distribuia; agora ela aparece na HOME
   do Moviki. A moderacao encerra a live (e ai ela some daqui em 20 s), mas
   incidente nao espera ninguem estar acordado para subir arquivo.
   Mesma doutrina da chave-mestra: um campo no banco desliga na hora.
   `liveDesligada` (a chave-mestra que ja existe) tambem apaga a vitrine — se
   nao ha live acontecendo, nao pode haver cartaz dizendo que ha. */
async function vitrineLigada(token) {
  const f = await lerDoc('/configuracoes/liveTermos', token);
  if (!f) return true;                       // nao consegui ler: nao inventa parede
  const off = (k) => !!(f[k] && f[k].booleanValue === true);
  return !(off('liveDesligada') || off('vitrineDesligada'));
}

async function aoVivo(token) {
  const j = await chamar(':runQuery', {
    structuredQuery: {
      from: [{ collectionId: 'live_sessoes' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'ativa' },
          op: 'EQUAL',
          value: { booleanValue: true }
        }
      },
      limit: TETO_AOVIVO * 2
    }
  }, token);
  if (!Array.isArray(j)) return null;

  const agora = Date.now();
  const saida = [];
  for (const linha of j) {
    const d = linha && linha.document;
    if (!d || !d.fields) continue;
    const f = d.fields;
    const pulso = Math.max(msDe(f.pulsoEm), msDe(f.pulsoMs));
    if (!pulso || (agora - pulso) > PULSO_VALIDO_MS) continue;   // fantasma: nao entra
    const slug = txt(f.slug), nome = txt(f.nome);
    if (!slug || !nome) continue;            // sem link ou sem nome nao vira cartao
    const logo = txt(f.logo);
    saida.push({
      slug: slug,
      nome: nome,
      segmento: txt(f.segmento),
      logo: fotoOk(logo) ? logo : '',
      nivel: txt(f.nivel),
      inicioMs: Math.max(msDe(f.inicioEm), msDe(f.inicioMs)),
    });
  }
  saida.sort((a, b) => b.inicioMs - a.inicioMs);
  return saida.slice(0, TETO_AOVIVO);
}

/* Contagem da base inteira. Uma agregacao COUNT custa uma fracao de leitura e
   e o que mantem o diagnostico do robo ("N negocios | M autorizaram") honesto
   sem baixar a base. */
async function totalBase(token) {
  const j = await chamar(':runAggregationQuery', {
    structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId: 'negocios' }] },
      aggregations: [{ count: {}, alias: 'total' }]
    }
  }, token);
  try {
    for (const linha of (j || [])) {
      const v = linha && linha.result && linha.result.aggregateFields &&
                linha.result.aggregateFields.total;
      if (v && v.integerValue != null) return Number(v.integerValue);
    }
  } catch (e) {}
  return null;
}

module.exports = async (req, res) => {
  const segredo = (process.env.VITRINE_SECRET || '').trim();
  if (segredo) {
    const cab = String(req.headers.authorization || '');
    if (cab !== 'Bearer ' + segredo) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ erro: 'nao autorizado' }));
      return;
    }
  }

  const token = await gauth.tokenLeitura();

  /* ?modo=aovivo -> so a vitrine de lives. Resposta curta, cache curto e
     ABERTA mesmo com VITRINE_SECRET ligado... nao: o segredo, se existir, vale
     para tudo, e o bloco acima ja barrou. Aqui so desviamos o trabalho. */
  if (String((req.query && req.query.modo) || '') === 'aovivo' ||
      /[?&]modo=aovivo(&|$)/.test(String(req.url || ''))) {
    const ligada = await vitrineLigada(token);
    const lives = ligada ? await aoVivo(token) : [];
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (!lives) {
      /* Aqui a falha e ABERTA, ao contrario da vitrine do robo social: uma
         home que nao consegue listar lives some com o bloco e segue linda. Dar
         502 para o visitante seria trocar um bloco vazio por um erro na tela. */
      res.statusCode = 200;
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10');
      res.end(JSON.stringify({ atualizado: new Date().toISOString(), total: 0, lives: [], erro: 'firestore' }));
      return;
    }
    res.statusCode = 200;
    /* 20 s na CDN: uma live dura dezenas de minutos, ninguem precisa de tempo
       real aqui — e isto e o que faz mil visitantes custarem uma leitura. */
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=20, stale-while-revalidate=60');
    res.end(JSON.stringify({ atualizado: new Date().toISOString(), total: lives.length, lives: lives }));
    return;
  }

  const [negocios, base] = await Promise.all([elegiveis(token), totalBase(token)]);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Moviki-Firestore', token ? 'sa' : 'key');

  if (!negocios) {
    /* Falha fechada e de proposito: devolver lista vazia faria o robo social
       achar que ninguem autorizou e publicar institucional caladinho, todo
       dia, sem ninguem notar. Erro explicito quebra o workflow e avisa. */
    res.statusCode = 502;
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ erro: 'firestore indisponivel' }));
    return;
  }

  res.statusCode = 200;
  /* 15 min na CDN, 1 h servindo velho enquanto revalida. O robo roda poucas
     vezes por dia; nao ha motivo para tocar o Firestore em toda chamada. */
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(JSON.stringify({
    atualizado: new Date().toISOString(),
    /* "sa" = leu como conta de servico (pronto para o enforcement do App Check).
       "key" = ainda pela chave publica. Enquanto disser "key", NAO ligar o
       enforcement: e este campo que se abre no navegador para conferir. */
    via: token ? 'sa' : 'key',
    base: base,
    total: negocios.length,
    truncado: negocios.length >= TETO,
    negocios: negocios
  }));
};
