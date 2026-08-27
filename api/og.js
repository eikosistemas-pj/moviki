/*!
 * MOVIKI api/og.js | versao 2026-08-27-og1 | repo: moviki (site publico)
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * A pagina publica (404.html) e 100% montada no navegador. O robo do WhatsApp,
 * do Facebook, do Instagram e do Google NAO roda JavaScript: eles liam um HTML
 * com <title>Moviki</title> e nada mais. Resultado: todo lojista que mandava o
 * proprio link entregava um cartao cinza, sem foto e sem nome — no modelo
 * single-vendor, esse compartilhamento E o canal de distribuicao.
 *
 * Pior: como o 404.html era servido como PAGINA DE ERRO, cada pagina de negocio
 * respondia HTTP 404. Nenhum buscador indexa um 404. Esta funcao responde 200.
 *
 * O QUE ELA FAZ
 * Le o negocio no Firestore pela API REST publica (a mesma leitura que o
 * navegador ja faz, com a mesma chave publica), injeta <title>, description,
 * Open Graph, Twitter Card, canonical e JSON-LD LocalBusiness dentro do proprio
 * 404.html, e devolve. O HTML entregue ao visitante continua sendo o mesmo
 * arquivo — nada de conteudo diferente para robo (isso e cloaking e o Google pune).
 *
 * CUSTO: 4 leituras de Firestore por MISS de cache (slug, negocio, assinatura,
 * resumo de avaliacoes). O Cache-Control abaixo guarda a resposta na CDN da
 * Vercel por 5 min e serve stale por 24 h, entao o normal e nao ler nada.
 *
 * NAO TOCA no repo moviki-robo: o teto de 12 funcoes e POR PROJETO da Vercel, e
 * o projeto do site usa zero.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const PROJ = 'moviki-app';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAjr0QED8JfHvIb1UtsM0CWHDXmJzDQhWw';
const BASE = 'https://moviki.com.br';
const OG_PADRAO = BASE + '/ogmoviki.jpg';
const SLOGAN = 'O mapa inteligente dos negócios em movimento.';

/* ---------- utilidades ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function limpaSlug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}
function corta(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n - 1).trim() + '…';
}
/* Firestore REST devolve valores tipados; estes tres leem o que interessa. */
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
function fotoOk(u) {
  return typeof u === 'string' &&
    /^https:\/\/[a-z0-9.-]*(ibb\.co|firebasestorage\.googleapis\.com|firebasestorage\.app)\//i.test(u);
}

async function lerDoc(caminho) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROJ +
    '/databases/(default)/documents/' + caminho + '?key=' + encodeURIComponent(API_KEY);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);   // a funcao tem ~10s; nunca ficar pendurado
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.fields ? j.fields : null;
  } catch (e) { return null; }
}

/* O 404.html vai junto no pacote da funcao (includeFiles no vercel.json).
   Se por qualquer motivo nao estiver la, busca no proprio dominio — assim uma
   mudanca de layout da Vercel nao derruba a pagina publica inteira. */
async function lerCasca(host) {
  const tentativas = [
    path.join(process.cwd(), '404.html'),
    path.join(__dirname, '..', '404.html'),
    path.join(__dirname, '404.html')
  ];
  for (const p of tentativas) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) {}
  }
  try {
    const r = await fetch('https://' + host + '/404.html');
    if (r.ok) return await r.text();
  } catch (e) {}
  return null;
}

/* ---------- montagem das tags ---------- */
function tags(o) {
  const linhas = [
    '<title>' + esc(o.titulo) + '</title>',
    '<meta name="description" content="' + esc(o.descricao) + '">',
    '<link rel="canonical" href="' + esc(o.url) + '">',
    '<meta property="og:type" content="' + (o.negocio ? 'business.business' : 'website') + '">',
    '<meta property="og:site_name" content="Moviki">',
    '<meta property="og:locale" content="pt_BR">',
    '<meta property="og:title" content="' + esc(o.titulo) + '">',
    '<meta property="og:description" content="' + esc(o.descricao) + '">',
    '<meta property="og:url" content="' + esc(o.url) + '">',
    '<meta property="og:image" content="' + esc(o.imagem) + '">',
    '<meta property="og:image:alt" content="' + esc(o.imagemAlt) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(o.titulo) + '">',
    '<meta name="twitter:description" content="' + esc(o.descricao) + '">',
    '<meta name="twitter:image" content="' + esc(o.imagem) + '">'
  ];
  if (!o.indexar) linhas.push('<meta name="robots" content="noindex,follow">');
  if (o.jsonld) {
    linhas.push('<script type="application/ld+json">' +
      JSON.stringify(o.jsonld).replace(/</g, '\\u003c') + '</script>');
  }
  return linhas.join('\n');
}

/* Troca o <title>Moviki</title> da casca pelo bloco completo. O 404.html tem
   exatamente um <title> e ele e literal — se um dia deixar de ser, o fallback
   injeta logo depois do <head>. */
function injetar(html, bloco) {
  if (/<title>[^<]*<\/title>/.test(html)) return html.replace(/<title>[^<]*<\/title>/, bloco);
  return html.replace(/<head(\s[^>]*)?>/i, m => m + '\n' + bloco);
}

module.exports = async (req, res) => {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'moviki.com.br').split(',')[0].trim();
  let slug = '';
  try {
    const u = new URL(req.url, 'https://' + host);
    slug = limpaSlug(u.searchParams.get('slug') || u.pathname.replace(/^\/+/, ''));
  } catch (e) {}

  const casca = await lerCasca(host);
  if (!casca) {                       // nunca derrubar a pagina por causa de preview
    res.statusCode = 302;
    res.setHeader('Location', '/');
    res.end();
    return;
  }

  const generico = {
    titulo: 'Moviki — ' + SLOGAN,
    descricao: 'Encontre negócios itinerantes no mapa, em tempo real: food trucks, carrinhos, feirantes e quiosques.',
    url: 'https://' + host + '/' + slug,
    imagem: OG_PADRAO,
    imagemAlt: 'Moviki',
    indexar: false,
    negocio: false,
    jsonld: null
  };

  if (slug.length < 3) return responder(res, injetar(casca, tags(generico)), 404);

  /* 1) apelido do negocio; 2) apelido de unidade Enterprise */
  let uid = '', pontoNome = '', achou = false;
  const s = await lerDoc('slugs/' + slug);
  if (s && txt(s.uid)) { uid = txt(s.uid); achou = true; }
  else {
    const ps = await lerDoc('ponto_slugs/' + slug);
    if (ps && txt(ps.ownerUid)) {
      uid = txt(ps.ownerUid); achou = true;
      const pt = txt(ps.pid) ? await lerDoc('pontos/' + txt(ps.pid)) : null;
      if (pt) pontoNome = txt(pt.nome);
    }
  }
  if (!achou || !uid) return responder(res, injetar(casca, tags(generico)), 404);

  const [neg, ass, resumo] = await Promise.all([
    lerDoc('negocios/' + uid),
    lerDoc('assinaturas/' + uid),
    lerDoc('negocios/' + uid + '/resumo/avaliacoes')
  ]);
  if (!neg) return responder(res, injetar(casca, tags(generico)), 404);

  /* Mesma trava de plano da pagina: foto e Premium/Enterprise (ou trial);
     logo do pino e Premium/Enterprise. Preview nunca mostra o que a pagina esconde. */
  const vence = ass && ass.vence_em ? Date.parse(ass.vence_em.timestampValue || '') : NaN;
  const ativo = !!(ass && ass.ativo && ass.ativo.booleanValue === true &&
                   (!ass.vence_em || isNaN(vence) || vence > Date.now()));
  const plano = ativo ? (txt(ass.plano) || 'basico') : 'basico';
  const periodo = ativo ? txt(ass.periodo) : '';
  const liberaFotos = plano === 'premium' || plano === 'enterprise' || periodo === 'trial';
  const liberaLogo = plano === 'premium' || plano === 'enterprise';

  const nome = txt(neg.nome) || 'Negócio no Moviki';
  const fotos = lista(neg.fotos).filter(fotoOk);
  const logo = txt(neg.markerLogo);
  const imagem = (liberaFotos && fotos[0]) ? fotos[0]
    : (liberaLogo && fotoOk(logo)) ? logo
    : OG_PADRAO;

  const segmento = txt(neg.segmento);
  const endereco = txt(neg.endereco);
  const recado = txt(neg.recado);
  const aberto = txt(neg.status) === 'aberto';

  const titulo = (pontoNome ? pontoNome + ' · ' + nome : nome) + ' — Moviki';
  const partes = [];
  if (segmento) partes.push(segmento);
  if (endereco) partes.push(endereco);
  partes.push(aberto ? 'Aberto agora' : 'Veja onde estamos agora');
  const descricao = corta(
    (recado ? recado + ' · ' : '') + partes.join(' · ') +
    '. Localização em tempo real, cardápio, promoções e avaliações no Moviki.', 180);

  const lat = num(neg.lat), lng = num(neg.lng);
  const n = resumo ? num(resumo.n) : null;
  const soma = resumo ? num(resumo.soma) : null;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: pontoNome ? pontoNome + ' · ' + nome : nome,
    url: 'https://' + host + '/' + slug,
    image: imagem
  };
  if (segmento) ld.description = segmento;
  if (endereco) ld.address = { '@type': 'PostalAddress', streetAddress: endereco, addressCountry: 'BR' };
  if (typeof lat === 'number' && typeof lng === 'number') {
    ld.geo = { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
  }
  if (n && n > 0 && soma != null) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Math.round((soma / n) * 10) / 10,
      reviewCount: n, bestRating: 5, worstRating: 1
    };
  }

  const bloco = tags({
    titulo: titulo,
    descricao: descricao,
    url: 'https://' + host + '/' + slug,
    imagem: imagem,
    imagemAlt: 'Foto de ' + nome,
    indexar: true,
    negocio: true,
    jsonld: ld
  });

  return responder(res, injetar(casca, bloco), 200);
};

function responder(res, html, status) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  /* CDN guarda 5 min e serve stale por 24 h enquanto revalida: o caso comum
     nao le o Firestore. Lojista que troca a foto ve o preview novo em minutos. */
  res.setHeader('Cache-Control', status === 200
    ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400'
    : 'public, max-age=0, s-maxage=60');
  if (status !== 200) res.setHeader('X-Robots-Tag', 'noindex');
  res.end(html);
}
