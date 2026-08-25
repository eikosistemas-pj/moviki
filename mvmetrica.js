/*!
 * mvmetrica.js — medicao do funil Moviki (Google Analytics 4).
 * IDENTICO nos repos moviki e moviki-app. Servido do proprio dominio.
 *
 * O que faz:
 *  - Carrega o gtag.js OFICIAL do Google e configura a propriedade GA4.
 *  - Liga a atribuicao entre dominios (moviki.com.br <-> app.moviki.com.br),
 *    pra mesma pessoa vinda do site continuar a MESMA sessao no painel.
 *  - Expoe window.mvEv(nome, params) pro codigo do painel medir eventos.
 *  - Mede sozinho: page_view (automatico) e cta_painel (clique em link/botao
 *    que leva pro painel — por delegacao; nenhum <a> individual precisa ser
 *    tocado, entao link novo ja nasce medido).
 *  - window.mvIds() devolve {cid, sid} pro checkout amarrar a venda a sessao.
 *  - window.mvSignup(metodo) mede o cadastro com trava anti-duplicata.
 *
 * DESLIGADO POR PADRAO / SEGURO SUBIR ANTES DE EXISTIR A PROPRIEDADE:
 *  - Enquanto MV_GA_ID for o placeholder 'G-XXXXXXXXXX', NADA acontece:
 *    nao carrega gtag, nao faz requisicao, nao grava cookie. A pagina segue
 *    100% igual. Por isso da pra subir este arquivo hoje.
 *  - Sinais de publicidade/personalizacao desligados (Consent Mode): so
 *    analytics, nada de anuncio.
 *
 * PRA LIGAR: troque a linha MV_GA_ID abaixo pelo ID real (G-XXXXXXXXXX) da
 * propriedade GA4 — a MESMA troca nos dois repos (moviki e moviki-app).
 */
(function () {
  'use strict';

  // >>> TROQUE AQUI pelo ID real da propriedade GA4 (comeca com G-). <<<
  var MV_GA_ID = 'G-XXXXXXXXXX';

  // Dominios do funil, pra atribuicao entre o site e o painel.
  var MV_DOMINIOS = ['moviki.com.br', 'app.moviki.com.br'];

  // Ainda no placeholder? Define no-ops e sai — pagina segue normal.
  var LIGADO = /^G-[A-Z0-9]{6,}$/.test(MV_GA_ID) && MV_GA_ID !== 'G-XXXXXXXXXX';
  if (!LIGADO) {
    window.mvEv = function () {};
    window.mvSignup = function () {};
    window.mvIds = function () { return Promise.resolve({ cid: '', sid: '' }); };
    return;
  }

  // ---- base do gtag ----
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  // Consentimento: analytics SIM, anuncio NAO. Desliga sinais de publicidade
  // de proposito (base legal do site e so medir o proprio funil).
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
    functionality_storage: 'granted',
    security_storage: 'granted'
  });

  gtag('js', new Date());
  gtag('config', MV_GA_ID, {
    linker: { domains: MV_DOMINIOS, accept_incoming: true }
  });

  // Carrega o gtag.js oficial (assincrono). O mvEv ja funciona antes de chegar,
  // porque empilha no dataLayer e o gtag.js processa a fila ao carregar.
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MV_GA_ID);
  (document.head || document.documentElement).appendChild(s);

  // ---- API pro codigo do painel ----
  window.mvEv = function (nome, params) {
    try { gtag('event', String(nome), params || {}); } catch (e) {}
  };

  // sign_up com trava anti-duplicata: um carregamento de pagina cria no maximo
  // uma conta, entao so o primeiro disparo vale.
  window.mvSignup = function (metodo) {
    if (window._mvSignupSent) return;
    window._mvSignupSent = 1;
    try { gtag('event', 'sign_up', { method: metodo || 'email' }); } catch (e) {}
  };

  // Devolve {cid, sid} da sessao GA4. Usado pelo checkout pra amarrar a venda
  // (o servidor dispara o purchase depois, com esses ids). NUNCA trava o
  // checkout: resolve em no maximo 800ms mesmo se o gtag demorar.
  window.mvIds = function () {
    return new Promise(function (resolve) {
      var out = { cid: '', sid: '' }, faltam = 2, pronto = false;
      function fim() { if (!pronto && --faltam <= 0) { pronto = true; resolve(out); } }
      try {
        gtag('get', MV_GA_ID, 'client_id', function (v) { out.cid = v ? String(v) : ''; fim(); });
        gtag('get', MV_GA_ID, 'session_id', function (v) { out.sid = v ? String(v) : ''; fim(); });
      } catch (e) { pronto = true; resolve(out); return; }
      setTimeout(function () { if (!pronto) { pronto = true; resolve(out); } }, 800);
    });
  };

  // ---- cta_painel por delegacao de clique ----
  // Qualquer clique num link que leve pro painel (app.moviki.com.br) ou que
  // carregue ?plano= vira um cta_painel. Sem tocar em nenhum <a> individual.
  document.addEventListener('click', function (ev) {
    try {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/app\.moviki\.com\.br/i.test(href) || /[?&]plano=/i.test(href)) {
        var m = href.match(/[?&]plano=([a-z]+)/i);
        gtag('event', 'cta_painel', {
          destino: 'painel',
          plano: m ? m[1].toLowerCase() : '',
          texto: (a.textContent || '').trim().slice(0, 60),
          pagina: location.pathname
        });
      }
    } catch (e) {}
  }, true);
})();
