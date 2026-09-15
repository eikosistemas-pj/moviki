/*!
 * MOVIKI api/og.js | versao 2026-09-04-og-sa | repo: moviki (site publico)
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
 *
 * ---- 04/09/2026: CONTA DE SERVICO, para o App Check poder ser enforcado ----
 * Ate aqui esta funcao lia o Firestore com a CHAVE PUBLICA do app web, do
 * servidor. Para o Firebase isso e uma requisicao de CLIENTE sem token de App
 * Check: no dia em que o enforcement fosse ligado, ela passaria a ser RECUSADA
 * e todo link de lojista compartilhado viraria cartao cinza — o canal de
 * distribuicao do produto.
 *
 * Agora ela pede um token OAuth de conta de servico (lib/gauth.js) e le
 * autenticada. Chamada de conta de servico passa por IAM, nao pela chave
 * publica: o App Check nao se aplica a ela, e o enforcement deixa de ser um
 * risco para o compartilhamento.
 *
 * A conta e SOMENTE LEITURA e nao e a do moviki-robo. Mas conta de servico
 * PASSA POR CIMA DAS REGRAS do Firestore: esta funcao so pode ler os cinco
 * documentos que ja lia pelo navegador (slug, ponto_slug, ponto, negocio,
 * assinatura, resumo) e so pode publicar o que a propria pagina ja mostra.
 * Nada de campo novo, nada de colecao de dinheiro.
 *
 * SEM a env FIREBASE_SA_LEITURA a funcao volta sozinha ao modo antigo (chave
 * publica) — e o que permite subir este arquivo ANTES de criar a conta, sem
 * quebrar nada. O cabecalho de resposta X-Moviki-Firestore diz qual via foi
 * usada: "sa" (conta de servico) ou "key" (chave publica). Enquanto ele
 * responder "key", NAO ligar o enforcement.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const gauth = require('../lib/gauth');

const PROJ = 'moviki-app';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAjr0QED8JfHvIb1UtsM0CWHDXmJzDQhWw';
/* Dominio canonico. O site responde TAMBEM em www.moviki.com.br, e a canonical
   nao pode seguir o host da requisicao: dois hosts com canonical diferente e
   exatamente o conteudo duplicado que a canonical existe pra evitar. Sempre BASE. */
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
function qtd(f) {
  const v = f && f.arrayValue && f.arrayValue.values;
  return Array.isArray(v) ? v.length : 0;
}
function fotoOk(u) {
  return typeof u === 'string' &&
    /^https:\/\/[a-z0-9.-]*(ibb\.co|firebasestorage\.googleapis\.com|firebasestorage\.app)\//i.test(u);
}

/* Com token: leitura autenticada por conta de servico (imune ao App Check).
   Sem token: modo antigo, chave publica — vale so ate o enforcement entrar. */
async function lerDoc(caminho, token) {
  const base = 'https://firestore.googleapis.com/v1/projects/' + PROJ +
    '/databases/(default)/documents/' + caminho;
  const url = token ? base : base + '?key=' + encodeURIComponent(API_KEY);
  const opcoes = token ? { headers: { Authorization: 'Bearer ' + token } } : {};
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);   // a funcao tem ~10s; nunca ficar pendurado
    opcoes.signal = ctrl.signal;
    const r = await fetch(url, opcoes);
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.fields ? j.fields : null;
  } catch (e) { return null; }
}

/* O 404.html vai junto no pacote da funcao (includeFiles no vercel.json).
   Se por qualquer motivo nao estiver la, busca no proprio dominio — assim uma
   mudanca de layout da Vercel nao derruba a pagina publica inteira. */
async function lerCasca(host, arquivo) {
  const nome = arquivo || '404.html';
  const tentativas = [
    path.join(process.cwd(), nome),
    path.join(__dirname, '..', nome),
    path.join(__dirname, nome)
  ];
  for (const p of tentativas) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) {}
  }
  try {
    const r = await fetch('https://' + host + '/' + nome);
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

/* Troca o <title> da casca pelo bloco completo. As duas cascas tem exatamente
   um <title> literal — se um dia deixar de ser, o fallback injeta logo depois
   do <head>.

   DUAS ARMADILHAS, as duas ja custaram cartao quebrado em teste:

   1) O live.html NAO e limpo como o 404.html: ele traz <meta name="description">
      e <meta name="robots" content="noindex"> proprias, escritas a mao. Injetar
      por cima deixava DUAS descriptions no mesmo head, e qual delas o robo do
      WhatsApp usa depende de quem le primeiro — ou seja, sorte. limpar() apaga
      as tags concorrentes ANTES da injecao. So mexe no trecho do <head> anterior
      ao primeiro <script>/<style>, pra nunca tocar em texto dentro de codigo.

   2) String.replace interpreta $&, $` e $' DENTRO do texto de substituicao. O
      bloco carrega nome e descricao escritos pelo LOJISTA: um titulo de live com
      "$'" cuspia o resto do arquivo dentro da tag. Por isso o replace recebe uma
      FUNCAO — funcao nao expande nada. */
function limpar(html) {
  const corte = html.search(/<script|<style/i);
  const fim = corte > 0 ? corte : html.length;
  const cabeca = html.slice(0, fim).replace(
    /[ \t]*<(?:meta|link)\b[^>]*\b(?:name|property|rel)\s*=\s*["']?(?:description|robots|canonical|og:[a-z:]+|twitter:[a-z:]+)["']?[^>]*>\s*\n?/gi,
    ''
  );
  return cabeca + html.slice(fim);
}

function injetar(html, bloco) {
  const casca = limpar(html);
  if (/<title>[^<]*<\/title>/.test(casca)) return casca.replace(/<title>[^<]*<\/title>/, () => bloco);
  return casca.replace(/<head(\s[^>]*)?>/i, m => m + '\n' + bloco);
}

module.exports = async (req, res) => {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'moviki.com.br').split(',')[0].trim();
  let slug = '';
  let ehLive = false;
  try {
    const u = new URL(req.url, 'https://' + host);
    slug = limpaSlug(u.searchParams.get('slug') || u.pathname.replace(/^\/+/, ''));
    /* 15/09/2026 — A PREVIA DO LINK DA LIVE.
       Ate aqui /live/:slug ia direto para live.html, que nao tem uma unica
       meta og. O link que o produto MAIS quer que seja compartilhado (o botao
       "Avisar clientes" existe so para isso) chegava pelado no WhatsApp:
       sem imagem, sem nome, sem descricao — enquanto o link da pagina do
       negocio, que passa por aqui, chega com cartao completo.
       Agora a rota passa por esta funcao com live=1, e a casca servida e a
       live.html em vez da 404.html. */
    ehLive = u.searchParams.get('live') === '1' || /^\/+live\//.test(u.pathname);
  } catch (e) {}

  /* O token sai junto com a leitura da casca: em requisicao fria isso poupa
     uma ida de rede inteira do orcamento de ~10s da funcao. */
  const [casca, token] = await Promise.all([
    lerCasca(host, ehLive ? 'live.html' : '404.html'),
    gauth.tokenLeitura()
  ]);
  const via = token ? 'sa' : 'key';
  if (!casca) {                       // nunca derrubar a pagina por causa de preview
    res.statusCode = 302;
    res.setHeader('Location', '/');
    res.end();
    return;
  }

  const generico = ehLive ? {
    titulo: 'Ao vivo no Moviki',
    descricao: 'Entre na transmissão, veja os produtos e fale com quem está vendendo.',
    url: BASE + '/live/' + slug,
    imagem: OG_PADRAO,
    imagemAlt: 'Moviki',
    indexar: false,            // live nunca se indexa: some do ar e o resultado morre
    negocio: false,
    jsonld: null
  } : {
    titulo: 'Moviki — ' + SLOGAN,
    descricao: 'Encontre negócios itinerantes no mapa, em tempo real: food trucks, carrinhos, feirantes e quiosques.',
    url: BASE + '/' + slug,
    imagem: OG_PADRAO,
    imagemAlt: 'Moviki',
    indexar: false,
    negocio: false,
    jsonld: null
  };

  if (slug.length < 3) return responder(res, injetar(casca, tags(generico)), 404, via);

  /* 1) apelido do negocio; 2) apelido de unidade Enterprise */
  let uid = '', pontoNome = '', achou = false;
  const s = await lerDoc('slugs/' + slug, token);
  if (s && txt(s.uid)) { uid = txt(s.uid); achou = true; }
  else {
    const ps = await lerDoc('ponto_slugs/' + slug, token);
    if (ps && txt(ps.ownerUid)) {
      uid = txt(ps.ownerUid); achou = true;
      const pt = txt(ps.pid) ? await lerDoc('pontos/' + txt(ps.pid), token) : null;
      if (pt) pontoNome = txt(pt.nome);
    }
  }
  if (!achou || !uid) return responder(res, injetar(casca, tags(generico)), 404, via);

  const [neg, ass, resumo, estLive] = await Promise.all([
    lerDoc('negocios/' + uid, token),
    lerDoc('assinaturas/' + uid, token),
    lerDoc('negocios/' + uid + '/resumo/avaliacoes', token),
    ehLive ? lerDoc('negocios/' + uid + '/estado/live', token) : Promise.resolve(null)
  ]);
  if (!neg) return responder(res, injetar(casca, tags(generico)), 404, via);

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
    url: BASE + '/' + slug,
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

  /* --- A PREVIA DA LIVE ---
     Nao afirma "esta ao vivo AGORA": o cartao fica guardado no aplicativo de
     quem recebeu por muito tempo depois que a transmissao acabou, e a CDN
     ainda guarda a resposta. Um cartao que promete live no ar para quem abre
     duas horas depois e pior do que um cartao neutro. O que entra e o TITULO
     que o lojista escreveu, que descreve o que ele vai mostrar e continua
     verdadeiro. Cache curto pelo mesmo motivo: o titulo muda a cada live. */
  if (ehLive) {
    const tituloLive = estLive ? txt(estLive.titulo) : '';
    const bloco = tags({
      titulo: nome + ' — ao vivo no Moviki',
      descricao: corta(
        (tituloLive ? tituloLive + '. ' : '') +
        'Entre na transmissão de ' + nome +
        ', veja os produtos e fale com quem está vendendo.', 180),
      url: BASE + '/live/' + slug,
      imagem: imagem,
      imagemAlt: nome,
      indexar: false,
      negocio: false,
      jsonld: null
    });
    return responder(res, injetar(casca, bloco), 200, via, true);
  }

  /* PORTAO DE QUALIDADE (nao confundir com trava de plano).
     Preview SEMPRE funciona — e o que o lojista compartilha no WhatsApp.
     Indexacao no Google exige pagina com conteudo de verdade: nome, ponto no
     mapa e ALGUM conteudo real — segmento, endereco, foto, cardapio ou promocao.
     NAO exigir endereco: o produto e feito pra quem NAO tem endereco fixo. Cadastro de teste e cadastro pela
     metade viram noindex,follow — pagina magra em quantidade derruba a
     reputacao do dominio inteiro, e o dominio e um so pra todos os lojistas. */
  const temConteudo = !!(segmento || endereco ||
                         qtd(neg.fotos) || qtd(neg.cardapio) || qtd(neg.promocoes));
  const completo = !!(txt(neg.nome) &&
                      typeof lat === 'number' && typeof lng === 'number' &&
                      temConteudo);

  const bloco = tags({
    titulo: titulo,
    descricao: descricao,
    url: BASE + '/' + slug,
    imagem: imagem,
    imagemAlt: 'Foto de ' + nome,
    indexar: completo,
    negocio: true,
    jsonld: ld
  });

  return responder(res, injetar(casca, bloco), 200, via);
};

function responder(res, html, status, via, curto) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  /* Diagnostico sem console: "sa" = conta de servico (pronto para enforcement),
     "key" = chave publica (o enforcement ainda derrubaria o preview). */
  res.setHeader('X-Moviki-Firestore', via || 'key');
  /* CDN guarda 5 min e serve stale por 24 h enquanto revalida: o caso comum
     nao le o Firestore. Lojista que troca a foto ve o preview novo em minutos. */
  /* curto = previa de LIVE: o titulo da transmissao muda a cada live, e uma
     previa de 5 minutos mostraria o titulo da live anterior. */
  res.setHeader('Cache-Control', status !== 200
    ? 'public, max-age=0, s-maxage=60'
    : (curto
        ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
        : 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400'));
  if (status !== 200) res.setHeader('X-Robots-Tag', 'noindex');
  res.end(html);
}
