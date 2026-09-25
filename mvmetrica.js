/*!
 * mvmetrica.js — medicao do funil Moviki (Google Analytics 4 + atribuicao Meta).
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
 *  - BLOCO META (novo, 04/09/2026): guarda o identificador do clique de anuncio
 *    (fbc/fbp), carrega ele no salto entre os dominios e injeta na chamada de
 *    cadastro, pra Conversions API conseguir ligar o Lead ao anuncio.
 *
 * DESLIGADO POR PADRAO / SEGURO SUBIR ANTES DE EXISTIR A PROPRIEDADE:
 *  - Enquanto MV_GA_ID for o placeholder 'G-XXXXXXXXXX', NADA de GA4 acontece:
 *    nao carrega gtag, nao faz requisicao, nao grava cookie. A pagina segue
 *    100% igual. O bloco Meta funciona independente disso, de proposito.
 *  - Sinais de publicidade/personalizacao desligados (Consent Mode): so
 *    analytics, nada de anuncio.
 *
 * PRA LIGAR O GA4: troque a linha MV_GA_ID abaixo pelo ID real (G-XXXXXXXXXX)
 * da propriedade GA4 — a MESMA troca nos dois repos (moviki e moviki-app).
 *
 * 24/09/2026 (versao medicao2) — GOOGLE ADS SEM COOKIE DE ANUNCIO + AVISO:
 *  - O Google Ads mede o resultado IMPORTANDO do GA4 os eventos sign_up e
 *    purchase (propriedade GA4 vinculada a conta do Google Ads). Nenhuma tag
 *    do Google Ads e carregada aqui e os sinais de anuncio continuam
 *    'denied': o que liga o cadastro ao anuncio e o gclid da URL, que o
 *    url_passthrough carrega de pagina em pagina SEM gravar cookie.
 *  - Aviso de medicao (LGPD, base legitimo interesse): barra discreta no
 *    rodape na primeira visita, com "Ok" e "Nao medir". "Nao medir" grava
 *    mv_medicao=nao no localStorage DESTE dominio e desliga o GA4
 *    (analytics_storage denied) na hora e nas proximas visitas.
 *    moviki.com.br/?medicao=escolher reabre a barra (link na politica).
 *    Nao aparece no painel do dono nem nas telas de live.
 *
 * 25/09/2026 (versao medicao3) — "NAO MEDIR" NAO CARREGA NADA DO GOOGLE:
 *  - Com mv_medicao=nao o gtag.js nem e baixado (antes baixava e so ficava
 *    com analytics_storage negado, o que ainda manda sinal sem cookie).
 *    mvEv e mvSignup viram no-op e mvIds devolve vazio na hora.
 *  - Se a pessoa reabrir o aviso e tocar em "Ok", o gtag.js carrega ali mesmo.
 *  - Quem toca em "Nao medir" nesta visita: a medicao para aqui (consentimento
 *    negado) e, da proxima pagina em diante, o gtag.js nao e mais baixado.
 */
(function () {
  'use strict';

  // >>> TROQUE AQUI pelo ID real da propriedade GA4 (comeca com G-). <<<
  var MV_GA_ID = 'G-GG5CSQZVGH';

  // Dominios do funil, pra atribuicao entre o site e o painel.
  var MV_DOMINIOS = ['moviki.com.br', 'app.moviki.com.br'];

  /* ==================================================================== */
  /* BLOCO META — atribuicao do clique de anuncio                          */
  /* ==================================================================== */
  /*
   * POR QUE ISTO EXISTE: a Conversions API estava no ar desde 27/08 mandando
   * o Lead com email, telefone e external_id — e mesmo assim a campanha
   * marcava ZERO conversao. Faltava o parametro do clique. Sem fbc, a Meta
   * recebe o cadastro e nao sabe de qual anuncio ele veio, entao nao credita
   * a campanha e o algoritmo otimiza no escuro.
   *
   * POR QUE sessionStorage E NAO COOKIE: o privacidade.html diz, na secao 9,
   * que o site nao usa cookie de publicidade — foi essa frase que decidiu, em
   * 27/08, pela CAPI em vez do pixel. Gravar o cookie _fbc contradiria a mesma
   * politica. sessionStorage nao e cookie, nao vai em nenhuma requisicao
   * automatica, morre ao fechar a aba e cobre o cadastro feito na mesma
   * sessao — que e a quase totalidade de quem vem de anuncio.
   *
   * O SALTO ENTRE DOMINIOS: sessionStorage de moviki.com.br NAO e visivel em
   * app.moviki.com.br. Por isso o clique que leva pro painel carrega o fbclid
   * e as UTMs na propria URL, e o painel le de la. Isso conserta o buraco do
   * comerciantes.html sem precisar tocar no HTML dele.
   */

  var MV_FBC = 'mv_fbc';
  var MV_FBP = 'mv_fbp';
  var MV_UTM = 'mv_utm';

  function lerSess(k) {
    try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; }
  }
  function gravarSess(k, v) {
    try { if (v) sessionStorage.setItem(k, String(v)); } catch (e) {}
  }
  function param(nome, busca) {
    try {
      var m = String(busca == null ? location.search : busca)
        .match(new RegExp('[?&]' + nome + '=([^&#]*)'));
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    } catch (e) { return ''; }
  }

  /* fbc no formato exigido pela Meta: fb.<subdominio>.<criado_em>.<fbclid>.
     O indice 1 e o valor usado por dominio de segundo nivel. O carimbo de
     tempo e o do PRIMEIRO clique — por isso, se ja existe um fbc guardado,
     ele nao e sobrescrito por um clique posterior na mesma sessao. */
  function montarFbc(fbclid) {
    var id = String(fbclid || '').trim();
    if (!id || id.length > 400) return '';
    if (!/^[A-Za-z0-9._-]+$/.test(id)) return '';
    return 'fb.1.' + Date.now() + '.' + id;
  }

  /* fbp: identificador do navegador. Formato fb.1.<criado_em>.<numero>.
     Nao identifica pessoa nenhuma, e so um numero aleatorio que ajuda a Meta
     a casar eventos da MESMA sessao. Vive junto com o fbc e morre junto. */
  function montarFbp() {
    var n = '';
    try {
      var a = new Uint32Array(2);
      (window.crypto || window.msCrypto).getRandomValues(a);
      n = String(a[0]) + String(a[1]).slice(0, 2);
    } catch (e) {
      n = String(Math.floor(Math.random() * 1e10));
    }
    return 'fb.1.' + Date.now() + '.' + n.slice(0, 12);
  }

  // 1) Captura na chegada. Vale tanto pro clique direto do anuncio quanto pro
  //    salto do site pro painel, porque os dois trazem fbclid na URL.
  (function capturarChegada() {
    try {
      var jaFbc = lerSess(MV_FBC);
      var fbclid = param('fbclid');
      if (!jaFbc && fbclid) gravarSess(MV_FBC, montarFbc(fbclid));
      // Alguns saltos carregam o fbc ja montado em vez do fbclid cru.
      if (!lerSess(MV_FBC)) {
        var pronto = param('mvfbc');
        if (/^fb\.\d\.\d+\..+/.test(pronto)) gravarSess(MV_FBC, pronto);
      }
      // fbp so nasce se houver clique de anuncio na jornada. Sem anuncio,
      // nada e gravado — visita organica nao ganha identificador nenhum.
      if (lerSess(MV_FBC) && !lerSess(MV_FBP)) {
        var herdado = param('mvfbp');
        gravarSess(MV_FBP, /^fb\.\d\.\d+\.\d+$/.test(herdado) ? herdado : montarFbp());
      }
      // UTMs viajam junto pro painel poder registrar a origem do cadastro.
      if (!lerSess(MV_UTM)) {
        var utm = [];
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
          .forEach(function (k) { var v = param(k); if (v) utm.push(k + '=' + encodeURIComponent(v.slice(0, 120))); });
        if (utm.length) gravarSess(MV_UTM, utm.join('&'));
      }
    } catch (e) {}
  })();

  // Exposto pra quem precisar (o painel, um teste manual no console).
  window.mvFb = function () {
    return { fbc: lerSess(MV_FBC), fbp: lerSess(MV_FBP), utm: lerSess(MV_UTM) };
  };

  // 2) Decora os links que levam pro painel, pra atribuicao atravessar o salto
  //    de dominio. Idempotente: um href ja decorado nao e decorado de novo.
  function decorar(a) {
    try {
      if (!a || a.getAttribute('data-mvfb') === '1') return;
      var href = a.getAttribute('href') || '';
      if (!/app\.moviki\.com\.br/i.test(href)) return;
      var fbc = lerSess(MV_FBC);
      if (!fbc) return;                                  // sem anuncio, sem sujeira na URL
      if (/[?&]mvfbc=/.test(href)) { a.setAttribute('data-mvfb', '1'); return; }
      var extra = 'mvfbc=' + encodeURIComponent(fbc);
      var fbp = lerSess(MV_FBP);
      if (fbp) extra += '&mvfbp=' + encodeURIComponent(fbp);
      var utm = lerSess(MV_UTM);
      if (utm && !/[?&]utm_source=/.test(href)) extra += '&' + utm;
      var base = href.split('#');
      var hash = base.length > 1 ? ('#' + base.slice(1).join('#')) : '';
      a.setAttribute('href', base[0] + (base[0].indexOf('?') >= 0 ? '&' : '?') + extra + hash);
      a.setAttribute('data-mvfb', '1');
    } catch (e) {}
  }
  function decorarTudo() {
    try {
      var l = document.querySelectorAll('a[href*="app.moviki.com.br"]');
      for (var i = 0; i < l.length; i++) decorar(l[i]);
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorarTudo);
  } else {
    decorarTudo();
  }
  // Link criado depois (menu que abre, modal, botao montado por JS) e decorado
  // no proprio clique, antes da navegacao.
  document.addEventListener('click', function (ev) {
    try {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (a) decorar(a);
    } catch (e) {}
  }, true);

  // 3) Injeta fbc/fbp na chamada de cadastro do robo.
  //    POR QUE AQUI E NAO NO index.html: existem cinco pontos de criacao de
  //    conta no painel, todos chamando /api/novo-cliente ou /api/novo-parceiro
  //    de dentro de um arquivo enorme. Envolver o fetch cobre os cinco de uma
  //    vez, sem tocar naquele arquivo. Se qualquer coisa aqui falhar, a chamada
  //    original segue intacta — cadastro NUNCA quebra por causa de medicao.
  (function envolverFetch() {
    try {
      if (typeof window.fetch !== 'function' || window._mvFetchOk) return;
      var original = window.fetch;
      window._mvFetchOk = 1;
      window.fetch = function (entrada, opcoes) {
        try {
          var url = typeof entrada === 'string' ? entrada
            : (entrada && entrada.url ? entrada.url : '');
          if (/\/api\/novo-(cliente|parceiro)\b/.test(url) &&
              opcoes && typeof opcoes.body === 'string') {
            var fbc = lerSess(MV_FBC);
            var fbp = lerSess(MV_FBP);
            if (fbc || fbp) {
              var corpo = JSON.parse(opcoes.body);
              if (corpo && typeof corpo === 'object') {
                if (fbc && !corpo.fbc) corpo.fbc = fbc;
                if (fbp && !corpo.fbp) corpo.fbp = fbp;
                if (!corpo.origemUrl) corpo.origemUrl = String(location.href).split('#')[0].slice(0, 500);
                opcoes = Object.assign({}, opcoes, { body: JSON.stringify(corpo) });
              }
            }
          }
        } catch (e) {}
        return original.apply(this, [entrada, opcoes]);
      };
    } catch (e) {}
  })();

  /* ==================================================================== */
  /* BLOCO GA4                                                             */
  /* ==================================================================== */

  // Ainda no placeholder? Define no-ops e sai — pagina segue normal.
  // O bloco Meta acima ja rodou de proposito: a atribuicao do anuncio nao
  // depende do GA4 estar configurado.
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

  // Escolha da pessoa sobre a medicao (aviso no rodape). 'nao' = sem GA4.
  function lerLocal(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function gravarLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var MV_MED = 'mv_medicao';
  var semMedicao = lerLocal(MV_MED) === 'nao';

  // Consentimento: analytics SIM (salvo recusa), anuncio NAO. Desliga sinais
  // de publicidade de proposito (base legal do site e so medir o proprio funil).
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: semMedicao ? 'denied' : 'granted',
    functionality_storage: 'granted',
    security_storage: 'granted'
  });
  // Com ad_storage negado, o gclid do anuncio do Google nao vira cookie: o
  // url_passthrough leva ele na URL ate a pagina do cadastro, e o GA4 credita
  // a campanha. E isso que o Google Ads importa como conversao.
  gtag('set', 'url_passthrough', true);

  gtag('js', new Date());
  gtag('config', MV_GA_ID, {
    linker: { domains: MV_DOMINIOS, accept_incoming: true }
  });

  // Carrega o gtag.js oficial (assincrono). O mvEv ja funciona antes de chegar,
  // porque empilha no dataLayer e o gtag.js processa a fila ao carregar.
  // medicao3: com "Nao medir" escolhido, o gtag.js NAO e baixado.
  var gtagCarregado = false;
  function carregarGtag() {
    if (gtagCarregado) return;
    gtagCarregado = true;
    try {
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MV_GA_ID);
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }
  function medindo() { return lerLocal(MV_MED) !== 'nao'; }
  if (!semMedicao) carregarGtag();

  // ---- API pro codigo do painel ----
  window.mvEv = function (nome, params) {
    if (!medindo()) return;
    try { gtag('event', String(nome), params || {}); } catch (e) {}
  };

  // sign_up com trava anti-duplicata: um carregamento de pagina cria no maximo
  // uma conta, entao so o primeiro disparo vale.
  window.mvSignup = function (metodo) {
    if (!medindo()) return;
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
      if (!medindo() || !gtagCarregado) { resolve(out); return; }
      function fim() { if (!pronto && --faltam <= 0) { pronto = true; resolve(out); } }
      try {
        gtag('get', MV_GA_ID, 'client_id', function (v) { out.cid = v ? String(v) : ''; fim(); });
        gtag('get', MV_GA_ID, 'session_id', function (v) { out.sid = v ? String(v) : ''; fim(); });
      } catch (e) { pronto = true; resolve(out); return; }
      setTimeout(function () { if (!pronto) { pronto = true; resolve(out); } }, 800);
    });
  };

  // ---- aviso de medicao (LGPD) ----
  (function avisoMedicao() {
    try {
      var reabrir = param('medicao') === 'escolher';
      if (lerLocal(MV_MED) && !reabrir) return;
      if (/eikoadm01|\/live|aovivo/i.test(location.pathname)) return;
      function montar() {
        if (document.getElementById('mvAvisoMed') || !document.body) return;
        var b = document.createElement('div');
        b.id = 'mvAvisoMed';
        b.setAttribute('role', 'region');
        b.setAttribute('aria-label', 'Aviso de medi\u00e7\u00e3o');
        b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));' +
          'z-index:2147483000;max-width:560px;margin:0 auto;background:#0b1630;color:#eaf6ff;' +
          'border:1px solid rgba(0,212,255,.35);border-radius:14px;padding:12px 14px;' +
          'box-shadow:0 10px 30px rgba(0,0,0,.35);font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
          'display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px';
        var t = document.createElement('span');
        t.style.cssText = 'flex:1 1 260px';
        t.appendChild(document.createTextNode('Usamos um cookie de medi\u00e7\u00e3o (Google Analytics) para entender como o site \u00e9 usado e quais an\u00fancios trazem cadastros. Nenhum cookie de publicidade. '));
        var l = document.createElement('a');
        l.href = 'https://moviki.com.br/privacidade.html';
        l.textContent = 'Pol\u00edtica de privacidade';
        l.style.cssText = 'color:#00d4ff;text-decoration:underline';
        t.appendChild(l);
        function botao(txt, principal, acao) {
          var x = document.createElement('button');
          x.type = 'button';
          x.textContent = txt;
          x.style.cssText = 'cursor:pointer;border-radius:10px;padding:8px 14px;font:600 13px system-ui,sans-serif;' +
            (principal ? 'border:0;background:#00d4ff;color:#04121f' : 'border:1px solid rgba(234,246,255,.35);background:transparent;color:#eaf6ff');
          x.addEventListener('click', function () { acao(); try { b.remove(); } catch (e) { b.parentNode && b.parentNode.removeChild(b); } });
          return x;
        }
        b.appendChild(t);
        b.appendChild(botao('N\u00e3o medir', false, function () {
          gravarLocal(MV_MED, 'nao');
          try { gtag('consent', 'update', { analytics_storage: 'denied' }); } catch (e) {}
        }));
        b.appendChild(botao('Ok', true, function () {
          gravarLocal(MV_MED, 'sim');
          try { gtag('consent', 'update', { analytics_storage: 'granted' }); } catch (e) {}
          carregarGtag();
        }));
        document.body.appendChild(b);
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
      else montar();
    } catch (e) {}
  })();

  // ---- cta_painel por delegacao de clique ----
  // Qualquer clique num link que leve pro painel (app.moviki.com.br) ou que
  // carregue ?plano= vira um cta_painel. Sem tocar em nenhum <a> individual.
  document.addEventListener('click', function (ev) {
    try {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (!medindo()) return;
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

/* ==================================================================== */
/* MOTION (23/09/2026) - carrega o mvmotion.js (movimento + lazy        */
/* loading) em toda pagina que ja carrega este arquivo. Nenhum HTML      */
/* precisa mudar. Sem o mvmotion.js no ar, a pagina segue 100% igual.    */
/* Chave-mestra do movimento: MV_MOTION_LIGADO no proprio mvmotion.js.   */
/* ==================================================================== */
(function () {
  try {
    if (window.mvMotion || document.getElementById('mvMotionJs')) return;
    var s = document.createElement('script');
    s.id = 'mvMotionJs';
    s.src = '/mvmotion.js';
    s.async = true;
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}
})();
