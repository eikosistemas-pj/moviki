/*!
 * mvefeitos.js - EFEITOS VISUAIS das paginas de venda do site (repo moviki).
 * Marca de versao: digitar  mvEfeitos.versao  no console do navegador.
 * 13/10/2026 (fx1): primeira versao, na /aovivo (vale para todos os ramos).
 * 13/10/2026 (fx2): home. Destaques estilo Instagram, palavra que troca, carrossel de
 *                   arrastar no celular, barra fixa, mapa com o pino andando, pedidos
 *                   chegando, coracao no post, preco que rola e cartoes flutuando.
 *                   Nada muda na /aovivo: tudo novo so liga por chave nova do MV_FX.
 * 16/10/2026 (fx4): carrossel "uma live para cada tipo de loja" com TODOS os ramos que tem
 *                   pagina na /aovivo, lidos do catalogo unico (/ramos.js, repassado do app; d:1).
 *                   Os 12 de antes aparecem na hora; os outros entram no fim assim que o
 *                   ramos.js chega. Ramo novo com d:1 entra sozinho, sem mexer aqui.
 * 16/10/2026 (fx5): fora da secao clara (home), o carrossel vira painel claro (.fxRamos--claro),
 *                   igual ao visual da pagina do ramo. Ondas do 'claro' nao mudam.
 * 13/10/2026 (fx3): palavra que troca embolava as palavras no Chrome de verdade. O titulo
 *                   usa texto recortado no gradiente (background-clip:text) e esse recorte
 *                   enxerga o texto dos filhos mesmo com opacity 0. Palavra fora agora fica
 *                   visibility:hidden, que sai do recorte.
 *
 * Por que existe (separado do mvmotion.js):
 *  - O mvmotion.js e o movimento BASE dos dois dominios (paineis e site) e segue
 *    "movimento explica, nunca enfeita". Este arquivo e o contrario, de proposito:
 *    efeito de VITRINE para pagina de venda. So entra na pagina que pedir.
 *  - Nao mexe em painel, em live.html nem em nada do app.moviki.com.br.
 *
 * Como uma pagina usa:
 *  1. No <head>:  window.MV_FX = { ...seletores... }  e
 *                 <script src="/mvefeitos.js?v=AAAAMMDD" defer></script>
 *  2. Blocos novos nascem de marcadores vazios no HTML:
 *       <div data-fx="faixa" data-fx-a="item|item" data-fx-b="item|item"></div>
 *       <div data-fx="numeros" data-fx-itens="30|dias gratis;0|app para instalar"></div>
 *       <div data-fx="chat"></div>   <div data-fx="ramos"></div>   <div data-fx="selo"></div>
 *       <div data-fx="destaques" data-fx-itens="Live|#aovivo|icone.png|vivo;Mapa|#mapa|icone.png"></div>
 *       <span data-fx="troca" data-fx-palavras="loja|otica|boutique">loja</span>  (palavra que troca)
 *     Sem JS, o marcador fica vazio: a pagina continua igual a de antes.
 *
 * MV_FX (todos opcionais):
 *   progresso:1        barra fina de leitura no topo
 *   nitido:'sel'       titulo que sai do desfocado e fica nitido ao aparecer
 *   cascata:'sel'      filhos do bloco entram um a um
 *   borda:'sel'        luz girando na borda do cartao
 *   botoes:'sel'       brilho passando no botao + seta andando
 *   coracoes:'#id'     coracoes subindo no telefone da live (o mesmo coracao da live.html)
 *   claro:'#id'        secao clara com ondas em cima e embaixo
 *   ramosBase:'/aovivo' para onde o carrossel de ramos leva (padrao: a propria pagina)
 *   arrasta:'sel'      grade de cartoes vira carrossel de arrastar no celular (<=700px)
 *   arrastaFoco:'sel'  cartao que ja aparece centralizado no carrossel (ex.: plano Premium)
 *   barra:{texto,sub,href,ev,some}  barra fixa de cadastro no celular; some quando
 *                      um dos seletores de 'some' esta na tela ou o aviso de cookie aparece
 *   mapaVivo:'sel'     o pino 'voce' anda pela rota do mapinha (.fn-mapa)
 *   pedidos:'sel'      chega um pedido novo e um status muda (.pdTela)
 *   curtir:'sel'       coracao grande no post, como dois toques no Instagram (.lp-post)
 *   precos:'sel'       o preco rola quando muda (troca mensal/anual)
 *   flutua:'sel'       o elemento flutua de leve
 *
 * REGRAS (Meta/Google/CONAR e regras do Paulo):
 *  - Numero na tela e numero de REGRA (30 dias, 2 lives, 3 toques, 0 app).
 *    Nunca numero de cliente, nota, venda ou depoimento: o Moviki nao inventa prova social.
 *  - Chat de exemplo com nomes que servem para os dois generos (Dani, Rafa):
 *    a pagina e uma so para todos os ramos.
 *  - O coracao e o mesmo SVG e a mesma cor do botao curtir da live.html.
 *
 * SEGURANCA DE PAGINA:
 *  - "Reduzir movimento": nada anima, tudo aparece pronto.
 *  - Nada fica escondido se o JS falhar: o estado oculto so nasce aqui (html.fxOn),
 *    e so para o que esta ABAIXO da dobra.
 *  - Economia de dados / 2G: sem coracoes e sem carrossel andando.
 *  - So transform e opacity nas animacoes continuas. Coracoes e carrossel param fora da tela.
 *
 * CHAVE-MESTRA: FX_LIGADO = false e subir o arquivo desliga tudo deste arquivo.
 * Diagnostico por visitante: ?fx=0 na URL, ou localStorage mv_fx = '0'.
 */
(function () {
  'use strict';

  // >>> CHAVE-MESTRA. false = desliga todos os efeitos deste arquivo. <<<
  var FX_LIGADO = true;

  var VERSAO = '2026-10-16-fx5';
  var W = window, D = document, H = D.documentElement;
  if (W.mvEfeitos) return;
  var api = W.mvEfeitos = { versao: VERSAO, ligado: false };
  if (!FX_LIGADO) return;
  try {
    if (/[?&]fx=0(&|$)/.test(location.search)) return;
    if (W.localStorage && localStorage.getItem('mv_fx') === '0') return;
  } catch (e) {}

  var CFG = W.MV_FX || {};
  var REDUZ = false, POUPA = false;
  try { REDUZ = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  try { var cx = navigator.connection; POUPA = !!(cx && (cx.saveData || /(^|-)2g$/.test(cx.effectiveType || ''))); } catch (e) {}
  var TEM_IO = 'IntersectionObserver' in W;
  var ANIMA = TEM_IO && !REDUZ;

  /* ------------------------------------------------------------------ */
  /* CSS                                                                  */
  /* ------------------------------------------------------------------ */
  var CSS = [
    '@property --fxAng{syntax:"<angle>";inherits:false;initial-value:0deg}',

    /* barra de leitura */
    '.fxProg{position:fixed;left:0;top:0;width:100%;height:3px;z-index:65;pointer-events:none;transform-origin:0 50%;transform:scaleX(0);',
    'background:linear-gradient(90deg,#00D4FF,#0066FF 60%,#25e39b)}',

    /* faixas diagonais */
    '.fxFaixas{position:relative;z-index:2;height:124px;overflow:hidden;margin-top:-6px}',
    '.fxBand{position:absolute;left:-10%;width:120%;overflow:hidden;white-space:nowrap}',
    '.fxBand--a{top:22px;z-index:2;transform:rotate(-2.6deg);background:linear-gradient(90deg,#00D4FF,#0066FF);color:#02131f;box-shadow:0 12px 30px rgba(0,102,255,.32)}',
    '.fxBand--b{top:58px;z-index:1;transform:rotate(2.4deg);background:#0e1c30;border-block:1px solid #284a78;color:#7ff0ff}',
    '.fxTrilho{display:inline-flex;will-change:transform;animation:fxCorre 42s linear infinite}',
    '.fxBand--b .fxTrilho{animation-duration:52s;animation-direction:reverse}',
    '.fxTrilho span{flex:0 0 auto;padding:11px 0;font-weight:800;font-size:12.5px;letter-spacing:1.3px;text-transform:uppercase;line-height:1.2}',
    '.fxTrilho i{font-style:normal;padding:0 16px;opacity:.65}',
    '@keyframes fxCorre{to{transform:translateX(-50%)}}',

    /* numeros de regra */
    '.fxNums{position:relative;z-index:2;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;width:min(1140px,100% - 30px);margin:6px auto 0}',
    '.fxNum{text-align:center;padding:16px 8px 15px;border-radius:16px;background:rgba(14,28,48,.62);border:1px solid #1c3457}',
    '.fxNum b{display:block;font-size:clamp(32px,4.6vw,44px);font-weight:800;line-height:1;letter-spacing:-1px;font-variant-numeric:tabular-nums;',
    'background:linear-gradient(135deg,#00D4FF,#0066FF);-webkit-background-clip:text;background-clip:text;color:transparent}',
    '.fxNum span{display:block;font-size:12.5px;line-height:1.35;color:#8fa6c4;margin-top:7px}',
    '@media(max-width:640px){.fxNums{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}',

    /* titulo nitido */
    'html.fxOn .fxNit{opacity:0;filter:blur(12px);transform:translateY(12px)}',
    'html.fxOn .fxNit.fxIn{opacity:1;filter:blur(0);transform:none;',
    'transition:opacity .7s cubic-bezier(.2,0,0,1),filter .9s cubic-bezier(.2,0,0,1),transform .8s cubic-bezier(.05,.7,.1,1)}',

    /* cascata */
    'html.fxOn .fxCas>*{opacity:0;transform:translateX(-18px)}',
    'html.fxOn .fxCas.fxIn>*{opacity:1;transform:none;transition:opacity .5s ease var(--fxD,0ms),transform .65s cubic-bezier(.05,.7,.1,1) var(--fxD,0ms)}',
    'html.fxOn tbody.fxCas>*{transform:translateY(10px)}',
    'html.fxOn tbody.fxCas.fxIn>*{transform:none}',
    'html.fxOn .fxCas.fxIn>li>span:first-child{animation:fxPop .5s cubic-bezier(.3,1.6,.5,1) both;animation-delay:calc(var(--fxD,0ms) + 120ms)}',
    '@keyframes fxPop{0%{transform:scale(.2);opacity:0}100%{transform:scale(1);opacity:1}}',

    /* luz girando na borda */
    '.fxBorda{position:relative;isolation:isolate}',
    '.fxBorda::before{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1.5px;pointer-events:none;z-index:1;',
    'background:conic-gradient(from var(--fxAng),transparent 0 60%,#00D4FF 74%,#25e39b 82%,transparent 92%);',
    '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;',
    'animation:fxGira 5.5s linear infinite}',
    '@keyframes fxGira{to{--fxAng:360deg}}',

    /* brilho no botao + seta */
    '.fxBrilho{position:relative;overflow:hidden;isolation:isolate}',
    '.fxBrilho::after{content:"";position:absolute;top:-10%;bottom:-10%;left:0;width:38%;pointer-events:none;',
    'background:linear-gradient(100deg,transparent,rgba(255,255,255,.6),transparent);transform:translateX(-130%) skewX(-18deg);',
    'animation:fxVarre 5s ease-in-out infinite;animation-delay:var(--fxB,0s)}',
    '@keyframes fxVarre{0%,64%{transform:translateX(-130%) skewX(-18deg)}100%{transform:translateX(300%) skewX(-18deg)}}',
    '.fxSeta{display:inline-block;animation:fxSeta 1.7s ease-in-out infinite}',
    '@keyframes fxSeta{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}',

    /* coracoes da live */
    '.fxCoracoes{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden;border-radius:inherit}',
    '.fxCor{position:absolute;right:6%;bottom:26%;width:6.7%;aspect-ratio:1;color:#ff4d7d;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));',
    'animation:fxVoa 1.8s ease-out forwards}',
    '.fxCor svg{display:block;width:100%;height:100%}',
    '@keyframes fxVoa{0%{transform:translate(0,0) scale(.6);opacity:0}15%{opacity:1;transform:translate(0,-20px) scale(1.1)}',
    '100%{transform:translate(var(--dx,0px),calc(var(--sobe,200px) * -1)) scale(.9);opacity:0}}',

    /* secao clara com ondas */
    '.fxClaro{--mv-surf:#ffffff;--mv-surf-2:#f2f7ff;--mv-linha:#d3e2f4;--mv-linha-forte:#b8cfea;',
    '--mv-txt:#0b1a2e;--mv-txt-2:#2a4361;--mv-txt-3:#5a7190;color:var(--mv-txt);background:none!important;',
    'padding-top:calc(clamp(46px,6vw,88px) + 46px)!important;padding-bottom:calc(clamp(46px,6vw,88px) + 46px)!important}',
    '.fxClaro::before{content:"";position:absolute;left:0;right:0;top:58px;bottom:58px;background:#eef5ff;z-index:-1}',
    '.fxClaro .avH2 em{background:linear-gradient(135deg,#0090c0,#0052cc);-webkit-background-clip:text;background-clip:text;color:transparent}',
    '.fxClaro .lp-tit h2 em{color:#0077cc}',
    '.fxClaro .lp-passo{background:#fff;border:1px solid #d3e2f4;border-radius:18px;padding:18px 14px;box-shadow:0 12px 30px rgba(20,60,120,.10)}',
    '.fxClaro.lp-sec--faixa{border-block:0}',
    '.fxClaro .avPasso{box-shadow:0 12px 30px rgba(20,60,120,.10)}',
    '.fxOnda{position:absolute;left:0;right:0;height:60px;overflow:hidden;z-index:-1;pointer-events:none}',
    '.fxOnda--cima{top:0}',
    '.fxOnda--baixo{bottom:0;transform:scaleY(-1)}',
    '.fxOnda svg{position:absolute;left:0;bottom:0;width:200%;height:100%;display:block;will-change:transform;animation:fxCorre 26s linear infinite}',
    '.fxOnda svg.fxOnda--tras{opacity:.45;animation-duration:38s;animation-direction:reverse;bottom:6px}',

    /* chat de exemplo */
    '.fxChat{max-width:400px;margin:26px auto 0;background:#0b1626;border:1px solid #1c3457;border-radius:20px;padding:14px 14px 12px;',
    'box-shadow:0 18px 40px rgba(6,20,45,.25);color:#eaf6ff;text-align:left}',
    '.fxChat__topo{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#ffb7bb;margin-bottom:10px}',
    '.fxChat__topo i{width:8px;height:8px;border-radius:50%;background:#ff3b46;box-shadow:0 0 10px rgba(255,59,70,.9)}',
    '.fxChat__lista{display:flex;flex-direction:column;gap:8px;min-height:212px;justify-content:flex-end}',
    '.fxMsg{align-self:flex-start;max-width:88%;background:rgba(255,255,255,.07);border-radius:14px 14px 14px 4px;padding:8px 12px;font-size:14px;line-height:1.4}',
    '.fxMsg b{display:block;font-size:11.5px;color:#7ff0ff;margin-bottom:1px}',
    '.fxMsg--loja{background:rgba(0,212,255,.14);border:1px solid rgba(0,212,255,.35)}',
    '.fxMsg--loja b{color:#25e39b}',
    '.fxMsg--sis{align-self:center;background:rgba(37,227,155,.14);border:1px solid rgba(37,227,155,.45);color:#9ff5d2;font-size:12.5px;font-weight:700;border-radius:999px;padding:6px 12px}',
    '.fxMsg.fxNovo{animation:fxSobe .38s cubic-bezier(.05,.7,.1,1) both}',
    '@keyframes fxSobe{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}',
    '.fxDig{align-self:flex-start;display:inline-flex;gap:4px;background:rgba(255,255,255,.07);border-radius:14px;padding:11px 13px}',
    '.fxDig i{width:6px;height:6px;border-radius:50%;background:#8fa6c4;animation:fxPisca 1s ease-in-out infinite}',
    '.fxDig i:nth-child(2){animation-delay:.15s}.fxDig i:nth-child(3){animation-delay:.3s}',
    '@keyframes fxPisca{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}',
    '.fxChat__leg{font-size:11px;color:#8fa6c4;text-align:center;margin-top:9px}',

    /* carrossel de ramos */
    '.fxRamos{margin-top:clamp(40px,5vw,64px);text-align:center}',
    '.fxRamos__t{font-size:clamp(21px,2.8vw,28px);font-weight:800;letter-spacing:-.6px;line-height:1.15;margin-bottom:6px}',
    '.fxRamos__s{font-size:14.5px;color:var(--mv-txt-2,#2a4361)}',
    '.fxRamos__trilho{display:flex;gap:14px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scrollbar-width:none;',
    'padding:18px 4px 6px;margin-top:6px;-webkit-overflow-scrolling:touch}',
    '.fxRamos__trilho::-webkit-scrollbar{display:none}',
    '.fxRamo{flex:0 0 auto;width:118px;scroll-snap-align:start;text-decoration:none;color:inherit}',
    '.fxRamo__tel{display:block;aspect-ratio:540/1168;border-radius:18px;overflow:hidden;background:#0b1626;border:2px solid rgba(11,26,46,.12);',
    'box-shadow:0 10px 24px rgba(6,20,45,.22);transition:transform .25s cubic-bezier(.2,0,0,1),box-shadow .25s}',
    '.fxRamo__tel img{width:100%;height:100%;object-fit:cover;display:block}',
    '.fxRamo:hover .fxRamo__tel,.fxRamo:focus-visible .fxRamo__tel{transform:translateY(-4px);box-shadow:0 16px 30px rgba(6,20,45,.3)}',
    '.fxRamo__n{display:block;font-size:12.5px;font-weight:700;margin-top:8px;line-height:1.25}',
    '.fxRamos__leg{font-size:11px;color:var(--mv-txt-3,#5a7190);margin-top:8px}',
    /* 16/10/2026 (fx5): fora de secao clara (home), o carrossel vira um painel claro,
       igual ao que aparece na /aovivo dentro do "Como funciona" */
    '.fxRamos--claro{background:linear-gradient(180deg,#ffffff 0%,#eef5ff 100%);color:#0b1a2e;border-radius:28px;',
    'padding:clamp(22px,3vw,34px) clamp(12px,2.5vw,28px) 16px;box-shadow:0 24px 60px rgba(0,0,0,.35)}',
    '.fxRamos--claro .fxRamos__t,.fxRamos--claro .fxRamo{color:#0b1a2e}',
    '.fxRamos--claro .fxRamos__s{color:#2a4361}.fxRamos--claro .fxRamos__leg{color:#5a7190}',

    /* selo girando */
    '.fxSelo{width:118px;height:118px;margin:0 auto 14px;position:relative}',
    '.fxSelo svg{display:block;width:100%;height:100%;overflow:visible}',
    '.fxSelo .fxSelo__anel{transform-origin:60px 60px;animation:fxRoda 20s linear infinite}',
    '@keyframes fxRoda{to{transform:rotate(360deg)}}',

    /* destaques estilo Instagram */
    '.fxDest{display:flex;gap:16px;justify-content:center;overflow-x:auto;scrollbar-width:none;padding:6px 16px 4px;margin:6px auto 0;max-width:760px;position:relative;z-index:2}',
    '.fxDest::-webkit-scrollbar{display:none}',
    '.fxDest a{flex:0 0 auto;width:70px;text-align:center;text-decoration:none;color:var(--mv-txt-2,#c6d8ee);font-size:11.5px;font-weight:600;line-height:1.25}',
    '.fxDest__anel{position:relative;display:block;width:66px;height:66px;margin:0 auto 6px;border-radius:50%;padding:3px;',
    'background:conic-gradient(from var(--fxAng),#00D4FF,#0066FF,#25e39b,#00D4FF);animation:fxGira 6s linear infinite}',
    '.fxDest__anel--vivo{background:conic-gradient(from var(--fxAng),#ff3b46,#ff8a00,#ff4d7d,#ff3b46);animation-duration:3.5s}',
    '.fxDest__miolo{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:#0b1626;border:2px solid #060d18}',
    '.fxDest__miolo img{width:58%;height:58%;object-fit:contain}',
    '.fxDest__vivo{position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);font-size:8.5px;font-weight:800;letter-spacing:.6px;color:#fff;',
    'background:#ff3b46;border:2px solid #060d18;border-radius:5px;padding:1px 5px;line-height:1.2}',
    '@media(max-width:560px){.fxDest{justify-content:flex-start}}',

    /* palavra que troca (cada palavra com o proprio gradiente: transform dentro de texto recortado some no Chrome) */
    '.fxTroca{display:inline-grid;grid-template-columns:minmax(0,1fr);vertical-align:bottom;overflow:hidden;transition:width .5s cubic-bezier(.2,0,0,1)}',
    '.fxTroca>span{white-space:nowrap;justify-self:center}',
    '.fxTroca>span{grid-area:1/1;background:var(--mv-grad,linear-gradient(135deg,#00D4FF,#0066FF));-webkit-background-clip:text;background-clip:text;color:transparent;',
    'transition:transform .55s cubic-bezier(.2,0,0,1),opacity .4s ease,visibility 0s}',
    '.fxTroca>span.fxFora{transform:translateY(105%);opacity:0;visibility:hidden}',
    '.fxTroca>span.fxSai{transform:translateY(-105%);opacity:0}',

    /* carrossel de arrastar no celular */
    '@media(max-width:700px){',
    '.fxArrasta{display:flex!important;gap:12px!important;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scrollbar-width:none;',
    'margin-inline:-16px!important;padding:18px 16px 10px!important;max-width:none!important;align-items:stretch!important}',
    '.fxArrasta::-webkit-scrollbar{display:none}',
    '.fxArrasta>*{flex:0 0 80%;max-width:340px;scroll-snap-align:center}',
    '.fxArrasta>*:hover{transform:none!important}',
    '.fxPontos{display:flex;justify-content:center;gap:6px;margin-top:6px}',
    '.fxPontos i{width:6px;height:6px;border-radius:999px;background:rgba(143,166,196,.4);transition:width .25s,background .25s}',
    '.fxPontos i.on{width:18px;background:#00D4FF}',
    '}',
    '@media(min-width:701px){.fxPontos{display:none}}',

    /* barra fixa de cadastro */
    '.fxBarra{position:fixed;left:0;right:0;bottom:0;z-index:55;padding:10px 16px calc(10px + env(safe-area-inset-bottom));text-align:center;',
    'background:rgba(6,13,24,.93);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid rgba(28,52,87,.7);',
    'transform:translateY(0);transition:transform .3s cubic-bezier(.2,0,0,1)}',
    '.fxBarra.fora{transform:translateY(115%)}',
    '.fxBarra a{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;max-width:440px;margin:0 auto;text-decoration:none;font-weight:700;font-size:15.5px;',
    'padding:14px 20px;border-radius:14px;background:linear-gradient(135deg,#2ee6a8,#0fb87f);color:#04121f;box-shadow:0 0 22px rgba(37,227,155,.42)}',
    '.fxBarra small{display:block;font-size:11.5px;color:#8fa6c4;margin-top:4px}',
    '@media(min-width:701px){.fxBarra{display:none}}',
    '@media(max-width:700px){body.fxComBarra{padding-bottom:calc(84px + env(safe-area-inset-bottom))}}',

    /* pedidos chegando */
    '.fxPedNovo{animation:fxPedEntra .6s cubic-bezier(.05,.7,.1,1) both;box-shadow:0 0 0 1px rgba(37,227,155,.55),0 0 22px rgba(37,227,155,.25)}',
    '@keyframes fxPedEntra{from{opacity:0;transform:translateY(-14px) scale(.97)}to{opacity:1;transform:none}}',
    '.fxPedSai{animation:fxPedSai .45s ease both}',
    '@keyframes fxPedSai{to{opacity:0;transform:translateY(10px)}}',
    '.fxStNovo{background:rgba(37,227,155,.16)!important;color:#7dffc8!important;border-color:rgba(37,227,155,.5)!important}',
    '.fxPopSt{animation:fxPop .45s cubic-bezier(.3,1.6,.5,1) both}',

    /* coracao grande no post */
    '.fxCurtida{position:absolute;left:50%;top:50%;width:26%;aspect-ratio:1;margin:-13% 0 0 -13%;color:#fff;z-index:5;pointer-events:none;',
    'filter:drop-shadow(0 6px 16px rgba(0,0,0,.4));animation:fxCurte 1.1s cubic-bezier(.2,0,0,1) forwards}',
    '.fxCurtida svg{display:block;width:100%;height:100%}',
    '@keyframes fxCurte{0%{transform:scale(0);opacity:0}15%{transform:scale(1.15);opacity:1}30%{transform:scale(.95)}45%{transform:scale(1)}80%{opacity:1}100%{transform:scale(1) translateY(-14px);opacity:0}}',
    '.fxCurtiu{color:#ff4d7d!important;transition:color .2s}',

    /* preco que rola */
    '.fxRola{animation:fxRola .45s cubic-bezier(.05,.7,.1,1)}',
    '@keyframes fxRola{from{opacity:0;transform:translateY(60%)}to{opacity:1;transform:none}}',

    /* flutuar */
    '.fxFlutua{animation:fxFlutua 6s ease-in-out infinite}',
    '@keyframes fxFlutua{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}',

    /* reduzir movimento: tudo parado e visivel */
    '@media(prefers-reduced-motion:reduce){.fxTrilho,.fxOnda svg,.fxBorda::before,.fxBrilho::after,.fxSeta,.fxSelo .fxSelo__anel,.fxDig i,.fxCor,.fxDest__anel,.fxFlutua,.fxRola,.fxPedNovo,.fxPopSt{animation:none!important}',
    '.fxBrilho::after{display:none}}',
    '@media print{.fxProg,.fxCoracoes{display:none}html.fxOn .fxNit,html.fxOn .fxCas>*{opacity:1!important;filter:none!important;transform:none!important}}'
  ].join('\n');

  function injetarCss() {
    if (D.getElementById('mvEfeitosCss')) return;
    var st = D.createElement('style');
    st.id = 'mvEfeitosCss';
    st.textContent = CSS;
    (D.head || H).appendChild(st);
  }

  /* ------------------------------------------------------------------ */
  /* utilitarios                                                          */
  /* ------------------------------------------------------------------ */
  function $all(sel, raiz) {
    if (!sel) return [];
    try { return Array.prototype.slice.call((raiz || D).querySelectorAll(sel)); } catch (e) { return []; }
  }
  function el(tag, cls, txt) {
    var n = D.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function abaixoDaDobra(n) {
    var r = n.getBoundingClientRect();
    return r.top > (W.innerHeight || 700) - 10;
  }
  // tira o elemento do mvmotion.js (ele ja teria revelado com fade simples)
  function tomarDoMotion(n) {
    n.setAttribute('data-mv-sem-motion', '');
    n.classList.remove('mv-rv', 'mv-rv-in');
  }
  // Rede de seguranca: num salto grande (atalho, ancora, "voltar ao topo") o navegador as vezes
  // nao entrega o aviso do IntersectionObserver. A rolagem confere quem ainda espera e esta na tela.
  var esperando = [], conferirAgendado = false;
  function conferir() {
    conferirAgendado = false;
    var vh = W.innerHeight || 700;
    for (var i = esperando.length - 1; i >= 0; i--) {
      var x = esperando[i], r = x.n.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh * 0.92 && x.n.getClientRects().length) { esperando.splice(i, 1); x.solta(); }
    }
  }
  function pedeConferir() { if (!conferirAgendado && esperando.length) { conferirAgendado = true; W.requestAnimationFrame(conferir); } }
  W.addEventListener('scroll', pedeConferir, { passive: true });
  W.addEventListener('hashchange', function () { setTimeout(pedeConferir, 60); });
  function quandoVisivel(n, fn, limiar) {
    if (!TEM_IO) { fn(); return; }
    var feito = false, io = null, item = null;
    function solta() {
      if (feito) return; feito = true;
      if (io) io.disconnect();
      var k = esperando.indexOf(item); if (k >= 0) esperando.splice(k, 1);
      fn();
    }
    item = { n: n, solta: solta };
    esperando.push(item);
    io = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) if (es[i].isIntersecting) { solta(); return; }
    }, { threshold: limiar || 0, rootMargin: '0px 0px -8% 0px' });
    io.observe(n);
  }
  function itens(attr) {
    return String(attr || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_CORACAO = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21l-7.8-7.5-1-1.1a5.5 5.5 0 0 1 7.8-7.8l1 1.1 1-1.1a5.5 5.5 0 0 1 7.8 7.8l-1 1.1z"/></svg>';

  /* ------------------------------------------------------------------ */
  /* 1. barra de leitura                                                  */
  /* ------------------------------------------------------------------ */
  function progresso() {
    if (!CFG.progresso) return;
    var b = el('div', 'fxProg');
    b.setAttribute('aria-hidden', 'true');
    D.body.appendChild(b);
    var pend = false;
    function pinta() {
      pend = false;
      var se = D.scrollingElement || H;
      var max = se.scrollHeight - W.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, (W.scrollY || se.scrollTop || 0) / max)) : 0;
      b.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    function pede() { if (!pend) { pend = true; W.requestAnimationFrame(pinta); } }
    W.addEventListener('scroll', pede, { passive: true });
    W.addEventListener('resize', pede, { passive: true });
    pinta();
  }

  /* ------------------------------------------------------------------ */
  /* 2. faixas diagonais correndo                                         */
  /* ------------------------------------------------------------------ */
  function trilho(lista) {
    var t = el('div', 'fxTrilho');
    // grupo repetido 3x para cobrir tela larga; trilho = grupo + grupo (laco em -50%)
    for (var g = 0; g < 2; g++) {
      for (var r = 0; r < 3; r++) {
        for (var i = 0; i < lista.length; i++) {
          var s = el('span', null, lista[i]);
          s.appendChild(el('i', null, '✦'));
          t.appendChild(s);
        }
      }
    }
    return t;
  }
  function faixas() {
    $all('[data-fx="faixa"]').forEach(function (m) {
      var a = itens(m.getAttribute('data-fx-a')), b = itens(m.getAttribute('data-fx-b'));
      if (!a.length) return;
      m.className = 'fxFaixas';
      m.setAttribute('aria-hidden', 'true');
      tomarDoMotion(m);
      if (b.length) { var bb = el('div', 'fxBand fxBand--b'); bb.appendChild(trilho(b)); m.appendChild(bb); }
      var ba = el('div', 'fxBand fxBand--a'); ba.appendChild(trilho(a)); m.appendChild(ba);
      // texto lido por leitor de tela uma vez so
      var sr = el('p', null, a.join(' · '));
      sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
      m.parentNode.insertBefore(sr, m);
      // fora da tela, o trilho para (economiza bateria)
      if (TEM_IO) new IntersectionObserver(function (es) {
        var on = es[0] && es[0].isIntersecting;
        $all('.fxTrilho', m).forEach(function (t) { t.style.animationPlayState = on ? 'running' : 'paused'; });
      }).observe(m);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 3. numeros de regra que contam                                       */
  /* ------------------------------------------------------------------ */
  function numeros() {
    $all('[data-fx="numeros"]').forEach(function (m) {
      var lista = String(m.getAttribute('data-fx-itens') || '').split(';').map(function (p) {
        // valor|texto|sufixo|prefixo  (ex.: 0|de comissao por venda|%  ou  38|ramos com pagina propria||+)
        var x = p.split('|'); return { v: parseInt(x[0], 10), t: (x[1] || '').trim(), su: x[2] || '', pr: x[3] || '' };
      }).filter(function (o) { return !isNaN(o.v) && o.t; });
      if (!lista.length) return;
      m.className = 'fxNums';
      var bs = [];
      lista.forEach(function (o) {
        var c = el('div', 'fxNum');
        var b = el('b', null, o.pr + o.v + o.su);
        c.appendChild(b);
        var s = el('span', null, o.t);
        c.appendChild(s);
        m.appendChild(c);
        bs.push({ b: b, v: o.v, de: o.v === 0 ? 9 : 0, su: o.su, pr: o.pr });
      });
      if (!ANIMA) return;
      bs.forEach(function (x) { x.b.textContent = x.pr + x.de + x.su; });
      quandoVisivel(m, function () {
        var t0 = null, dur = 1300;
        function passo(t) {
          if (t0 === null) t0 = t;
          var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
          bs.forEach(function (x) { x.b.textContent = x.pr + Math.round(x.de + (x.v - x.de) * e) + x.su; });
          if (p < 1) W.requestAnimationFrame(passo);
        }
        W.requestAnimationFrame(passo);
      }, 0.4);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 4. titulo que sai do desfocado                                       */
  /* ------------------------------------------------------------------ */
  function nitido() {
    if (!ANIMA || location.hash) return;
    $all(CFG.nitido).forEach(function (h) {
      if (!abaixoDaDobra(h)) return;
      tomarDoMotion(h);
      h.classList.add('fxNit');
      quandoVisivel(h, function () {
        h.classList.add('fxIn');
        setTimeout(function () { h.classList.remove('fxNit', 'fxIn'); }, 1100);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 5. cascata                                                           */
  /* ------------------------------------------------------------------ */
  function cascata() {
    if (!ANIMA || location.hash) return;
    $all(CFG.cascata).forEach(function (c) {
      if (!abaixoDaDobra(c) || !c.children.length) return;
      tomarDoMotion(c);
      // a tabela inteira fica com o motion base desligado (so as linhas entram)
      var tab = c.closest && c.closest('table'); if (tab) tomarDoMotion(tab);
      for (var i = 0; i < c.children.length; i++) {
        c.children[i].style.setProperty('--fxD', (Math.min(i, 12) * 80) + 'ms');
        tomarDoMotion(c.children[i]);
      }
      c.classList.add('fxCas');
      quandoVisivel(c, function () {
        c.classList.add('fxIn');
        setTimeout(function () {
          c.classList.remove('fxCas', 'fxIn');
          for (var i = 0; i < c.children.length; i++) c.children[i].style.removeProperty('--fxD');
        }, 1900);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 6. borda com luz girando / 7. brilho no botao                        */
  /* ------------------------------------------------------------------ */
  function bordas() {
    if (REDUZ) return;
    $all(CFG.borda).forEach(function (c) { c.classList.add('fxBorda'); });
  }
  function botoes() {
    if (REDUZ) return;
    $all(CFG.botoes).forEach(function (b, i) {
      b.classList.add('fxBrilho');
      b.style.setProperty('--fxB', ((i % 3) * 0.9) + 's');
      // a seta final vira um span que anda (so texto, nada de HTML vindo de fora)
      var ult = b.lastChild;
      while (ult && ult.nodeType === 3 && !ult.nodeValue.trim()) ult = ult.previousSibling;
      if (ult && ult.nodeType === 3 && /→\s*$/.test(ult.nodeValue)) {
        var txt = ult.nodeValue.replace(/→\s*$/, '');
        ult.nodeValue = txt;
        var s = el('span', 'fxSeta', '→');
        s.setAttribute('aria-hidden', 'true');
        b.insertBefore(s, ult.nextSibling);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* 8. coracoes subindo no telefone da live                              */
  /* ------------------------------------------------------------------ */
  function coracoes() {
    if (REDUZ || POUPA || !CFG.coracoes) return;
    var tel = D.querySelector(CFG.coracoes);
    if (!tel || /avTel--arte/.test(tel.className)) return;
    var camada = el('div', 'fxCoracoes');
    camada.setAttribute('aria-hidden', 'true');
    tel.appendChild(camada);
    var vis = !TEM_IO, timer = null;
    function um() {
      if (camada.childNodes.length >= 8) return;
      var h = el('div', 'fxCor');
      h.innerHTML = SVG_CORACAO;
      var alt = tel.clientHeight || 700;
      h.style.setProperty('--sobe', Math.round(alt * 0.27) + 'px');
      h.style.setProperty('--dx', (Math.round(Math.random() * 56) - 38) * (tel.clientWidth || 360) / 390 + 'px');
      camada.appendChild(h);
      setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 1900);
    }
    function ciclo() {
      timer = null;
      if (!vis || D.hidden) return;
      // toques em rajada, como gente de verdade curtindo
      var n = Math.random() < 0.35 ? 3 : 1;
      for (var i = 0; i < n; i++) setTimeout(um, i * 170);
      timer = setTimeout(ciclo, 700 + Math.random() * 1300);
    }
    function liga() { if (!timer && vis && !D.hidden) timer = setTimeout(ciclo, 400); }
    if (TEM_IO) new IntersectionObserver(function (es) {
      vis = !!(es[0] && es[0].isIntersecting);
      if (vis) liga();
    }, { threshold: 0.35 }).observe(tel);
    D.addEventListener('visibilitychange', liga);
    var comeca = function () { setTimeout(liga, 1500); };
    if (D.readyState === 'complete') comeca(); else W.addEventListener('load', comeca);
  }

  /* ------------------------------------------------------------------ */
  /* 9. secao clara com ondas                                             */
  /* ------------------------------------------------------------------ */
  function onda(lado) {
    var box = el('div', 'fxOnda fxOnda--' + lado);
    box.setAttribute('aria-hidden', 'true');
    var d = 'M0 32 C360 0 1080 64 1440 32 C1800 0 2520 64 2880 32 V60 H0 Z';
    ['fxOnda--tras', ''].forEach(function (cls) {
      var s = D.createElementNS(SVG_NS, 'svg');
      s.setAttribute('viewBox', '0 0 2880 60');
      s.setAttribute('preserveAspectRatio', 'none');
      if (cls) s.setAttribute('class', cls);
      var p = D.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', '#eef5ff');
      s.appendChild(p);
      box.appendChild(s);
    });
    return box;
  }
  function claro() {
    if (!CFG.claro) return;
    var s = D.querySelector(CFG.claro);
    if (!s) return;
    s.classList.add('fxClaro');
    s.insertBefore(onda('cima'), s.firstChild);
    s.appendChild(onda('baixo'));
    if (TEM_IO) new IntersectionObserver(function (es) {
      var on = es[0] && es[0].isIntersecting;
      $all('.fxOnda svg', s).forEach(function (v) { v.style.animationPlayState = on ? 'running' : 'paused'; });
    }).observe(s);
  }

  /* ------------------------------------------------------------------ */
  /* 10. chat de exemplo chegando uma mensagem por vez                    */
  /* ------------------------------------------------------------------ */
  var CHAT = [
    { n: 'Dani', t: 'Ainda dá pra pedir hoje?' },
    { n: 'Loja', l: 1, t: 'Dá sim! Toca em “Quero este” 👇' },
    { n: 'Rafa', t: 'Faz entrega no meu bairro?' },
    { n: 'Loja', l: 1, t: 'Faço! A taxa do seu bairro aparece no pedido.' },
    { s: 1, t: 'Dani tocou em “Quero este”' }
  ];
  function msg(o) {
    var m;
    if (o.s) { m = el('div', 'fxMsg fxMsg--sis', o.t); return m; }
    m = el('div', 'fxMsg' + (o.l ? ' fxMsg--loja' : ''));
    m.appendChild(el('b', null, o.n));
    m.appendChild(D.createTextNode(o.t));
    return m;
  }
  function chat() {
    $all('[data-fx="chat"]').forEach(function (m) {
      m.className = 'fxChat';
      m.setAttribute('role', 'group');
      m.setAttribute('aria-label', 'Exemplo de chat de uma live no Moviki');
      var topo = el('div', 'fxChat__topo'); topo.appendChild(el('i')); topo.appendChild(D.createTextNode('Chat da live · exemplo'));
      var lista = el('div', 'fxChat__lista');
      m.appendChild(topo); m.appendChild(lista);
      m.appendChild(el('p', 'fxChat__leg', 'Tocou em “Quero este”, o pedido chega no seu WhatsApp.'));
      if (!ANIMA) { CHAT.forEach(function (o) { lista.appendChild(msg(o)); }); return; }
      quandoVisivel(m, function () {
        var i = 0;
        function proxima() {
          if (i >= CHAT.length) return;
          var o = CHAT[i++];
          var dig = null;
          if (!o.s) { dig = el('div', 'fxDig'); dig.appendChild(el('i')); dig.appendChild(el('i')); dig.appendChild(el('i')); lista.appendChild(dig); }
          setTimeout(function () {
            if (dig && dig.parentNode) dig.parentNode.removeChild(dig);
            var n = msg(o); n.classList.add('fxNovo'); lista.appendChild(n);
            setTimeout(proxima, 650);
          }, o.s ? 300 : (o.l ? 900 : 700));
        }
        proxima();
      }, 0.35);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 11. carrossel "uma live para cada tipo de loja"                     */
  /* ------------------------------------------------------------------ */
  // Os 12 primeiros, na ordem de vitrine (aparecem na hora, sem esperar rede).
  // 16/10/2026 (fx4): o resto vem do catalogo unico de ramos (ramos.js, so d:1 = pagina
  // propria na /aovivo). Telefone que nao carregar (ramos/<k>.* ausente) some sozinho.
  var RAMOS_CARROSSEL = [
    ['moda', 'Moda feminina'], ['moda-masculina', 'Moda masculina'], ['acai', 'Açaí'],
    ['autopecas', 'Autopeças'], ['pet', 'Pet shop'], ['confeitaria', 'Confeitaria'],
    ['calcados', 'Calçados'], ['otica', 'Ótica'], ['floricultura', 'Floricultura'],
    ['acessorios-celular', 'Acessórios de celular'], ['semijoias', 'Semijoias'], ['padaria', 'Padaria']
  ];
  var V_RAMOS = '?v=20261001';
  // Mesmo dominio de proposito: o CSP da home e da /aovivo so libera script do proprio site.
  // O vercel.json repassa /ramos.js para app.moviki.com.br/ramos.js (catalogo unico).
  var RAMOS_JS = '/ramos.js';
  function nomeCurto(n) {
    return String(n || '').replace(/\s*\([^)]*\)\s*/g, ' ').split(' / ')[0].trim();
  }
  function catalogoRamos(cb) {
    var R = W.MOVIKI_RAMOS;
    if (R && R.lista) return cb(R);
    var sc = D.getElementById('fxRamosJs');
    if (!sc) {
      sc = D.createElement('script'); sc.id = 'fxRamosJs'; sc.src = RAMOS_JS; sc.async = true;
      D.head.appendChild(sc);
    }
    sc.addEventListener('load', function () { if (W.MOVIKI_RAMOS && W.MOVIKI_RAMOS.lista) cb(W.MOVIKI_RAMOS); });
  }
  function linkDoRamo(k) {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
    var base = CFG.ramosBase || location.pathname;
    if (!q) return base + '?ramo=' + encodeURIComponent(k);
    q.delete('utm_content');
    q.set('ramo', k);
    return base + '?' + q.toString();
  }
  function ramos() {
    $all('[data-fx="ramos"]').forEach(function (m) {
      var atual = W.avRamoFoto || '';
      m.className = 'fxRamos';
      // fora da secao clara do MV_FX (home): painel claro, igual a /aovivo
      var naClara = false;
      try { naClara = !!(CFG.claro && m.closest(CFG.claro)); } catch (e) {}
      if (!naClara && !(m.closest && m.closest('.fxClaro'))) m.className += ' fxRamos--claro';
      m.appendChild(el('h3', 'fxRamos__t', 'Uma live para cada tipo de loja'));
      m.appendChild(el('p', 'fxRamos__s', 'Toque no seu ramo e veja como fica.'));
      var tr = el('div', 'fxRamos__trilho');
      var ja = {};
      function poe(r) {
        if (r[0] === atual || ja[r[0]]) return;
        ja[r[0]] = 1;
        var a = el('a', 'fxRamo');
        a.href = linkDoRamo(r[0]);
        a.setAttribute('data-ev', 'aovivo_carrossel_ramo');
        var tel = el('span', 'fxRamo__tel');
        var pic = D.createElement('picture');
        var so = D.createElement('source'); so.type = 'image/webp'; so.srcset = '/ramos/' + r[0] + '.webp' + V_RAMOS; pic.appendChild(so);
        var im = D.createElement('img');
        im.src = '/ramos/' + r[0] + '.jpg' + V_RAMOS; im.width = 540; im.height = 1168;
        im.loading = 'lazy'; im.decoding = 'async'; im.alt = '';
        im.addEventListener('error', function () { if (a.parentNode) a.parentNode.removeChild(a); });
        pic.appendChild(im); tel.appendChild(pic); a.appendChild(tel);
        a.appendChild(el('span', 'fxRamo__n', r[1]));
        a.setAttribute('aria-label', 'Ver a live para ' + r[1]);
        tr.appendChild(a);
      }
      RAMOS_CARROSSEL.forEach(poe);
      try {
        catalogoRamos(function (R) {
          R.lista.forEach(function (e) {
            if (e && e.d && e.k && /^[a-z0-9-]{2,40}$/.test(e.k)) poe([e.k, nomeCurto(e.n) || e.k]);
          });
        });
      } catch (e) {}
      m.appendChild(tr);
      m.appendChild(el('p', 'fxRamos__leg', 'Cenas ilustrativas · lojas fictícias'));
      // anda sozinho de leve; parou para sempre no primeiro toque da pessoa
      if (REDUZ || POUPA || !TEM_IO) return;
      var parado = false, vis = false, timer = null;
      function parar() { parado = true; if (timer) { clearInterval(timer); timer = null; } }
      ['pointerdown', 'touchstart', 'wheel', 'keydown', 'focusin'].forEach(function (ev) { tr.addEventListener(ev, parar, { passive: true }); });
      function anda() {
        if (parado || !vis || D.hidden) return;
        var fim = tr.scrollWidth - tr.clientWidth - 4;
        var passo = (tr.firstElementChild ? tr.firstElementChild.getBoundingClientRect().width : 118) + 14;
        if (tr.scrollLeft >= fim) tr.scrollTo({ left: 0, behavior: 'smooth' });
        else tr.scrollBy({ left: passo, behavior: 'smooth' });
      }
      new IntersectionObserver(function (es) {
        vis = !!(es[0] && es[0].isIntersecting);
        if (vis && !parado && !timer) timer = setInterval(anda, 2600);
        if (!vis && timer) { clearInterval(timer); timer = null; }
      }, { threshold: 0.6 }).observe(tr);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 12. selo girando                                                     */
  /* ------------------------------------------------------------------ */
  function selo() {
    $all('[data-fx="selo"]').forEach(function (m) {
      m.className = 'fxSelo';
      m.setAttribute('role', 'img');
      m.setAttribute('aria-label', '30 dias grátis, sem cartão e sem fidelidade');
      var id = 'fxSeloArco' + Math.random().toString(36).slice(2, 7);
      var s = D.createElementNS(SVG_NS, 'svg');
      s.setAttribute('viewBox', '0 0 120 120');
      s.setAttribute('aria-hidden', 'true');
      s.innerHTML =
        '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00D4FF"/><stop offset="1" stop-color="#0066FF"/></linearGradient>' +
        '<path id="' + id + '" d="M60 60 m-47 0 a47 47 0 1 1 94 0 a47 47 0 1 1 -94 0"/></defs>' +
        '<circle cx="60" cy="60" r="58" fill="#0b1626" stroke="rgba(0,212,255,.35)" stroke-width="1.5"/>' +
        '<g class="fxSelo__anel"><text fill="#7ff0ff" font-size="9.6" font-weight="800" letter-spacing="1.4" font-family="Poppins,system-ui,sans-serif">' +
        '<textPath href="#' + id + '" textLength="292" lengthAdjust="spacingAndGlyphs">30 DIAS GRÁTIS ✦ SEM CARTÃO ✦ SEM FIDELIDADE ✦ </textPath></text></g>' +
        '<circle cx="60" cy="60" r="34" fill="url(#' + id + 'g)"/>' +
        '<text x="60" y="61" text-anchor="middle" fill="#02131f" font-size="25" font-weight="800" font-family="Poppins,system-ui,sans-serif">30</text>' +
        '<text x="60" y="76" text-anchor="middle" fill="#02131f" font-size="9" font-weight="800" letter-spacing=".6" font-family="Poppins,system-ui,sans-serif">DIAS GRÁTIS</text>';
      m.appendChild(s);
    });
  }


  /* ================================================================== */
  /* fx2 - HOME                                                           */
  /* ================================================================== */

  /* 13. destaques estilo Instagram (atalhos para as secoes) */
  function destaques() {
    $all('[data-fx="destaques"]').forEach(function (m) {
      var lista = String(m.getAttribute('data-fx-itens') || '').split(';').map(function (p) {
        var x = p.split('|'); return { t: (x[0] || '').trim(), h: (x[1] || '').trim(), i: (x[2] || '').trim(), v: (x[3] || '').trim() === 'vivo' };
      }).filter(function (o) { return o.t && /^#[a-zA-Z0-9_-]+$/.test(o.h) && D.querySelector(o.h); });
      if (lista.length < 2) return;
      m.className = 'fxDest';
      m.setAttribute('role', 'navigation');
      m.setAttribute('aria-label', 'Atalhos da página');
      tomarDoMotion(m);
      lista.forEach(function (o) {
        var a = el('a'); a.href = o.h; a.setAttribute('data-ev', 'destaque_' + o.h.slice(1));
        var anel = el('span', 'fxDest__anel' + (o.v ? ' fxDest__anel--vivo' : ''));
        var mio = el('span', 'fxDest__miolo');
        if (o.i && /^[a-z0-9-]+\.(png|webp)$/.test(o.i)) {
          var im = D.createElement('img'); im.src = '/icones-premium/' + o.i; im.alt = ''; im.width = 64; im.height = 64; im.decoding = 'async';
          im.addEventListener('error', function () { im.style.display = 'none'; });
          mio.appendChild(im);
        }
        anel.appendChild(mio);
        if (o.v) anel.appendChild(el('span', 'fxDest__vivo', 'AO VIVO'));
        a.appendChild(anel);
        a.appendChild(D.createTextNode(o.t));
        m.appendChild(a);
      });
      if (REDUZ) $all('.fxDest__anel', m).forEach(function (n) { n.style.animation = 'none'; });
    });
  }

  /* 14. palavra que troca (a largura acompanha a palavra da vez, sem buraco em volta) */
  function troca() {
    $all('[data-fx="troca"]').forEach(function (m) {
      var pal = itens(m.getAttribute('data-fx-palavras'));
      var atual = (m.textContent || '').trim();
      if (!atual || pal.length < 2) return;
      if (pal.indexOf(atual) < 0) pal.unshift(atual);
      m.className = 'fxTroca';
      m.textContent = '';
      var sp = pal.map(function (t, i) {
        var s = el('span', i ? 'fxFora' : null, t);
        if (i) s.setAttribute('aria-hidden', 'true');
        m.appendChild(s);
        return s;
      });
      function larg(s) { m.style.width = Math.ceil(s.getBoundingClientRect().width) + 'px'; }
      function daVez() { return sp.filter(function (x) { return !x.className; })[0] || sp[0]; }
      function remede() { m.style.transition = 'none'; larg(daVez()); void m.offsetWidth; m.style.transition = ''; }
      larg(sp[0]);
      try { if (D.fonts && D.fonts.ready) D.fonts.ready.then(remede); } catch (e) {}
      W.addEventListener('load', remede);
      W.addEventListener('resize', remede);
      if (REDUZ) return;
      var i = 0, vis = !TEM_IO, timer = null;
      function passo() {
        timer = null;
        if (!vis || D.hidden) return;
        var a = sp[i], b = sp[(i + 1) % sp.length];
        i = (i + 1) % sp.length;
        a.classList.add('fxSai');
        b.classList.remove('fxFora', 'fxSai');
        larg(b);
        setTimeout(function () { a.classList.remove('fxSai'); a.classList.add('fxFora'); }, 560);
        timer = setTimeout(passo, i === 0 ? 3400 : 2200);
      }
      function liga() { if (!timer && vis && !D.hidden) timer = setTimeout(passo, i === 0 ? 3000 : 2200); }
      if (TEM_IO) new IntersectionObserver(function (es) { vis = !!(es[0] && es[0].isIntersecting); if (vis) liga(); }).observe(m);
      D.addEventListener('visibilitychange', liga);
      liga();
    });
  }

  /* 15. grade de cartoes vira carrossel de arrastar no celular */
  function arrasta() {
    if (!CFG.arrasta) return;
    $all(CFG.arrasta).forEach(function (g) {
      if (g.children.length < 2) return;
      g.classList.add('fxArrasta');
      tomarDoMotion(g);
      var pts = el('div', 'fxPontos');
      pts.setAttribute('aria-hidden', 'true');
      var bol = [];
      for (var i = 0; i < g.children.length; i++) { var b = el('i'); pts.appendChild(b); bol.push(b); }
      if (g.nextSibling) g.parentNode.insertBefore(pts, g.nextSibling); else g.parentNode.appendChild(pts);
      function marca(k) { bol.forEach(function (b, j) { b.classList.toggle('on', j === k); }); }
      marca(0);
      if (TEM_IO) {
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) marca(Array.prototype.indexOf.call(g.children, e.target)); });
        }, { root: g, threshold: 0.6 });
        for (var j = 0; j < g.children.length; j++) io.observe(g.children[j]);
      }
      // cartao que ja nasce no centro (ex.: Premium)
      if (CFG.arrastaFoco) {
        var f = g.querySelector(CFG.arrastaFoco);
        if (f) W.requestAnimationFrame(function () {
          if (g.scrollWidth <= g.clientWidth + 4) return;
          g.scrollLeft = Math.max(0, f.offsetLeft - g.offsetLeft - (g.clientWidth - f.offsetWidth) / 2);
        });
      }
    });
  }

  /* 16. barra fixa de cadastro no celular */
  function barra() {
    var c = CFG.barra;
    if (!c || !c.href || !/^https:\/\/app\.moviki\.com\.br\//.test(c.href)) return;
    var b = el('div', 'fxBarra fora');
    var a = el('a', null, c.texto || 'Começar grátis');
    a.href = c.href;
    if (c.ev) a.setAttribute('data-ev', c.ev);
    b.appendChild(a);
    if (c.sub) b.appendChild(el('small', null, c.sub));
    D.body.appendChild(b);
    D.body.classList.add('fxComBarra');
    if (!REDUZ) a.classList.add('fxBrilho');
    if (!TEM_IO) { b.classList.remove('fora'); return; }
    var vis = new Set(), passouTopo = false;
    function decide() {
      var aviso = D.getElementById('mvAvisoMed');
      var some = vis.size > 0 || !passouTopo || (aviso && aviso.getClientRects().length);
      b.classList.toggle('fora', !!some);
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) vis.add(e.target); else vis.delete(e.target); });
      decide();
    });
    $all(c.some).forEach(function (n) { io.observe(n); });
    var topo = D.querySelector(c.topo || 'section');
    if (topo) new IntersectionObserver(function (es) {
      var e = es[0]; passouTopo = !!(e && !e.isIntersecting && e.boundingClientRect.top < 0); decide();
    }).observe(topo);
    setInterval(decide, 1500);
  }

  /* 17. mapa: o pino "voce" anda pela rota do mapinha */
  function mapaVivo() {
    if (REDUZ || !CFG.mapaVivo) return;
    $all(CFG.mapaVivo).forEach(function (m) {
      var svg = m.querySelector('svg'), path = svg && svg.querySelector('path');
      var eu = m.querySelector('.fn-mapa__eu'), onda = m.querySelector('.fn-mapa__onda');
      if (!path || !eu || !path.getTotalLength) return;
      var vb = (svg.getAttribute('viewBox') || '0 0 100 40').split(/\s+/).map(Number);
      var L = path.getTotalLength(), vis = false, t0 = null, raf = null, DUR = 11000;
      function quadro(t) {
        raf = null;
        if (!vis || D.hidden) { t0 = null; return; }
        if (t0 === null) t0 = t - 0;
        var p = ((t - t0) % DUR) / DUR;
        var w = m.clientWidth, h = m.clientHeight;
        var pt = path.getPointAtLength(L * (0.08 + 0.84 * p));
        var x = pt.x / vb[2] * w - 0.5 * w, y = pt.y / vb[3] * h - 0.58 * h;
        var op = p < 0.06 ? p / 0.06 : (p > 0.94 ? (1 - p) / 0.06 : 1);
        // 'translate' separado: o pino ja usa transform:rotate(-45deg) e a onda anima transform
        eu.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px'; eu.style.opacity = op.toFixed(2);
        if (onda) { onda.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px'; onda.style.opacity = op.toFixed(2); }
        raf = W.requestAnimationFrame(quadro);
      }
      function liga() { if (!raf && vis && !D.hidden) raf = W.requestAnimationFrame(quadro); }
      if (TEM_IO) new IntersectionObserver(function (es) { vis = !!(es[0] && es[0].isIntersecting); liga(); }).observe(m);
      D.addEventListener('visibilitychange', liga);
    });
  }

  /* 18. pedidos chegando na tela de Pedidos (altura travada: nada abaixo pula) */
  function pedidos() {
    if (REDUZ || !CFG.pedidos) return;
    $all(CFG.pedidos).forEach(function (t) {
      var cards = $all('.pdCard', t);
      if (cards.length < 2) return;
      var cont = t.querySelector('.pdTopo span');
      var st1 = cards[0].querySelector('.pdSt');
      var ultimo = cards[cards.length - 1];
      var orig = { cont: cont ? cont.textContent : '', st: st1 ? st1.textContent : '', stCls: st1 ? st1.className : '' };
      var vis = false, rodando = false;
      function novo() {
        var c = el('div', 'pdCard fxPedNovo');
        var l1 = el('div', 'pdL1'); l1.appendChild(el('b', null, '#0043 · Carla'));
        l1.appendChild(el('span', 'pdSt pdSt--pronto fxStNovo', 'Novo · Pix pago'));
        c.appendChild(l1);
        c.appendChild(el('div', 'pdItem', '1× Bolsa tiracolo caramelo'));
        c.appendChild(el('div', 'pdInfo', 'Retirada na loja · Pix pago'));
        return c;
      }
      function ciclo() {
        if (!vis || D.hidden) { rodando = false; return; }
        rodando = true;
        if (!t.style.height) { t.style.height = t.offsetHeight + 'px'; t.style.overflow = 'hidden'; }
        var c = novo();
        setTimeout(function () {
          if (!vis) { rodando = false; return; }
          ultimo.classList.add('fxPedSai');
          setTimeout(function () { ultimo.style.display = 'none'; ultimo.classList.remove('fxPedSai'); }, 430);
          cards[0].parentNode.insertBefore(c, cards[0]);
          if (cont) { cont.textContent = '4 novos'; cont.classList.add('fxPopSt'); }
        }, 900);
        setTimeout(function () {
          if (st1) { st1.textContent = 'Pronto para retirar'; st1.className = 'pdSt pdSt--pronto fxPopSt'; }
        }, 3400);
        setTimeout(function () {
          c.classList.add('fxPedSai');
          setTimeout(function () {
            if (c.parentNode) c.parentNode.removeChild(c);
            ultimo.style.display = '';
            ultimo.classList.add('fxPedNovo');
            setTimeout(function () { ultimo.classList.remove('fxPedNovo'); }, 700);
            if (cont) { cont.textContent = orig.cont; cont.classList.remove('fxPopSt'); }
            if (st1) { st1.textContent = orig.st; st1.className = orig.stCls; }
            setTimeout(ciclo, 1800);
          }, 430);
        }, 7600);
      }
      if (TEM_IO) new IntersectionObserver(function (es) {
        vis = !!(es[0] && es[0].isIntersecting);
        if (vis && !rodando) setTimeout(ciclo, 600);
      }, { threshold: 0.45 }).observe(t);
    });
  }

  /* 19. coracao grande no post (dois toques do Instagram) */
  function curtir() {
    if (REDUZ || !CFG.curtir) return;
    $all(CFG.curtir).forEach(function (post) {
      var arte = post.querySelector('.lp-post__arte') || post;
      var ic = post.querySelector('.lp-post__acoes span');
      var vis = false, timer = null;
      function uma() {
        timer = null;
        if (!vis || D.hidden) return;
        var h = el('div', 'fxCurtida'); h.innerHTML = SVG_CORACAO; h.setAttribute('aria-hidden', 'true');
        arte.appendChild(h);
        if (ic) { ic.classList.add('fxCurtiu'); }
        setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 1150);
        setTimeout(function () { if (ic) ic.classList.remove('fxCurtiu'); }, 2600);
        timer = setTimeout(uma, 5200);
      }
      if (TEM_IO) new IntersectionObserver(function (es) {
        vis = !!(es[0] && es[0].isIntersecting);
        if (vis && !timer) timer = setTimeout(uma, 900);
      }, { threshold: 0.5 }).observe(post);
    });
  }

  /* 20. preco que rola quando troca mensal/anual */
  function precos() {
    if (REDUZ || !CFG.precos || !W.MutationObserver) return;
    $all(CFG.precos).forEach(function (p) {
      var antes = p.textContent;
      new MutationObserver(function () {
        if (p.textContent === antes) return;
        antes = p.textContent;
        p.classList.remove('fxRola'); void p.offsetWidth; p.classList.add('fxRola');
      }).observe(p, { childList: true, characterData: true, subtree: true });
    });
  }

  /* 21. flutuar */
  function flutua() {
    if (REDUZ || !CFG.flutua) return;
    $all(CFG.flutua).forEach(function (n, i) {
      n.classList.add('fxFlutua');
      n.style.animationDelay = (-i * 1.7) + 's';
    });
  }

  /* ------------------------------------------------------------------ */
  /* PARTIDA                                                              */
  /* ------------------------------------------------------------------ */
  function iniciar() {
    injetarCss();
    var passos = [destaques, troca, faixas, numeros, chat, ramos, selo, claro, arrasta, bordas, botoes, barra, progresso, nitido, cascata, coracoes,
                  mapaVivo, pedidos, curtir, precos, flutua];
    for (var i = 0; i < passos.length; i++) { try { passos[i](); } catch (e) {} }
    if (ANIMA && !location.hash) H.classList.add('fxOn');
    W.addEventListener('beforeprint', function () { H.classList.remove('fxOn'); });
    api.ligado = true;
    api.reduzido = REDUZ;
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
