/*!
 * MOVIKI api/aovivo-og.js | versao 2026-10-16-og-ramos | repo: moviki (site publico)
 *
 * POR QUE EXISTE
 * Quem compartilha /aovivo?utm_content=<ramo> no WhatsApp, Facebook ou Instagram via
 * a miniatura generica do telefone (livehero.jpg). Os robos de previa NAO rodam
 * JavaScript, entao a troca por ramo que a pagina faz no navegador nunca chega neles.
 *
 * O QUE FAZ
 * So os robos de previa (regra "has user-agent" no vercel.json) passam por aqui.
 * Devolve o MESMO aovivo.html publicado, trocando apenas title, Open Graph e Twitter
 * Card pelo ramo do link: imagem og/aovivo/<ramo>.jpg (1200x630), titulo e texto do
 * ramo. O conteudo da pagina e identico ao que a pessoa ve (nao e cloaking).
 * Ramo desconhecido ou sem ramo: og/aovivo/geral.jpg.
 * O Google NAO esta na lista: ele continua lendo o aovivo.html estatico.
 *
 * CASAMENTO DO RAMO: igual a aovivo.html (2026-09-30): primeiro o proprio ramo
 * (tirando shopping- e comercio-), depois comeco de palavra, na ordem do mapa.
 * Ramo novo na /aovivo: acrescentar aqui e gerar og/aovivo/<k>.jpg.
 */
const fs = require('fs');
const path = require('path');
const R=[{"k":"farmacia","a":["farm","drog"],"s":"Para farmácias e drogarias","h":["A rede grande abriu na esquina.","Seu cliente de sempre ","volta pela live","."]},{"k":"perfumaria","a":["perfum"],"s":"Para perfumarias","h":["Perfume não tem cheiro na foto.","Ele tem ","a sua voz, ao vivo","."]},{"k":"cosmeticos","a":["cosmet","beleza","maquiag"],"s":"Para lojas de cosméticos e perfumaria","h":["Sua cliente já assiste live de maquiagem.","Que seja ","a da sua loja","."]},{"k":"boutique","a":["boutique"],"s":"Para boutiques de bairro","h":["Arara cheia de peça nova e a rua vazia.","Suas clientes ","estão no celular","."]},{"k":"brecho","a":["brecho"],"s":"Para brechós","h":["Peça única na arara.","Mostre ao vivo e ","quem pagar primeiro leva","."]},{"k":"lingerie","a":["linger","intim","pijam"],"s":"Para lojas de moda íntima","h":["Presente de Réveillon, peça no cabide.","Mostre ","o tecido de perto, ao vivo","."]},{"k":"moda-fitness","a":["legging","academ"],"s":"Para lojas de moda fitness","h":["Tecido que só convence de perto.","Mostre ","a costura ao vivo","."]},{"k":"moda-infantil","a":[],"s":"Para lojas de moda infantil","h":["Roupa de festa infantil só vende no provador.","Mostre ","a peça aberta, ao vivo","."]},{"k":"moda-praia","a":["praia","biquin","bikin"],"s":"Para lojas de moda praia","h":["Verão chegando e a moda praia na arara.","Mostre ","a estampa ao vivo","."]},{"k":"moda-masculina","a":["masculin"],"s":"Para lojas de moda masculina","h":["Camisa boa na arara e a loja sem movimento.","Seu cliente de sempre ","está no celular","."]},{"k":"moda","a":["moda","roupa","vestu"],"s":"Para lojas de moda","h":["O corredor anda vazio no meio da semana.","Sua cliente está ","no celular, no sofá","."]},{"k":"suplementos","a":["suplement","fitness","nutri","whey"],"s":"Para lojas de suplementos","h":["Seu cliente compara sabor e preço no celular.","Mostre ","o pote ao vivo","."]},{"k":"pet","a":["pet"],"s":"Para pet shops","h":["O tutor está no sofá, com o pet no colo.","Mostre ","a roupinha ao vivo","."]},{"k":"brinquedos","a":["brinq"],"s":"Para lojas de brinquedos","h":["Brinquedo parado na prateleira.","Mostre ele ","funcionando, ao vivo","."]},{"k":"bebe","a":["bebe","infantil","kids"],"s":"Para lojas de bebê e infantil","h":["Quem monta o enxoval pesquisa pelo celular.","Mostre ","o tecido ao vivo","."]},{"k":"calcados","a":["calcad","sapat"],"s":"Para lojas de calçados","h":["Chegou a numeração que faltava.","Avise ","ao vivo","."]},{"k":"esportes","a":["esport","tenis"],"s":"Para lojas de calçados e esportes","h":["Tênis parado na vitrine.","Seu cliente está ","procurando no celular","."]},{"k":"acai","a":["acai","lanch","sorvet"],"s":"Para açaí e lanchonetes","h":["O aplicativo leva uma fatia de cada pedido.","Venda ","direto, ao vivo","."]},{"k":"confeitaria","a":["confeit","doceria","bolo"],"s":"Para confeitarias","h":["O bolo mais bonito do bairro.","Mostre ","a fatia ao vivo","."]},{"k":"acessorios-celular","a":["acessorio","celular","capinha"],"s":"Para lojas de acessórios de celular","h":["Ele vê a capinha no balcão e compra pela internet.","Venda ","antes, ao vivo","."]},{"k":"semijoias","a":["semijoia","joia","relog"],"s":"Para lojas de semijoias","h":["Presente de Natal escolhido pelo celular.","Que seja ","na sua loja, ao vivo","."]},{"k":"bijuteria","a":["bijut"],"s":"Para lojas de bijuteria e acessórios","h":["Ninguém entra pra ver o brilho de perto.","Leve ","o brilho até ela","."]},{"k":"autopecas","a":["autopeca","autopecas","motopeca","pecas"],"s":"Para lojas de autopeças","h":["Três ligações pra saber se tem a peça.","Mostre ","na mão, ao vivo","."]},{"k":"sertanejos","a":["sertanej","nordestin","regionai"],"s":"Para produtos sertanejos","h":["O supermercado agora vende queijo coalho.","Seu freguês de sempre ","compra pela live","."]},{"k":"emporio","a":["emporio","queij","frios"],"s":"Para empórios","h":["Cesta de Natal montada. Pedido por telefone.","Monte ","a cesta ao vivo","."]},{"k":"naturais","a":["natura","granel"],"s":"Para empórios de produtos naturais","h":["Chegou novidade no granel.","Conte ","ao bairro inteiro, ao vivo","."]},{"k":"utilidades","a":["utilid","cozinh"],"s":"Para lojas de utilidades","h":["Panela boa na prateleira do fundo.","Traga ela ","para a frente, ao vivo","."]},{"k":"cama-mesa-banho","a":["cama","banho","lencol"],"s":"Para lojas de cama, mesa e banho","h":["O toque do lençol não passa na foto.","Mostre ","o tecido de perto, ao vivo","."]},{"k":"acougue","a":["acoug","carne","churras"],"s":"Para açougues e casas de carnes","h":["Sábado de churrasco. Pedido só no balcão.","Monte ","o kit ao vivo","."]},{"k":"cabelo","a":["cabel","aplique","peruc"],"s":"Para lojas de cabelo e apliques","h":["Cor de cabelo que a foto muda.","Mostre ","o tom ao vivo","."]},{"k":"chocolateria","a":["chocolat","bombon","trufa"],"s":"Para chocolaterias","h":["Chocolate artesanal que o bairro nem conhece.","Mostre ","o recheio ao vivo","."]},{"k":"eletroportateis","a":["eletropor","eletrodom","airfryer","fritadeir"],"s":"Para lojas de eletroportáteis","h":["Air fryer na vitrine e o cliente no app.","Ligue ","o aparelho ao vivo","."]},{"k":"festa","a":["festa","balao","baloe"],"s":"Para lojas de artigos de festa","h":["Réveillon chegando e a decoração parada.","Mostre ","o kit montado, ao vivo","."]},{"k":"floricultura","a":["floric","flores","buque","arranjo"],"s":"Para floriculturas","h":["Arranjo pronto esperando cliente.","Mostre ","a flor de perto, ao vivo","."]},{"k":"games","a":["game","informat","periferic"],"s":"Para lojas de games e informática","h":["Teclado que ele só testa no vídeo dos outros.","Teste ","ao vivo, na sua loja","."]},{"k":"padaria","a":["padar","panific","panetone","rabanada"],"s":"Para padarias","h":["Pão saindo às 17h e só o vizinho sabe.","Mostre ","a fornada ao vivo","."]},{"k":"presentes","a":["present","lembranc"],"s":"Para lojas de presentes","h":["Dezembro: fila só na véspera.","Venda ","o mês inteiro, ao vivo","."]},{"k":"otica","a":["otica","oculos"],"s":"Para óticas","h":["Óculos de sol que só se prova na loja.","Prove ","a armação ao vivo","."]}];
const BASE = 'https://www.moviki.com.br';
const V = '20261016';
let HTML = null;
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function acha(q) {
  let r = String(q || '').toLowerCase().slice(0, 80);
  try { r = r.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) {}
  if (!r) return null;
  const base = r.replace(/^(shopping|comercio)-/, '');
  for (const e of R) if (e.k === base) return e;
  const P = r.split(/[^a-z0-9]+/);
  for (const e of R) for (const w of P) { if (!w) continue; for (const a of e.a) if (w.indexOf(a) === 0) return e; }
  return null;
}
function troca(html, prop, val, attr) {
  const re = new RegExp('(<meta\\s+' + attr + '="' + prop.replace(/:/g, '\\:') + '"\\s+content=")[^"]*(")', 'i');
  return html.replace(re, (m, a, b) => a + esc(val) + b);
}
module.exports = (req, res) => {
  try {
    if (!HTML) HTML = fs.readFileSync(path.join(process.cwd(), 'aovivo.html'), 'utf8');
    const q = (req.query && (req.query.ramo || req.query.utm_content)) || '';
    const e = acha(Array.isArray(q) ? q[0] : q);
    let html = HTML;
    if (e) {
      const nome = e.s.replace(/^Para /, '');
      const titulo = 'Live shop para ' + nome + ' | Moviki';
      const texto = e.h[0] + ' ' + e.h[1] + e.h[2] + e.h[3] + ' Teste grátis por 30 dias, sem cartão.';
      const img = BASE + '/og/aovivo/' + e.k + '.jpg?v=' + V;
      const url = BASE + '/aovivo?ramo=' + e.k;
      const alt = 'Live do Moviki ' + e.s.charAt(0).toLowerCase() + e.s.slice(1) + ': loja mostrando o produto ao vivo pelo celular';
      html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + esc(titulo) + '</title>');
      html = troca(html, 'og:title', titulo, 'property');
      html = troca(html, 'og:description', texto, 'property');
      html = troca(html, 'og:url', url, 'property');
      html = troca(html, 'og:image', img, 'property');
      html = troca(html, 'og:image:secure_url', img, 'property');
      html = troca(html, 'og:image:alt', alt, 'property');
      html = troca(html, 'twitter:title', titulo, 'name');
      html = troca(html, 'twitter:description', texto, 'name');
      html = troca(html, 'twitter:image', img, 'name');
    } else {
      const img = BASE + '/og/aovivo/geral.jpg?v=' + V;
      html = troca(html, 'og:image', img, 'property');
      html = troca(html, 'og:image:secure_url', img, 'property');
      html = troca(html, 'twitter:image', img, 'name');
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
    res.end(html);
  } catch (err) {
    res.statusCode = 302;
    res.setHeader('Location', '/aovivo.html' + (req.url && req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?')) : ''));
    res.end();
  }
};
