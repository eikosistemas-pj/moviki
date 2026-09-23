/*!
 * mvmotion.js - sistema unico de MOVIMENTO e LAZY LOADING do Moviki.
 * IDENTICO nos repos moviki e moviki-app. Servido do proprio dominio.
 * Marca de versao: digitar  mvMotion.versao  no console do navegador.
 *
 * Como chega nas paginas:
 *  - Toda pagina que carrega o mvmetrica.js recebe este arquivo sozinha
 *    (o mvmetrica.js injeta <script src="/mvmotion.js">). Nenhum HTML muda.
 *  - Pagina sem mvmetrica.js (parceiro.html, eikoadm01.html) precisa de UMA
 *    linha no <head>:  <script src="/mvmotion.js" defer></script>
 *
 * Principios (vault: R - Motion principles):
 *  1. Movimento explica, nunca enfeita: entrada de tela, overlay, lista.
 *  2. So opacity e translate/scale - nada que recalcule layout.
 *  3. Duracoes curtas: 120 micro, 180 rapido, 240 base, 320 medio, 560 lento.
 *     Saida sempre mais rapida que a entrada.
 *  4. Ferramenta nao espera: nos paineis nao existe revelacao por rolagem,
 *     so a entrada do que acabou de aparecer (aba, modal, aviso).
 *  5. prefers-reduced-motion desliga tudo. Sempre.
 *  6. Nada fica escondido se o JS falhar: o estado oculto so nasce aqui,
 *     e so para o que esta ABAIXO da dobra.
 *
 * CHAVE-MESTRA: troque MV_MOTION_LIGADO para false e suba o arquivo - desliga
 * todo o movimento deste arquivo nos dois dominios de uma vez.
 * Diagnostico por visitante: ?motion=0 na URL, ou localStorage mv_motion = '0'.
 * Pagina ou trecho que nao deve se mexer: atributo data-mv-sem-motion.
 * Forcar modo numa pagina: <html data-mv-motion="painel|pagina|off">.
 */
(function () {
  'use strict';

  // >>> CHAVE-MESTRA. false = desliga todo o movimento deste arquivo. <<<
  var MV_MOTION_LIGADO = true;

  var VERSAO = '2026-09-23-motion1';
  var W = window, D = document, H = D.documentElement;
  if (W.mvMotion) return;

  function nada() {}
  var api = {
    versao: VERSAO, ligado: false, modo: 'off',
    entrar: nada, revelar: nada,
    sair: function (el, fim) { if (fim) fim(); }
  };
  W.mvMotion = api;

  var busca = '';
  try { busca = location.search || ''; } catch (e) {}
  var offLocal = false;
  try { offLocal = !!(W.localStorage && W.localStorage.getItem('mv_motion') === '0'); } catch (e) {}
  if (!MV_MOTION_LIGADO || /[?&]motion=0(&|$)/.test(busca) || offLocal) return;

  /* ------------------------------------------------------------------ */
  /* MODO DA PAGINA                                                      */
  /* ------------------------------------------------------------------ */
  var host = String(location.hostname || '');
  var caminho = String(location.pathname || '/').replace(/\/+$/, '') || '/';
  var ehApp = /^app\./i.test(host);
  var ehLive = /^\/live(\.html)?$/i.test(caminho) || /^\/live\//i.test(caminho);
  var ehPainel = ehApp && /^\/(index(\.html)?|parceiro(\.html)?|eikoadm01(\.html)?|criador)?$/i.test(caminho);
  var forcado = H.getAttribute('data-mv-motion');
  var modo = forcado || (ehLive ? 'live' : (ehPainel ? 'painel' : 'pagina'));
  if (modo === 'off') return;

  var mqReduz = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduz() { return !!(mqReduz && mqReduz.matches); }

  var TEM_TRANSLATE = !!(W.CSS && CSS.supports && CSS.supports('translate', '0 1px'));
  var EASE = {
    padrao: 'cubic-bezier(.2,0,0,1)',
    entra: 'cubic-bezier(.05,.7,.1,1)',
    sai: 'cubic-bezier(.3,0,.8,.15)'
  };
  var DUR = { micro: 120, rapido: 180, base: 240, medio: 320, lento: 560 };

  /* ------------------------------------------------------------------ */
  /* CSS (injetado: vale tambem nas paginas sem movikiui.css)            */
  /* ------------------------------------------------------------------ */
  var BOTOES = 'button,[role="button"],input[type="submit"],input[type="button"],.mv-btn,a[class*="btn" i],a[class*="botao" i],a[class*="cta" i]';
  var CSS_TXT = [
    ':root{--mv-ease:cubic-bezier(.2,0,0,1);--mv-ease-entra:cubic-bezier(.05,.7,.1,1);--mv-ease-sai:cubic-bezier(.3,0,.8,.15);',
    '--mv-dur-micro:120ms;--mv-dur-rapido:180ms;--mv-dur-base:240ms;--mv-dur-medio:320ms;--mv-dur-lento:560ms}',
    ':where(' + BOTOES + '){-webkit-tap-highlight-color:transparent}',
    '@media (prefers-reduced-motion:no-preference){',
    ':where(' + BOTOES + '){transition-property:scale,transform,filter,background-color,border-color,color,box-shadow,opacity;',
    'transition-duration:var(--mv-dur-rapido);transition-timing-function:var(--mv-ease)}',
    ':where(' + BOTOES + '):where(:active:not(:disabled):not([aria-disabled="true"])){scale:.97}',
    '@view-transition{navigation:auto}',
    '}',
    '::view-transition-old(root),::view-transition-new(root){animation-duration:.22s;animation-timing-function:cubic-bezier(.2,0,0,1)}',
    ':where(a,button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])):focus-visible{outline:2px solid var(--mv-ciano,#00D4FF);outline-offset:2px}',
    'html.mv-mo .mv-rv{opacity:0;translate:0 18px}',
    'html.mv-mo .mv-rv.mv-rv-in{opacity:1;translate:0 0;',
    'transition:opacity var(--mv-dur-lento) var(--mv-ease-entra) var(--mv-rv-atraso,0ms),translate var(--mv-dur-lento) var(--mv-ease-entra) var(--mv-rv-atraso,0ms)}',
    'html.mv-mo img.mv-img{opacity:0}',
    'html.mv-mo img.mv-img.mv-img-in{opacity:1;transition:opacity var(--mv-dur-medio) var(--mv-ease)}',
    '.mv-skel{position:relative;overflow:hidden;background:rgba(255,255,255,.05);border-radius:10px}',
    '.mv-skel::after{content:"";position:absolute;inset:0;transform:translateX(-100%);',
    'background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent);animation:mvSkel 1.3s cubic-bezier(.2,0,0,1) infinite}',
    '@keyframes mvSkel{to{transform:translateX(100%)}}',
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:1ms!important;animation-delay:0s!important;',
    'animation-iteration-count:1!important;transition-duration:1ms!important;transition-delay:0s!important;scroll-behavior:auto!important}}',
    '@media print{html.mv-mo .mv-rv,html.mv-mo img.mv-img{opacity:1!important;translate:none!important}}'
  ].join('');

  function injetarCss() {
    if (D.getElementById('mvMotionCss')) return;
    var st = D.createElement('style');
    st.id = 'mvMotionCss';
    st.textContent = CSS_TXT;
    (D.head || H).appendChild(st);
  }

  /* ------------------------------------------------------------------ */
  /* ANIMACAO BASE (Web Animations API)                                  */
  /* ------------------------------------------------------------------ */
  function limparQuadros(kf) {
    if (TEM_TRANSLATE) return kf;
    return kf.map(function (q) {
      var n = {};
      for (var k in q) if (k !== 'translate' && k !== 'scale') n[k] = q[k];
      return n;
    });
  }
  function animar(el, kf, dur, ease, atraso) {
    try {
      return el.animate(limparQuadros(kf), { duration: dur, easing: ease, delay: atraso || 0, fill: 'backwards' });
    } catch (e) { return null; }
  }

  var IGNORA_TAG = /^(VIDEO|CANVAS|IFRAME|IMG|SCRIPT|STYLE|LINK|META|OPTION|SOURCE|TRACK|BR|HR|SVG|PATH|TEMPLATE)$/i;
  var FORA_SEL = '[data-mv-sem-motion],.leaflet-container,.mv-rv';

  function caixaDoOverlay(ov, ro) {
    var filhos = ov.children;
    for (var i = 0; i < filhos.length && i < 6; i++) {
      var f = filhos[i];
      if (!f.getClientRects().length) continue;
      var r = f.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) continue;
      if (r.width < ro.width * 0.98 || r.height < ro.height * 0.98) return { el: f, r: r };
    }
    return null;
  }

  /* Entrada do que ACABOU de aparecer (aba, modal, aviso, barra). */
  function entrar(el) {
    if (reduz() || !el || !el.isConnected || !el.animate) return;
    if (IGNORA_TAG.test(el.tagName || '')) return;
    if (el.closest && el.closest(FORA_SEL)) return;
    if (!el.getClientRects().length) return;
    var cs = W.getComputedStyle(el);
    if (cs.display === 'inline' || cs.display === 'contents' || cs.visibility === 'hidden') return;
    if (parseFloat(cs.opacity) < 0.99) return;                 // a pagina ja cuida do proprio fade
    if (cs.animationName && cs.animationName !== 'none') return; // ja tem keyframe de entrada
    if (el.getAnimations && el.getAnimations().length) return;
    var r = el.getBoundingClientRect(), vw = W.innerWidth, vh = W.innerHeight;
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;

    if (cs.position === 'fixed' && r.width >= vw * 0.9 && r.height >= vh * 0.9) {
      // overlay de tela cheia: o fundo acende, a caixa sobe
      animar(el, [{ opacity: 0 }, { opacity: 1 }], DUR.rapido, EASE.padrao);
      var cx = caixaDoOverlay(el, r);
      if (cx) {
        var folha = cx.r.bottom >= vh - 4 && cx.r.top > vh * 0.15;
        animar(cx.el, folha
          ? [{ opacity: 0, translate: '0 48px' }, { opacity: 1, translate: '0 0' }]
          : [{ opacity: 0, translate: '0 14px', scale: '.97' }, { opacity: 1, translate: '0 0', scale: '1' }],
          DUR.medio, EASE.entra);
      }
      return;
    }
    if (cs.position === 'fixed' || cs.position === 'sticky') {
      // barra ou aviso preso na tela: entra pelo lado em que esta ancorado
      var deBaixo = r.bottom >= vh - 48;
      var deCima = r.top <= 48;
      animar(el, [{ opacity: 0, translate: deBaixo ? '0 16px' : (deCima ? '0 -12px' : '0 8px') }, { opacity: 1, translate: '0 0' }],
        DUR.base, EASE.entra);
      return;
    }
    if (r.height >= 120 && r.width >= 180) {
      animar(el, [{ opacity: 0, translate: '0 10px' }, { opacity: 1, translate: '0 0' }], DUR.base, EASE.entra);
    } else {
      animar(el, [{ opacity: 0 }, { opacity: 1 }], DUR.rapido, EASE.padrao);
    }
  }

  /* Saida para uso das paginas: mvMotion.sair(el, function(){ esconder }) */
  function sair(el, fim) {
    var feito = false;
    function ok() { if (feito) return; feito = true; if (fim) fim(); }
    if (reduz() || !el || !el.animate || !el.getClientRects().length) { ok(); return; }
    var a = animar(el, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 6px' }], DUR.rapido - 40, EASE.sai);
    if (!a) { ok(); return; }
    a.onfinish = ok;
    setTimeout(ok, DUR.rapido + 60);
  }

  /* ------------------------------------------------------------------ */
  /* DETECTOR DE APARICAO - escuta class/style/hidden em toda a pagina   */
  /* So reage quando o estado ANTERIOR era escondido.                    */
  /* ------------------------------------------------------------------ */
  var OCULTA_CLASSE = /(^|\s)(hide|hidden|escondido|escondida|oculto|oculta|mv-oculto|qzEscondido|d-none|invisivel)(?=\s|$)/;
  var OCULTA_ESTILO = /display\s*:\s*none/i;
  var fila = [], agendado = false;

  function processarFila() {
    agendado = false;
    var lista = fila.splice(0, fila.length), unicos = [];
    for (var i = 0; i < lista.length && unicos.length < 40; i++) {
      if (unicos.indexOf(lista[i]) < 0) unicos.push(lista[i]);
    }
    var topo = unicos.filter(function (el) {
      for (var j = 0; j < unicos.length; j++) {
        var o = unicos[j];
        if (o !== el && o.contains(el)) return false;
      }
      return true;
    });
    for (var k = 0; k < topo.length && k < 10; k++) entrar(topo[k]);
  }

  function observarAparicoes() {
    if (!W.MutationObserver || !W.requestAnimationFrame) return;
    var mo = new MutationObserver(function (regs) {
      for (var i = 0; i < regs.length; i++) {
        var r = regs[i], t = r.target, v = r.oldValue, n = r.attributeName;
        if (!t || t.nodeType !== 1) continue;
        if (n === 'class') {
          if (!v || !OCULTA_CLASSE.test(v)) continue;
          if (OCULTA_CLASSE.test(t.getAttribute('class') || '')) continue;
        } else if (n === 'style') {
          if (!v || !OCULTA_ESTILO.test(v)) continue;
          if (OCULTA_ESTILO.test(t.getAttribute('style') || '')) continue;
        } else if (n === 'hidden') {
          if (v === null || t.hasAttribute('hidden')) continue;
        } else continue;
        fila.push(t);
      }
      if (fila.length && !agendado) { agendado = true; W.requestAnimationFrame(processarFila); }
    });
    mo.observe(H, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'hidden'] });
  }

  /* ------------------------------------------------------------------ */
  /* REVELACAO POR ROLAGEM (so paginas, nunca paineis)                   */
  /* ------------------------------------------------------------------ */
  var SEL_BLOCOS = 'h2,.mv-card,.mv-recurso,.mv-passo,.mv-kpi,details,figure,blockquote,table,[class*="card" i],[class*="depoimento" i]';
  var FORA_REVELA = 'header,nav,footer,dialog,[role="dialog"],[data-mv-sem-motion],.leaflet-container';
  var io = null, marcados = [], MAX_MARCADOS = 350;
  var vistos = (typeof WeakSet === 'function') ? new WeakSet() : null;
  var gradeCache = (typeof WeakMap === 'function') ? new WeakMap() : null;
  var rolaCache = (typeof WeakMap === 'function') ? new WeakMap() : null;
  var revelados = (typeof WeakSet === 'function') ? new WeakSet() : { has: function () { return false; }, add: nada };

  function rolaX(el) {
    if (rolaCache.has(el)) return rolaCache.get(el);
    var ox = W.getComputedStyle(el).overflowX, r = (ox === 'auto' || ox === 'scroll');
    rolaCache.set(el, r);
    return r;
  }
  function dentroDeRolagem(el) {
    var p = el.parentElement, n = 0;
    while (p && p !== D.body && n < 10) { if (rolaX(p)) return true; p = p.parentElement; n++; }
    return false;
  }
  function ehGrade(el) {
    if (gradeCache.has(el)) return gradeCache.get(el);
    var ok = false, filhos = el.children;
    if (filhos.length >= 2 && filhos.length <= 40) {
      var cs = W.getComputedStyle(el), d = cs.display;
      var grade = d === 'grid' || d === 'inline-grid' || ((d === 'flex' || d === 'inline-flex') && cs.flexWrap === 'wrap');
      if (grade && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
        var cartoes = 0;
        for (var i = 0; i < filhos.length; i++) {
          var r = filhos[i].getBoundingClientRect();
          if (r.height >= 48 && r.width >= 110) cartoes++;
        }
        ok = cartoes >= 2;
      }
    }
    gradeCache.set(el, ok);
    return ok;
  }

  function marcar(el) {
    el.classList.add('mv-rv');
    marcados.push(el);
    io.observe(el);
  }

  function revelar(el, atraso) {
    if (!el || !el.classList || !el.classList.contains('mv-rv')) return;
    if (revelados.has(el)) return;
    revelados.add(el);
    if (io) io.unobserve(el);
    if (atraso) el.style.setProperty('--mv-rv-atraso', atraso + 'ms');
    W.requestAnimationFrame(function () { el.classList.add('mv-rv-in'); });
    setTimeout(function () {
      el.classList.remove('mv-rv', 'mv-rv-in');
      if (atraso) el.style.removeProperty('--mv-rv-atraso');
    }, DUR.lento + (atraso || 0) + 120);
  }
  function revelarTudo() {
    for (var i = 0; i < marcados.length; i++) {
      var el = marcados[i];
      if (el.classList.contains('mv-rv')) { el.classList.remove('mv-rv', 'mv-rv-in'); if (io) io.unobserve(el); }
    }
  }

  var coletas = 0;
  function coletar() {
    if (!io || reduz() || marcados.length >= MAX_MARCADOS || coletas > 60) return;
    coletas++;
    var raiz = D.body;
    if (!raiz) return;
    var vh = W.innerHeight, candidatos = new Set();

    // 1) filhos de grade (cartoes) - entram em cascata
    var conts = raiz.querySelectorAll('div,ul,ol,section');
    for (var i = 0; i < conts.length && i < 3000; i++) {
      var c = conts[i];
      if (c.children.length < 2 || !c.getClientRects().length) continue;
      if (!ehGrade(c)) continue;
      for (var j = 0; j < c.children.length; j++) candidatos.add(c.children[j]);
    }
    // 2) blocos soltos (titulos de secao, cartoes, tabelas, FAQ)
    var bl = raiz.querySelectorAll(SEL_BLOCOS);
    for (var b = 0; b < bl.length && b < 1500; b++) candidatos.add(bl[b]);

    // 1a passada: quem PODE entrar (abaixo da dobra, visivel, sem conflito)
    var aptos = [];
    candidatos.forEach(function (el) {
      if (vistos.has(el)) return;
      if (!el.getClientRects().length) return;               // escondido agora: reavalia depois
      vistos.add(el);
      if (IGNORA_TAG.test(el.tagName || '')) return;
      if (el.closest(FORA_REVELA) || el.closest('.mv-rv')) return;
      var r = el.getBoundingClientRect();
      if (r.top <= vh || r.height < 8 || r.width < 8 || r.height > vh * 2.5) return; // so abaixo da dobra
      var cs = W.getComputedStyle(el);
      if (cs.display === 'inline' || cs.display === 'contents') return;
      if (cs.position === 'fixed' || cs.position === 'sticky' || cs.position === 'absolute') return;
      if (parseFloat(cs.opacity) < 0.99 || (cs.animationName && cs.animationName !== 'none')) return;
      if (dentroDeRolagem(el)) return;
      aptos.push(el);
    });
    // 2a passada: o de fora vence - cartao dentro de cartao entra junto com o pai
    var setAptos = new Set(aptos);
    for (var k = 0; k < aptos.length && marcados.length < MAX_MARCADOS; k++) {
      var el = aptos[k], p = el.parentElement, dentro = false, n = 0;
      while (p && p !== raiz && n < 40) { if (setAptos.has(p)) { dentro = true; break; } p = p.parentElement; n++; }
      if (!dentro) marcar(el);
    }
  }

  var coletaTimer = null;
  function coletarLogo() {
    if (coletaTimer) return;
    coletaTimer = setTimeout(function () { coletaTimer = null; coletar(); }, 300);
  }

  /* ------------------------------------------------------------------ */
  /* LAZY: imagem com loading="lazy" aparece com fade quando chega       */
  /* ------------------------------------------------------------------ */
  var imgsVistas = (typeof WeakSet === 'function') ? new WeakSet() : null;
  function prepararImg(img) {
    if (!img || imgsVistas.has(img)) return;
    imgsVistas.add(img);
    if (reduz() || img.complete || img.getAttribute('loading') !== 'lazy') return;
    if (img.closest(FORA_SEL)) return;
    img.classList.add('mv-img');
    var pronto = function () {
      img.removeEventListener('load', pronto);
      img.removeEventListener('error', pronto);
      img.classList.add('mv-img-in');
      setTimeout(function () { img.classList.remove('mv-img', 'mv-img-in'); }, DUR.medio + 120);
    };
    img.addEventListener('load', pronto);
    img.addEventListener('error', pronto);
    if (img.complete) pronto();
  }
  function prepararImgsEm(no) {
    if (!no || no.nodeType !== 1) return;
    if (no.tagName === 'IMG') { prepararImg(no); return; }
    var l = no.querySelectorAll ? no.querySelectorAll('img[loading="lazy"]') : [];
    for (var i = 0; i < l.length; i++) prepararImg(l[i]);
  }

  /* ------------------------------------------------------------------ */
  /* ANCORA SUAVE (#secao) - so o clique em link, nunca o scrollTo da pagina */
  /* ------------------------------------------------------------------ */
  function ancoraSuave(ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || reduz()) return;
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!a || a.hasAttribute('onclick') || a.closest('[data-mv-sem-motion]')) return;
    var id = (a.getAttribute('href') || '').slice(1);
    if (!id) return;
    var alvo = null;
    try { alvo = D.getElementById(decodeURIComponent(id)); } catch (e) { alvo = null; }
    if (!alvo || !alvo.scrollIntoView) return;
    ev.preventDefault();
    alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { history.pushState(null, '', '#' + id); } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* PREFETCH NO HOVER (so o site, so a mesma origem, so o HTML)         */
  /* ------------------------------------------------------------------ */
  function prefetchNoHover() {
    try {
      if (ehApp || !W.HTMLScriptElement || !HTMLScriptElement.supports || !HTMLScriptElement.supports('speculationrules')) return;
      if (D.querySelector('script[type="speculationrules"]')) return;
      var cx = navigator.connection;
      if (cx && (cx.saveData || /(^|-)2g$/.test(cx.effectiveType || ''))) return;
      var s = D.createElement('script');
      s.type = 'speculationrules';
      s.textContent = JSON.stringify({
        prefetch: [{
          source: 'document',
          where: { and: [
            { href_matches: '/*' },
            { not: { href_matches: '/api/*' } },
            { not: { href_matches: '/descadastro*' } },
            { not: { href_matches: '/excluir-conta*' } },
            { not: { selector_matches: '[data-mv-sem-prefetch],[download],[target="_blank"]' } }
          ] },
          eagerness: 'moderate'
        }]
      });
      (D.head || H).appendChild(s);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ */
  /* PARTIDA                                                              */
  /* ------------------------------------------------------------------ */
  function quandoPronto(fn) {
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function iniciarPagina() {
    var podeRevelar = !!(W.IntersectionObserver && vistos && gradeCache && rolaCache && typeof Set === 'function') && !location.hash;
    if (podeRevelar) {
      io = new IntersectionObserver(function (ents) {
        var entram = [];
        for (var i = 0; i < ents.length; i++) if (ents[i].isIntersecting) entram.push(ents[i].target);
        if (!entram.length) return;
        entram.sort(function (x, y) {
          var a = x.getBoundingClientRect(), b = y.getBoundingClientRect();
          return (a.top - b.top) || (a.left - b.left);
        });
        for (var k = 0; k < entram.length; k++) revelar(entram[k], Math.min(k, 6) * 70);
      }, { rootMargin: '0px 0px -24px 0px', threshold: 0 });
      // rede de seguranca: no fim da pagina, o que ainda esta escondido e visivel entra
      var fimAgendado = false;
      var noFim = function () {
        if (fimAgendado) return;
        fimAgendado = true;
        W.requestAnimationFrame(function () {
          fimAgendado = false;
          var se = D.scrollingElement || H;
          if (W.innerHeight + (W.scrollY || se.scrollTop || 0) < se.scrollHeight - 48) return;
          for (var i = 0, n = 0; i < marcados.length; i++) {
            var el = marcados[i];
            if (el.classList.contains('mv-rv') && !el.classList.contains('mv-rv-in') && el.getBoundingClientRect().top < W.innerHeight) revelar(el, Math.min(n++, 6) * 70);
          }
        });
      };
      W.addEventListener('scroll', noFim, { passive: true });
      W.addEventListener('resize', noFim, { passive: true });
      coletar();
      W.addEventListener('load', coletarLogo);
      W.addEventListener('beforeprint', revelarTudo);
    }
    if (imgsVistas) prepararImgsEm(D.body);
    if (W.MutationObserver && D.body) {
      new MutationObserver(function (regs) {
        var houve = false;
        for (var i = 0; i < regs.length; i++) {
          var add = regs[i].addedNodes;
          for (var j = 0; j < add.length; j++) {
            if (add[j].nodeType !== 1) continue;
            houve = true;
            if (imgsVistas) prepararImgsEm(add[j]);
          }
        }
        if (houve && io) coletarLogo();
      }).observe(D.body, { childList: true, subtree: true });
    }
    D.addEventListener('click', ancoraSuave, false);
    prefetchNoHover();
  }

  injetarCss();
  H.classList.add('mv-mo');
  api.ligado = true;
  api.modo = modo;
  api.entrar = entrar;
  api.sair = sair;
  api.revelar = function (el) { revelar(el, 0); };
  observarAparicoes();
  if (modo === 'pagina') quandoPronto(iniciarPagina);
})();
