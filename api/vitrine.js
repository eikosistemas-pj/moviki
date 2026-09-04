/*!
 * MOVIKI api/vitrine.js | versao 2026-09-04-vitrine1 | repo: moviki (site publico)
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
