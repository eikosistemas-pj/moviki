/*!
 * MOVIKI api/manifest.js | versao 2026-10-19-gratis | repo: moviki (site publico)
 *
 * 19/10/2026 (P85 Fase 2b): "ADICIONAR A TELA INICIAL" COM O NOME DA LOJA.
 * Cada pagina de negocio (moviki.com.br/{slug}) aponta para
 * /api/manifest?s={slug}. O celular le daqui o nome que vai embaixo do icone
 * e o endereco que o atalho abre — o cliente instala a LOJA, nao o Moviki.
 *
 * O que le: slugs/{slug} (ou ponto_slugs/{slug}) e negocios/{uid}.nome/cor —
 * as mesmas leituras publicas do api/og.js, dentro da cerca do lib/gauth.js.
 * Nada pessoal sai daqui. Icone: o do Moviki (192/512). O nome e da loja.
 * CDN guarda 1 h: trocar o nome da loja aparece no atalho novo em ate 1 h.
 */
const gauth = require('../lib/gauth');

const PROJ = 'moviki-app';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAjr0QED8JfHvIb1UtsM0CWHDXmJzDQhWw';

function limpaSlug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}
function txt(f) { return f && typeof f.stringValue === 'string' ? f.stringValue : ''; }
const idOk = (v) => /^[A-Za-z0-9_-]{1,128}$/.test(v);

async function lerDoc(caminho, token) {
  const base = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents/' + caminho;
  const url = token ? base : base + '?key=' + encodeURIComponent(API_KEY);
  const opcoes = token ? { headers: { Authorization: 'Bearer ' + token } } : {};
  try {
    gauth.cerca(url);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    opcoes.signal = ctrl.signal;
    const r = await fetch(url, opcoes);
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.fields ? j.fields : null;
  } catch (e) { return null; }
}

/* nome curto para baixo do icone (o Android corta em ~12 letras) */
function curto(nome) {
  const n = String(nome || '').replace(/\s+/g, ' ').trim();
  if (n.length <= 12) return n;
  const pal = n.split(' ');
  let s = '';
  for (const p of pal) { if ((s + ' ' + p).trim().length > 12) break; s = (s + ' ' + p).trim(); }
  return s || n.slice(0, 12);
}

module.exports = async (req, res) => {
  let slug = '';
  try { slug = limpaSlug(new URL(req.url, 'https://www.moviki.com.br').searchParams.get('s')); } catch (e) {}
  let nome = 'Moviki', cor = '#0066FF';
  if (slug.length >= 3) {
    const token = await gauth.tokenLeitura();
    let uid = '';
    const s = await lerDoc('slugs/' + slug, token);
    if (s && idOk(txt(s.uid))) uid = txt(s.uid);
    else {
      const ps = await lerDoc('ponto_slugs/' + slug, token);
      if (ps && idOk(txt(ps.ownerUid))) uid = txt(ps.ownerUid);
    }
    const neg = uid ? await lerDoc('negocios/' + uid, token) : null;
    if (neg) {
      nome = (txt(neg.nome) || 'Moviki').replace(/\s+/g, ' ').trim().slice(0, 45);
      const c = txt(neg.cor);
      if (/^#[0-9a-fA-F]{6}$/.test(c)) cor = c;
    }
  }
  const raiz = slug.length >= 3 ? '/' + slug : '/';
  const m = {
    id: raiz,
    name: nome,
    short_name: curto(nome),
    description: nome === 'Moviki' ? 'Moviki' : nome + ' no Moviki',
    lang: 'pt-BR',
    start_url: raiz + '?utm_source=tela_inicial&utm_medium=atalho',
    scope: raiz,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: cor,
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/favicon512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.end(JSON.stringify(m));
};
