/*!
 * MOVIKI mventrega.js | versao 2026-10-03-envio | repo: moviki (site publico)
 *
 * 03/10/2026 (P70 etapa 2): modo ENVIO para outras cidades. Com o recurso
 * ligado pelo dono (checkout_publico.recursos.freteBrasil) e a tabela do
 * lojista ativa (checkout_publico.envio), o formulario pede CEP, cidade e UF
 * e mostra o frete pela regiao/estado. Quem soma no Pix continua sendo o robo.
 * O envio so vale para produto marcado "pode ir pelo correio" no cardapio:
 * envia(neg, nomes) diz quais nao podem.
 *
 * FORMULARIO DE ENTREGA DO COMPRADOR — usado pela pagina do negocio (404.html)
 * e pela live publica (live.html). Um arquivo so para as duas telas: duas
 * copias do mesmo formulario viram dois jeitos de o endereco chegar torto.
 *
 * O QUE ELE FAZ
 * - Monta os campos de endereco (CEP, rua, numero, complemento, bairro,
 *   referencia) e preenche rua, bairro e cidade pelo CEP (ViaCEP, chamado do
 *   navegador do comprador — so o CEP viaja, nada mais).
 * - Quando o lojista cadastrou a tabela de bairros, o bairro vira uma LISTA
 *   com a taxa de cada um, e a tela mostra o frete antes do Pix.
 * - Sem tabela, a entrega continua "a combinar", sem taxa no Pix.
 *
 * O QUE ELE NAO FAZ, DE PROPOSITO
 * - Nao decide o frete. O valor mostrado aqui e vitrine: quem soma a taxa ao
 *   Pix e o servidor (moviki-robo/lib/checkout.js), lendo a tabela do lojista.
 *   Forjar a taxa no F12 nao muda um centavo da cobranca.
 * - Nao grava nada em lugar nenhum.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function real(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); }
  function $(id) { return document.getElementById(id); }

  var CSS_OK = false;
  function css() {
    if (CSS_OK) return; CSS_OK = true;
    var st = document.createElement('style');
    st.textContent =
      '.mvE{margin-top:10px}' +
      '.mvELinha{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.mvELinha.l3{grid-template-columns:1.1fr .9fr}' +
      '.mvECampo{margin-bottom:9px}' +
      '.mvECampo>label{display:block;font-size:12.5px;color:var(--mv-txt-3,#8fa6c4);margin-bottom:5px}' +
      '.mvECampo select{width:100%;background:var(--mv-campo,#0b1728);color:var(--mv-txt,#fff);border:1px solid var(--mv-linha,#1c3457);border-radius:11px;padding:12px;font:inherit;font-size:15px}' +
      '.mvEFrete{display:flex;justify-content:space-between;align-items:center;gap:10px;background:rgba(0,212,255,.07);border:1px solid rgba(0,212,255,.25);border-radius:11px;padding:10px 12px;font-size:13.5px;margin:4px 0 8px}' +
      '.mvEFrete b{font-size:15px}' +
      '.mvEInfo{font-size:12px;color:var(--mv-txt-3,#8fa6c4);line-height:1.5;margin:2px 0 8px}' +
      '.mvEAviso{font-size:12.5px;color:#ffcf6b;line-height:1.45;margin:2px 0 8px}' +
      '.mvECep{position:relative}' +
      '.mvECep small{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:11.5px;color:var(--mv-txt-3,#8fa6c4)}';
    document.head.appendChild(st);
  }

  /* cfg = o documento checkout_publico/{uid} (ou o pedaço dele que importa).
     o   = { p: prefixo dos ids, wrap: classe extra do bloco de cada campo,
             input: classe extra dos inputs } */
  function temTabela(cfg) { return !!(cfg && Array.isArray(cfg.bairros) && cfg.bairros.length); }

  /* ---- ENVIO (03/10/2026) ---- */
  var UFS = { AC:'N', AP:'N', AM:'N', PA:'N', RO:'N', RR:'N', TO:'N', AL:'NE', BA:'NE', CE:'NE', MA:'NE', PB:'NE', PE:'NE', PI:'NE', RN:'NE', SE:'NE',
    DF:'CO', GO:'CO', MT:'CO', MS:'CO', ES:'SE', MG:'SE', RJ:'SE', SP:'SE', PR:'S', RS:'S', SC:'S' };
  function envioAtivo(cfg) { return !!(cfg && cfg.recursos && cfg.recursos.freteBrasil === true && cfg.envio && cfg.envio.ativo === true && cfg.entregaSuspensa !== true); }
  function freteEnvio(cfg, uf, subtotal) {
    var e = (cfg && cfg.envio) || {}, u = String(uf || '').toUpperCase();
    if (!UFS[u]) return null;
    var t = null;
    if (e.ufOrigem && u === e.ufOrigem && typeof e.mesmoEstado === 'number') t = e.mesmoEstado;
    else { var v = e.regioes && e.regioes[UFS[u]]; t = (typeof v === 'number') ? v : null; }
    if (t === null) return -1;
    if (Number(e.gratisAcima) > 0 && Number(subtotal) >= Number(e.gratisAcima)) t = 0;
    return t;
  }
  /* Quais destes produtos NAO podem ir pelo correio (o cardapio do lojista decide). */
  function semEnvio(neg, nomes) {
    var cats = (neg && Array.isArray(neg.cardapio)) ? neg.cardapio : [], fora = [];
    (nomes || []).forEach(function (n) {
      var alvo = norm(n), ok = false;
      cats.forEach(function (c) { (c && Array.isArray(c.produtos) ? c.produtos : []).forEach(function (p) { if (p && p.nome && norm(p.nome) === alvo && p.envia === true) ok = true; }); });
      if (!ok) fora.push(n);
    });
    return fora;
  }

  function freteDe(cfg, bairro) {
    if (!temTabela(cfg)) return null;
    var alvo = norm(bairro);
    for (var i = 0; i < cfg.bairros.length; i++) {
      if (norm(cfg.bairros[i].nome) === alvo) return Number(cfg.bairros[i].taxa) || 0;
    }
    return null;
  }

  function campo(o, id, rotulo, extra, tipo) {
    return '<div class="mvECampo ' + (o.wrap || '') + '"><label for="' + id + '">' + rotulo + '</label>' +
      '<input id="' + id + '" class="' + (o.input || '') + '" type="' + (tipo || 'text') + '" ' + (extra || '') + '></div>';
  }

  function html(cfg, o) {
    css();
    var p = o.p || 'mvE', envio = o.modo === 'envio';
    var h = '<div class="mvE" id="' + p + 'EntBox">';
    h += '<div class="mvECampo mvECep ' + (o.wrap || '') + '"><label for="' + p + 'Cep">CEP</label>' +
      '<input id="' + p + 'Cep" class="' + (o.input || '') + '" type="text" inputmode="numeric" maxlength="9" autocomplete="postal-code" placeholder="00000-000">' +
      '<small id="' + p + 'CepSt"></small></div>';
    h += campo(o, p + 'Rua', 'Rua ou avenida', 'maxlength="90" autocomplete="address-line1"');
    h += '<div class="mvELinha l3">' +
      campo(o, p + 'Num', 'Número', 'maxlength="12" inputmode="text"') +
      campo(o, p + 'Comp', 'Complemento', 'maxlength="60" placeholder="Apto, bloco"') +
      '</div>';
    if (envio) {
      h += campo(o, p + 'Bairro', 'Bairro', 'maxlength="50"');
      h += '<div class="mvELinha l3">' + campo(o, p + 'Cid', 'Cidade', 'maxlength="40" autocomplete="address-level2"') +
        campo(o, p + 'Uf', 'Estado (UF)', 'maxlength="2" autocomplete="address-level1" style="text-transform:uppercase"') + '</div>';
    } else if (temTabela(cfg)) {
      h += '<div class="mvECampo ' + (o.wrap || '') + '"><label for="' + p + 'Bairro">Bairro</label><select id="' + p + 'Bairro">' +
        '<option value="">Escolha o seu bairro</option>' +
        cfg.bairros.map(function (b) {
          var t = Number(b.taxa) || 0;
          return '<option value="' + esc(b.nome) + '">' + esc(b.nome) + ' — ' + (t > 0 ? real(t) : 'entrega grátis') + '</option>';
        }).join('') +
        '</select></div>';
    } else {
      h += campo(o, p + 'Bairro', 'Bairro', 'maxlength="50"');
    }
    h += campo(o, p + 'Ref', 'Ponto de referência', 'maxlength="90" placeholder="Opcional, ajuda muito o entregador"');
    h += '<div id="' + p + 'CidAviso" class="mvEAviso" style="display:none"></div>';
    h += '<div id="' + p + 'Frete" class="mvEFrete" style="display:none"></div>';
    var info = [];
    if (envio) {
      var en = (cfg && cfg.envio) || {};
      info.push('Envio pelo correio ou transportadora. O frete é pelo estado do CEP.');
      if (Number(en.gratisAcima) > 0) info.push('Frete grátis acima de ' + real(en.gratisAcima) + ' em produtos.');
      if (en.prazo) info.push('Prazo: ' + esc(en.prazo) + '.');
      h += '<div class="mvEInfo">' + info.join(' ') + '</div></div>';
      return h;
    }
    if (temTabela(cfg)) info.push('Seu bairro não está na lista? Este negócio ainda não entrega aí — escolha retirar no local.');
    else info.push('A taxa de entrega, se houver, é combinada com o negócio pelo WhatsApp.');
    if (cfg && Number(cfg.minimoEntrega) > 0) info.push('Pedido mínimo para entrega: ' + real(cfg.minimoEntrega) + ' em produtos.');
    if (cfg && cfg.prazo) info.push('Prazo de entrega: ' + esc(cfg.prazo) + '.');
    h += '<div class="mvEInfo">' + info.join(' ') + '</div>';
    h += '</div>';
    return h;
  }

  /* Liga os eventos. onFrete(valorOuNull) avisa a tela para repintar o total. */
  function ligar(cfg, o, onFrete) {
    var p = o.p || 'mvE', envio = o.modo === 'envio';
    var cep = $(p + 'Cep'), bai = $(p + 'Bairro');
    var ultimo = '';
    var cidadeCep = '', ufCep = '';
    function pintarFrete() {
      var box = $(p + 'Frete'); if (!box) return;
      if (envio) {
        var ufEl = $(p + 'Uf'), uf = ufEl ? ufEl.value.trim().toUpperCase() : '';
        var fe = uf ? freteEnvio(cfg, uf, o.sub ? o.sub() : 0) : null;
        if (fe === null) { box.style.display = 'none'; if (onFrete) onFrete(null); return; }
        box.style.display = '';
        if (fe < 0) { box.innerHTML = '<span>Este negócio ainda não envia para ' + esc(uf) + '.</span>'; if (onFrete) onFrete(null); return; }
        box.innerHTML = '<span>Frete para ' + esc(uf) + ((cfg.envio && cfg.envio.prazo) ? ' · ' + esc(cfg.envio.prazo) : '') + '</span><b>' + (fe > 0 ? real(fe) : 'grátis') + '</b>';
        if (onFrete) onFrete(fe);
        return;
      }
      var v = temTabela(cfg) && bai ? freteDe(cfg, bai.value) : null;
      if (v === null) { box.style.display = 'none'; if (onFrete) onFrete(null); return; }
      box.style.display = '';
      box.innerHTML = '<span>Taxa de entrega' + (cfg.prazo ? ' · ' + esc(cfg.prazo) : '') + '</span><b>' + (v > 0 ? real(v) : 'grátis') + '</b>';
      if (onFrete) onFrete(v);
    }
    if (bai) bai.addEventListener('change', pintarFrete);
    if (cep) cep.addEventListener('input', function () {
      var d = cep.value.replace(/\D/g, '').slice(0, 8);
      cep.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
      if (d.length === 8 && d !== ultimo) { ultimo = d; buscarCep(d); }
    });
    function buscarCep(d) {
      var st = $(p + 'CepSt'); if (st) st.textContent = 'buscando…';
      var ctl = ('AbortController' in window) ? new AbortController() : null;
      var t = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (_) {} }, 6000);
      fetch('https://viacep.com.br/ws/' + d + '/json/', ctl ? { signal: ctl.signal } : {})
        .then(function (r) { return r.json(); })
        .then(function (j) {
          clearTimeout(t);
          if (!j || j.erro) { if (st) st.textContent = 'CEP não achado'; return; }
          if (st) st.textContent = '✓';
          cidadeCep = String(j.localidade || ''); ufCep = String(j.uf || '');
          if (envio) { var ci = $(p + 'Cid'), uu = $(p + 'Uf'); if (ci && !ci.value) ci.value = cidadeCep; if (uu) uu.value = ufCep; }
          var rua = $(p + 'Rua');
          if (rua && j.logradouro && !rua.value) rua.value = j.logradouro;
          if (bai && j.bairro) {
            if (bai.tagName === 'SELECT') {
              for (var i = 0; i < bai.options.length; i++) {
                if (bai.options[i].value && norm(bai.options[i].value) === norm(j.bairro)) { bai.selectedIndex = i; break; }
              }
            } else if (!bai.value) bai.value = j.bairro;
          }
          var av = $(p + 'CidAviso');
          if (av && !envio) {
            var fora = cfg && cfg.cidadeEntrega && cidadeCep && norm(cfg.cidadeEntrega) !== norm(cidadeCep);
            av.style.display = fora ? '' : 'none';
            av.textContent = fora ? ('Este negócio entrega em ' + cfg.cidadeEntrega + '. Confira o CEP.') : '';
          }
          pintarFrete();
          var num = $(p + 'Num'); if (num && !num.value) try { num.focus(); } catch (_) {}
        })
        .catch(function () { clearTimeout(t); if (st) st.textContent = ''; });
    }
    ligar['_' + p] = { cidade: function () { return cidadeCep; }, uf: function () { return ufCep; } };
    if (envio) { var ufIn = $(p + 'Uf'); if (ufIn) ufIn.addEventListener('input', function () { ufIn.value = ufIn.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2); pintarFrete(); }); }
    o._repintar = pintarFrete;
    pintarFrete();
  }

  /* Le o formulario. Devolve { ok:true, endereco, frete } ou { ok:false, erro }.
     Os codigos de erro sao os mesmos que o servidor devolve. */
  function ler(cfg, o) {
    var p = o.p || 'mvE';
    function v(id) { var e = $(p + id); return e ? String(e.value || '').trim() : ''; }
    var cep = v('Cep').replace(/\D/g, '');
    var e = {
      cep: cep, rua: v('Rua'), numero: v('Num'), complemento: v('Comp'),
      bairro: v('Bairro'), referencia: v('Ref'), cidade: '', uf: ''
    };
    var extra = ligar['_' + p];
    if (o.modo === 'envio') {
      e.cidade = v('Cid'); e.uf = v('Uf').toUpperCase();
      if (cep.length !== 8) return { ok: false, erro: 'cep' };
      if (e.rua.length < 3 || !e.numero) return { ok: false, erro: 'endereco' };
      if (e.bairro.length < 2) return { ok: false, erro: 'bairro' };
      if (e.cidade.length < 2) return { ok: false, erro: 'cidade' };
      if (!UFS[e.uf]) return { ok: false, erro: 'uf' };
      var fe = freteEnvio(cfg, e.uf, o.sub ? o.sub() : 0);
      if (fe === null || fe < 0) return { ok: false, erro: 'envio_fora' };
      var lin = e.rua + ', ' + e.numero + (e.complemento ? ' - ' + e.complemento : '') + ' - ' + e.bairro + ' - ' + e.cidade + '/' + e.uf;
      return { ok: true, endereco: e, detalhe: lin.slice(0, 140), frete: fe };
    }
    if (extra) { e.cidade = extra.cidade() || (cfg && cfg.cidadeEntrega) || ''; e.uf = extra.uf() || ''; }
    else if (cfg && cfg.cidadeEntrega) e.cidade = cfg.cidadeEntrega;
    if (cep && cep.length !== 8) return { ok: false, erro: 'cep' };
    if (e.rua.length < 3 || !e.numero) return { ok: false, erro: 'endereco' };
    if (e.bairro.length < 2) return { ok: false, erro: 'bairro' };
    var frete = freteDe(cfg, e.bairro);
    if (temTabela(cfg) && frete === null) return { ok: false, erro: 'bairro_fora' };
    /* Texto pronto vai junto: se o servidor no ar ainda for o de antes desta
       entrega, e ele que o pedido usa. */
    var linha = e.rua + ', ' + e.numero + (e.complemento ? ' - ' + e.complemento : '') + ' - ' + e.bairro +
      (e.referencia ? ' - Ref.: ' + e.referencia : '');
    return { ok: true, endereco: e, detalhe: linha.slice(0, 140), frete: frete };
  }

  var MSG = {
    cep: 'Esse CEP está incompleto. São 8 números.',
    endereco: 'Escreva a rua e o número da entrega.',
    bairro: 'Escolha o bairro da entrega.',
    bairro_fora: 'Este negócio ainda não entrega nesse bairro. Escolha retirar no local.',
    sem_entrega: 'Este negócio não faz entrega. Escolha retirar no local.',
    so_entrega: 'Este negócio só trabalha com entrega.',
    cidade: 'Escreva a cidade da entrega.',
    uf: 'Escreva o estado (UF) com duas letras, como SP.',
    envio_fora: 'Este negócio ainda não envia para esse estado.',
    sem_envio: 'O envio para outras cidades não está disponível agora.',
    item_local: 'Tem item no pedido que não vai pelo correio. Escolha retirar ou tire o item.'
  };
  function msg(cod, extra) {
    if (cod === 'item_local' && extra && extra.nome) return '“' + extra.nome + '” não vai pelo correio: só retirada ou entrega no bairro. Tire o item ou escolha outra forma de receber.';
    if (cod === 'minimo_entrega') return 'Pedido mínimo para entrega: ' + real((extra && extra.minimo) || 0) + ' em produtos.';
    return MSG[cod] || '';
  }

  window.mvEnt = { html: html, ligar: ligar, ler: ler, freteDe: freteDe, temTabela: temTabela, msg: msg, real: real,
    envioAtivo: envioAtivo, freteEnvio: freteEnvio, semEnvio: semEnvio };
})();
