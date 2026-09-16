/*!
 * MOVIKI api/sitemap.js | versao 2026-09-16-sitemap1 | repo: moviki (site publico)
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * Desde 15/09 cada pagina de negocio (moviki.com.br/apelido) e servida pelo
 * api/og.js com HTTP 200, title, description, Open Graph, canonical e JSON-LD
 * LocalBusiness. Tecnicamente prontas para o Google. So que o sitemap.xml
 * listava NOVE paginas institucionais e mais nada — o proprio arquivo dizia
 * que as paginas de negocio "sao descobertas pelos links que os proprios
 * lojistas compartilham".
 *
 * Nao sao. Link em status de WhatsApp e em grupo fechado nao e link rastreavel:
 * o Google nao entra la. O resultado e que o unico conteudo LOCAL do dominio —
 * nome do negocio, segmento, cidade, cardapio, ponto no mapa — ficou invisivel
 * na busca, que e exatamente onde ele valeria mais.
 *
 * Esta funcao devolve o sitemap das paginas de negocio, montado na hora a
 * partir do Firestore.
 *
 * O PORTAO DE QUALIDADE E O MESMO DO og.js, E ISSO NAO E DETALHE
 * O og.js so marca a pagina como indexavel quando ela tem nome, ponto no mapa
 * e ALGUM conteudo real (segmento, endereco, foto, cardapio ou promocao).
 * Cadastro pela metade sai com noindex,follow.
 * Se este sitemap listasse URL que o HTML marca como noindex, o Search Console
 * encheria de "Enviada, mas marcada como noindex" — sinal contraditorio, ruim
 * para a reputacao do dominio e um dominio so serve TODOS os lojistas.
 * Por isso a funcao `indexavel()` abaixo repete a regra do og.js linha a linha.
 * MUDOU LA, MUDA AQUI, na mesma rodada.
 *
 * CUSTO
 * Uma consulta ao Firestore por MISS de cache. O Cache-Control guarda 6 h na
 * CDN da Vercel e serve stale por 24 h enquanto revalida — o Google busca um
 * sitemap poucas vezes por dia, entao o normal e nao ler nada.
 *
 * TETO DE FUNCOES: a regra dos 12 e do projeto moviki-robo. O projeto Vercel
 * do SITE usava tres (og, vitrine, live); com esta, quatro.
 *
 * NAO USA o filtro `autorizaDivulgacao` do api/vitrine.js. Aquilo e permissao
 * para o Moviki POSTAR o negocio nas redes sociais da marca — coisa que o
 * lojista liga e desliga. Indexacao e outra coisa: a pagina publica do lojista
 * ja e publica por definicao, e ele a divulga por conta propria. Confundir os
 * dois esconderia do Google quase todo mundo.
 */
'use strict';

const gauth = require('../lib/gauth');

const PROJ = 'moviki-app';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAjr0QED8JfHvIb1UtsM0CWHDXmJzDQhWw';
const BASE_REST = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents';

/* www, nunca o apex: na Vercel o apex esta como "Redirects to www". URL de
   sitemap que responde 301 gasta orcamento de rastreamento a toa. */
const BASE = 'https://www.moviki.com.br';
const TETO = 5000;         // o protocolo aceita 50.000; 5.000 e folga honesta

/* ---------- leitura de valores tipados do Firestore REST ---------- */
function txt(f) { return f && typeof f.stringValue === 'string' ? f.stringValue : ''; }
function num(f) {
  if (!f) return null;
  if (typeof f.doubleValue === 'number') return f.doubleValue;
  if (f.integerValue != null) return Number(f.integerValue);
  return null;
}
function qtd(f) {
  const v = f && f.arrayValue && f.arrayValue.values;
  return Array.isArray(v) ? v.length : 0;
}

/* Mesmo saneamento do og.js: so entra no sitemap o que a rota
   /:slug([A-Za-z0-9_-]{3,40}) do vercel.json consegue servir. Slug fora desse
   formato nao tem pagina — listar seria emitir 404 para o Google. */
function slugOk(s) {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(s);
}

/* PORTAO DE QUALIDADE — copia fiel de api/og.js (const completo).
   nome + ponto no mapa + algum conteudo real. Endereco NAO e exigido: o
   produto e feito para quem nao tem endereco fixo. */
function indexavel(f) {
  const lat = num(f.lat), lng = num(f.lng);
  const temConteudo = !!(txt(f.segmento) || txt(f.endereco) ||
                         qtd(f.fotos) || qtd(f.cardapio) || qtd(f.promocoes));
  return !!(txt(f.nome) &&
            typeof lat === 'number' && typeof lng === 'number' &&
            temConteudo);
}

async function chamar(caminho, corpo, token) {
  const url = BASE_REST + caminho + (token ? '' : '?key=' + encodeURIComponent(API_KEY));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
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

/* `select` traz so os campos do portao de qualidade. A leitura continua sendo
   uma por documento (o Firestore cobra assim), mas a banda e o tempo de
   resposta caem muito — a base tem negocio com cardapio inteiro dentro. */
async function negocios(token) {
  const j = await chamar(':runQuery', {
    structuredQuery: {
      from: [{ collectionId: 'negocios' }],
      select: {
        fields: [
          { fieldPath: 'slug' }, { fieldPath: 'nome' },
          { fieldPath: 'lat' }, { fieldPath: 'lng' },
          { fieldPath: 'segmento' }, { fieldPath: 'endereco' },
          { fieldPath: 'fotos' }, { fieldPath: 'cardapio' }, { fieldPath: 'promocoes' }
        ]
      },
      limit: TETO
    }
  }, token);
  if (!Array.isArray(j)) return null;

  const vistos = Object.create(null);
  const saida = [];
  for (const linha of j) {
    const d = linha && linha.document;
    if (!d || !d.fields) continue;
    const f = d.fields;
    const slug = txt(f.slug);
    if (!slugOk(slug) || vistos[slug.toLowerCase()]) continue;
    if (!indexavel(f)) continue;
    vistos[slug.toLowerCase()] = 1;
    /* updateTime vem do proprio Firestore — nao depende de o painel gravar um
       campo de data. lastmod mentiroso e pior do que lastmod ausente. */
    saida.push({ slug: slug, lastmod: (d.updateTime || '').slice(0, 10) });
  }
  return saida;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

module.exports = async (req, res) => {
  const token = await gauth.tokenLeitura();
  const lista = await negocios(token);

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('X-Moviki-Firestore', token ? 'sa' : 'key');

  /* Falha fechada. Devolver um sitemap VAZIO diria ao Google que as paginas
     sumiram, e ele tira do indice o que ja tinha entrado. Erro explicito ele
     entende como "tente de novo depois" e nao mexe em nada. */
  if (!lista) {
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.end('<?xml version="1.0" encoding="UTF-8"?>\n<!-- firestore indisponivel -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    return;
  }

  const linhas = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Paginas publicas de negocio. Gerado por api/sitemap.js; o portao de',
    '     qualidade e o mesmo do api/og.js: quem sai noindex nao entra aqui. -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const n of lista) {
    linhas.push('  <url><loc>' + esc(BASE + '/' + n.slug) + '</loc>' +
      (n.lastmod ? '<lastmod>' + esc(n.lastmod) + '</lastmod>' : '') +
      '<changefreq>daily</changefreq><priority>0.7</priority></url>');
  }
  linhas.push('</urlset>');

  res.statusCode = 200;
  res.setHeader('X-Moviki-Negocios', String(lista.length));
  /* 6 h na CDN, 24 h servindo velho enquanto revalida. */
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400');
  res.end(linhas.join('\n'));
};
