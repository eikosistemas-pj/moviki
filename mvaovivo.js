/*!
 * MOVIKI mvaovivo.js | versao 2026-09-16-vitrinelive | repo: moviki
 *
 * A VITRINE DE QUEM ESTA TRANSMITINDO AGORA.
 *
 * O buraco que isto fecha: ate 16/09/2026 nenhuma superficie publica do Moviki
 * mostrava quem estava ao vivo. A live so era descoberta pelo link que o
 * proprio lojista mandava no WhatsApp — ou seja, o Moviki nao entregava um
 * unico espectador. O lojista trazia a audiencia que ja tinha, e a promessa de
 * "vender em tempo real para quem esta perto" nao se cumpria em lugar nenhum.
 * Isso e o que decide se o Premium vale a segunda mensalidade.
 *
 * COMO NAO PESAR NA LANDING: nada de SDK do Firebase. Um fetch para
 * /api/vitrine?modo=aovivo, que le o Firestore no servidor e fica 20 s no
 * cache da CDN — mil visitantes na home custam UMA leitura.
 *
 * VAZIO SOME. Sem ninguem no ar, o bloco nao aparece. "Nenhuma live agora" num
 * produto novo nao e transparencia: e cartaz de loja fechada na vitrine.
 *
 * SO REVALIDA COM A ABA A VISTA. Aba esquecida aberta a noite inteira nao fica
 * batendo no endpoint.
 *
 * COMO USAR: <div id="mvAoVivo"></div> mais
 *            <script src="/mvaovivo.js" defer></script>
 */
(function () {
  'use strict';

  var CAIXA = 'mvAoVivo';
  var FONTE = '/api/vitrine?modo=aovivo';
  var INTERVALO = 60000;
  var ligado = false;

  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Nome do lojista e do segmento vem do Firestore. Escapar nao e paranoia:
     e o unico lugar onde texto escrito por um lojista entra na HOME. */
  function inicial(nome) {
    var n = String(nome || '').trim();
    return n ? n.charAt(0).toUpperCase() : 'M';
  }

  function haQuanto(inicioMs) {
    if (!inicioMs) return '';
    var min = Math.floor((Date.now() - inicioMs) / 60000);
    if (min < 1) return 'começou agora';
    if (min < 60) return 'no ar há ' + min + ' min';
    var h = Math.floor(min / 60);
    return 'no ar há ' + h + (h === 1 ? ' hora' : ' horas');
  }

  function estilo() {
    if (el('mvAoVivoCss')) return;
    var s = document.createElement('style');
    s.id = 'mvAoVivoCss';
    s.textContent = [
      '#mvAoVivo{margin:0 auto;padding:26px 16px 6px;max-width:1120px}',
      '.mvAvTopo{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}',
      '.mvAvTit{font-size:clamp(19px,3.4vw,26px);font-weight:800;letter-spacing:-.01em;margin:0}',
      '.mvAvPonto{width:9px;height:9px;border-radius:50%;background:#ff3b5c;box-shadow:0 0 0 0 rgba(255,59,92,.7);animation:mvAvPulso 1.8s infinite}',
      '@keyframes mvAvPulso{70%{box-shadow:0 0 0 10px rgba(255,59,92,0)}100%{box-shadow:0 0 0 0 rgba(255,59,92,0)}}',
      '@media (prefers-reduced-motion: reduce){.mvAvPonto{animation:none}}',
      '.mvAvGrade{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}',
      '.mvAvCard{display:flex;gap:12px;align-items:center;padding:12px;border-radius:16px;text-decoration:none;',
      'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);transition:border-color .18s,transform .18s}',
      '.mvAvCard:hover{border-color:rgba(0,212,255,.5);transform:translateY(-2px)}',
      '.mvAvFoto{width:46px;height:46px;border-radius:12px;object-fit:cover;flex:0 0 46px;background:#12233c}',
      '.mvAvIni{width:46px;height:46px;border-radius:12px;flex:0 0 46px;display:grid;place-items:center;',
      'font-weight:800;font-size:19px;color:#0b1728;background:linear-gradient(135deg,#00d4ff,#7b61ff)}',
      '.mvAvInfo{min-width:0}',
      '.mvAvNome{font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:inherit}',
      '.mvAvSub{font-size:12px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.mvAvSelo{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;letter-spacing:.04em;',
      'color:#fff;background:#ff3b5c;border-radius:999px;padding:2px 8px;margin-bottom:3px}'
    ].join('');
    document.head.appendChild(s);
  }

  function pintar(lives) {
    var caixa = el(CAIXA);
    if (!caixa) return;

    /* Vazio: o bloco some inteiro. Ver o comentario do topo. */
    if (!lives || !lives.length) { caixa.innerHTML = ''; caixa.style.display = 'none'; return; }

    estilo();
    caixa.style.display = '';
    var n = lives.length;
    var html = '<div class="mvAvTopo"><span class="mvAvPonto"></span>' +
      '<h2 class="mvAvTit">Ao vivo agora</h2>' +
      '<span class="mvAvSub">' + n + (n === 1 ? ' negócio transmitindo' : ' negócios transmitindo') + '</span></div>' +
      '<div class="mvAvGrade">';

    for (var i = 0; i < lives.length; i++) {
      var v = lives[i] || {};
      var slug = String(v.slug || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (!slug) continue;
      var foto = v.logo
        ? '<img class="mvAvFoto" src="' + esc(v.logo) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">'
        : '<div class="mvAvIni">' + esc(inicial(v.nome)) + '</div>';
      var sub = [esc(v.segmento || ''), haQuanto(Number(v.inicioMs) || 0)].filter(Boolean).join(' · ');
      html += '<a class="mvAvCard" href="/live/' + slug + '" data-ev="aovivo_card">' + foto +
        '<div class="mvAvInfo"><span class="mvAvSelo">● AO VIVO</span>' +
        '<div class="mvAvNome">' + esc(v.nome) + '</div>' +
        '<div class="mvAvSub">' + sub + '</div></div></a>';
    }
    caixa.innerHTML = html + '</div>';

    try { if (window.mvEv) window.mvEv('aovivo_vitrine', { quantos: n }); } catch (e) {}
  }

  function buscar() {
    if (document.hidden) return;
    fetch(FONTE, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { pintar(j && j.lives); })
      /* Falha aberta: sem lista, o bloco some e a home segue inteira. */
      .catch(function () { pintar(null); });
  }

  function comecar() {
    if (ligado || !el(CAIXA)) return;
    ligado = true;
    buscar();
    setInterval(buscar, INTERVALO);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) buscar(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', comecar);
  else comecar();
})();
