/*!
 * mvefeitos.js - EFEITOS VISUAIS das paginas de venda do site (repo moviki).
 * Marca de versao: digitar  mvEfeitos.versao  no console do navegador.
 * 13/10/2026 (fx1): primeira versao, na /aovivo (vale para todos os ramos).
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

  var VERSAO = '2026-10-13-fx1';
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

    /* selo girando */
    '.fxSelo{width:118px;height:118px;margin:0 auto 14px;position:relative}',
    '.fxSelo svg{display:block;width:100%;height:100%;overflow:visible}',
    '.fxSelo .fxSelo__anel{transform-origin:60px 60px;animation:fxRoda 20s linear infinite}',
    '@keyframes fxRoda{to{transform:rotate(360deg)}}',

    /* reduzir movimento: tudo parado e visivel */
    '@media(prefers-reduced-motion:reduce){.fxTrilho,.fxOnda svg,.fxBorda::before,.fxBrilho::after,.fxSeta,.fxSelo .fxSelo__anel,.fxDig i,.fxCor{animation:none!important}',
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
  function quandoVisivel(n, fn, limiar) {
    if (!TEM_IO) { fn(); return; }
    var io = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) if (es[i].isIntersecting) { io.disconnect(); fn(); return; }
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
        var x = p.split('|'); return { v: parseInt(x[0], 10), t: (x[1] || '').trim() };
      }).filter(function (o) { return !isNaN(o.v) && o.t; });
      if (!lista.length) return;
      m.className = 'fxNums';
      var bs = [];
      lista.forEach(function (o) {
        var c = el('div', 'fxNum');
        var b = el('b', null, String(o.v));
        c.appendChild(b);
        var s = el('span', null, o.t);
        c.appendChild(s);
        m.appendChild(c);
        bs.push({ b: b, v: o.v, de: o.v === 0 ? 9 : 0 });
      });
      if (!ANIMA) return;
      bs.forEach(function (x) { x.b.textContent = String(x.de); });
      quandoVisivel(m, function () {
        var t0 = null, dur = 1300;
        function passo(t) {
          if (t0 === null) t0 = t;
          var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
          bs.forEach(function (x) { x.b.textContent = String(Math.round(x.de + (x.v - x.de) * e)); });
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
  // So ramos com telefone proprio em ramos/<k>.* (conferido no _arvore.txt em 13/10/2026).
  // Fora de proposito: farmacia, suplementos, lingerie, bebe, brinquedos e moda infantil.
  var RAMOS_CARROSSEL = [
    ['moda', 'Moda feminina'], ['moda-masculina', 'Moda masculina'], ['acai', 'Açaí'],
    ['autopecas', 'Autopeças'], ['pet', 'Pet shop'], ['confeitaria', 'Confeitaria'],
    ['calcados', 'Calçados'], ['otica', 'Ótica'], ['floricultura', 'Floricultura'],
    ['acessorios-celular', 'Acessórios de celular'], ['semijoias', 'Semijoias'], ['padaria', 'Padaria']
  ];
  var V_RAMOS = '?v=20261001';
  function linkDoRamo(k) {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
    if (!q) return location.pathname + '?ramo=' + encodeURIComponent(k);
    q.set('ramo', k);
    return location.pathname + '?' + q.toString();
  }
  function ramos() {
    $all('[data-fx="ramos"]').forEach(function (m) {
      var atual = W.avRamoFoto || '';
      m.className = 'fxRamos';
      m.appendChild(el('h3', 'fxRamos__t', 'Uma live para cada tipo de loja'));
      m.appendChild(el('p', 'fxRamos__s', 'Toque no seu ramo e veja como fica.'));
      var tr = el('div', 'fxRamos__trilho');
      RAMOS_CARROSSEL.forEach(function (r) {
        if (r[0] === atual) return;
        var a = el('a', 'fxRamo');
        a.href = linkDoRamo(r[0]);
        a.setAttribute('data-ev', 'aovivo_carrossel_ramo');
        var tel = el('span', 'fxRamo__tel');
        var pic = D.createElement('picture');
        var so = D.createElement('source'); so.type = 'image/webp'; so.srcset = 'ramos/' + r[0] + '.webp' + V_RAMOS; pic.appendChild(so);
        var im = D.createElement('img');
        im.src = 'ramos/' + r[0] + '.jpg' + V_RAMOS; im.width = 540; im.height = 1168;
        im.loading = 'lazy'; im.decoding = 'async'; im.alt = '';
        im.addEventListener('error', function () { if (a.parentNode) a.parentNode.removeChild(a); });
        pic.appendChild(im); tel.appendChild(pic); a.appendChild(tel);
        a.appendChild(el('span', 'fxRamo__n', r[1]));
        a.setAttribute('aria-label', 'Ver a live para ' + r[1]);
        tr.appendChild(a);
      });
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

  /* ------------------------------------------------------------------ */
  /* PARTIDA                                                              */
  /* ------------------------------------------------------------------ */
  function iniciar() {
    injetarCss();
    var passos = [faixas, numeros, chat, ramos, selo, claro, bordas, botoes, progresso, nitido, cascata, coracoes];
    for (var i = 0; i < passos.length; i++) { try { passos[i](); } catch (e) {} }
    if (ANIMA && !location.hash) H.classList.add('fxOn');
    W.addEventListener('beforeprint', function () { H.classList.remove('fxOn'); });
    api.ligado = true;
    api.reduzido = REDUZ;
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
