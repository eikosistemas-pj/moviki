/* MOVIKI mvprovador.js | versao 2026-11-12-provador
   PROVADOR VIRTUAL da pagina publica da loja.
   O cliente escolhe uma foto dele, a inteligencia artificial monta o produto na
   foto e a tela mostra as duas com uma barra de arrastar (sem / com o produto).

   - Celular: a foto em cima e as acoes embaixo. Tablet e computador: metade
     esquerda a foto inteira, metade direita produto, compra e acoes.
   - A foto fica so na memoria deste aparelho: e reduzida aqui, enviada uma vez
     para gerar a imagem e nao fica guardada no Moviki. Nada vai para localStorage
     alem de um codigo aleatorio do aparelho (limite de provas por dia).
   - Camera ao vivo e bloqueada pelo site; por isso e um campo de arquivo (no
     celular o proprio sistema oferece tirar foto ou escolher da galeria).
   - Todo texto que vem da loja entra por textContent, nunca por innerHTML.

   Uso: window.mvProvador.abrir({ uid, ci, pi, tipo, nome, precoTxt, foto, slug,
        loja, whatsapp, comprar: function|null }) */
(function () {
  'use strict';
  var API = 'https://moviki-ai.vercel.app/api/provador';
  var LADO = 1280, PESO = 1300000, ESPERA = 100000;
  var O = null;          // produto aberto
  var E = 'inicio';      // inicio | gerando | pronto | erro
  var FOTO = '';         // foto do cliente (data URL), so na memoria
  var SAIDA = '';        // imagem gerada (data URL)
  var ACEITE = false, MSG = '', RESTAM = null, POS = 50, pedido = null, raiz = null, antesFoco = null;

  var DICA = {
    roupa: 'Use uma foto de corpo inteiro, de frente, com boa luz e só você na imagem.',
    calcado: 'Use uma foto de corpo inteiro, com os pés aparecendo, de frente e com boa luz.',
    acessorio: 'Use uma foto do rosto e dos ombros, de frente, com boa luz. Para anel, pulseira e relógio, mostre a mão.',
    maquiagem: 'Use uma foto do rosto, de frente, sem óculos escuros, com boa luz.'
  };

  function ev(n, p) { try { if (window.mvEv) window.mvEv(n, p || {}); } catch (_) {} }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function botao(cls, txt, fn) { var b = el('button', cls, txt); b.type = 'button'; b.addEventListener('click', fn); return b; }

  function aparelho() {
    var k = 'mv_prov_ap', v = '';
    try { v = localStorage.getItem(k) || ''; } catch (_) {}
    if (!/^[A-Za-z0-9]{16,40}$/.test(v)) {
      var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', a = new Uint8Array(24); v = '';
      try { crypto.getRandomValues(a); } catch (_) { for (var i = 0; i < 24; i++) a[i] = Math.floor(Math.random() * 256); }
      for (var j = 0; j < 24; j++) v += abc[a[j] % abc.length];
      try { localStorage.setItem(k, v); } catch (_) {}
    }
    return v;
  }

  /* Reduz a foto no aparelho: no maximo 1280 px no lado maior, JPEG, ate ~1,3 MB.
     O desenho no canvas ja aplica a rotacao da camera e descarta os metadados. */
  function reduzir(arquivo) {
    return new Promise(function (ok, falha) {
      if (!arquivo || !/^image\//.test(arquivo.type || '')) { falha(new Error('tipo')); return; }
      if (arquivo.size > 30 * 1024 * 1024) { falha(new Error('grande')); return; }
      var fr = new FileReader();
      fr.onerror = function () { falha(new Error('ler')); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { falha(new Error('ler')); };
        im.onload = function () {
          var l = im.naturalWidth, a = im.naturalHeight;
          if (Math.min(l, a) < 320) { falha(new Error('pequena')); return; }
          var f = Math.min(1, LADO / Math.max(l, a));
          var c = document.createElement('canvas');
          c.width = Math.round(l * f); c.height = Math.round(a * f);
          var x = c.getContext('2d');
          x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
          x.drawImage(im, 0, 0, c.width, c.height);
          var q = 0.86, d = c.toDataURL('image/jpeg', q);
          while (d.length * 0.75 > PESO && q > 0.5) { q -= 0.08; d = c.toDataURL('image/jpeg', q); }
          if (d.length * 0.75 > PESO) { falha(new Error('grande')); return; }
          ok(d);
        };
        im.src = String(fr.result || '');
      };
      fr.readAsDataURL(arquivo);
    });
  }

  function gerar() {
    if (!O || !FOTO) return;
    E = 'gerando'; MSG = ''; pintar();
    var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, ESPERA), meu = {};
    pedido = meu;
    fetch(API, {
      method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: O.uid, ci: O.ci, pi: O.pi, aparelho: aparelho(), aceite: true, foto: FOTO })
    }).then(function (r) { return r.json().then(function (j) { return { http: r.status, j: j || {} }; }, function () { return { http: r.status, j: {} }; }); })
      .then(function (r) {
        clearTimeout(t);
        if (pedido !== meu || !O) return;
        if (r.http === 200 && r.j.ok === true && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(String(r.j.imagem || ''))) {
          SAIDA = r.j.imagem; RESTAM = (typeof r.j.restam === 'number') ? r.j.restam : null; POS = 50; E = 'pronto';
          ev('provador_ok', { tipo: O.tipo });
        } else {
          E = 'erro'; MSG = String(r.j.mensagem || '').slice(0, 220) || 'Não deu para montar a imagem agora. Tente de novo em instantes.';
          ev('provador_erro', { erro: String(r.j.erro || r.http).slice(0, 30) });
        }
        pintar();
      }).catch(function () {
        clearTimeout(t);
        if (pedido !== meu || !O) return;
        E = 'erro'; MSG = 'A imagem demorou ou a conexão caiu. Confira a internet e tente de novo.';
        ev('provador_erro', { erro: 'rede' }); pintar();
      });
  }

  function aoEscolher(inp) {
    var arq = inp.files && inp.files[0]; inp.value = '';
    if (!arq) return;
    reduzir(arq).then(function (d) { FOTO = d; SAIDA = ''; ev('provador_foto', { tipo: O ? O.tipo : '' }); gerar(); })
      .catch(function (e) {
        var m = String(e && e.message);
        MSG = m === 'pequena' ? 'Essa foto é pequena demais. Escolha uma com mais qualidade.'
          : m === 'grande' ? 'Essa foto é grande demais. Escolha outra ou tire uma nova.'
            : 'Não consegui abrir essa foto. Escolha outra, em JPG ou PNG.';
        E = FOTO && SAIDA ? 'pronto' : 'erro'; pintar();
      });
  }
  function campoFoto() {
    var i = el('input', 'mvpArq'); i.type = 'file'; i.accept = 'image/jpeg,image/png,image/webp,image/heic,image/*';
    i.setAttribute('aria-hidden', 'true'); i.tabIndex = -1;
    i.addEventListener('change', function () { aoEscolher(i); });
    return i;
  }

  function blobDe(dataUrl) {
    var b = atob(dataUrl.split(',')[1]), n = b.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = b.charCodeAt(i);
    return new Blob([u], { type: 'image/jpeg' });
  }
  function salvar() {
    if (!SAIDA || !O) return;
    var nome = 'provador-' + (String(O.slug || 'moviki').replace(/[^a-z0-9-]/gi, '').slice(0, 30) || 'moviki') + '.jpg';
    ev('provador_salvar', {});
    try {
      var arq = new File([blobDe(SAIDA)], nome, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [arq] })) { navigator.share({ files: [arq] }).catch(function () {}); return; }
    } catch (_) {}
    var a = document.createElement('a'); a.href = SAIDA; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  }

  function fechar() {
    pedido = null; O = null; E = 'inicio'; MSG = ''; SAIDA = ''; RESTAM = null;   // a FOTO fica na memoria ate fechar a pagina
    if (raiz) { raiz.remove(); raiz = null; }
    document.documentElement.classList.remove('mvpAberto');
    document.removeEventListener('keydown', tecla);
    try { if (antesFoco && antesFoco.focus) antesFoco.focus(); } catch (_) {}
  }
  function tecla(e) { if (e.key === 'Escape' && E !== 'gerando') fechar(); }

  /* ------------------------------------------------------------ tela */
  function palco() {
    var p = el('div', 'mvpPalco');
    if (E === 'pronto' && SAIDA) {
      var q = el('div', 'mvpComp');
      var sem = el('img', 'mvpImg'); sem.src = FOTO; sem.alt = 'Sua foto, sem o produto';
      var com = el('img', 'mvpImg mvpCom'); com.src = SAIDA; com.alt = 'Simulação com o produto';
      var linha = el('div', 'mvpLinha'); linha.appendChild(el('span', 'mvpPega', '‹ ›'));
      var tS = el('span', 'mvpTag mvpTagS', 'Sem'), tC = el('span', 'mvpTag mvpTagC', 'Com');
      var r = el('input', 'mvpBarra'); r.type = 'range'; r.min = '0'; r.max = '100'; r.step = '1'; r.value = String(POS);
      r.setAttribute('aria-label', 'Arraste para comparar a foto sem e com o produto');
      var por = function () { POS = Number(r.value); com.style.clipPath = 'inset(0 0 0 ' + POS + '%)'; linha.style.left = POS + '%'; };
      r.addEventListener('input', por); por();
      /* Arrastar com dedo ou mouse em qualquer ponto da foto (no iPhone a barra nativa so anda pelo botao dela);
         a barra nativa fica para o teclado e o leitor de tela. */
      var solto = true;
      var mover = function (e) { var c = q.getBoundingClientRect(); if (!c.width) return; r.value = String(Math.max(0, Math.min(100, Math.round((e.clientX - c.left) / c.width * 100)))); por(); };
      q.addEventListener('pointerdown', function (e) { solto = false; try { q.setPointerCapture(e.pointerId); } catch (_) {} mover(e); });
      q.addEventListener('pointermove', function (e) { if (!solto) mover(e); });
      q.addEventListener('pointerup', function () { solto = true; });
      q.addEventListener('pointercancel', function () { solto = true; });
      q.appendChild(sem); q.appendChild(com); q.appendChild(tS); q.appendChild(tC); q.appendChild(linha); q.appendChild(r);
      p.appendChild(q);
    } else if (FOTO && (E === 'gerando' || E === 'erro')) {
      var f = el('img', 'mvpImg'); f.src = FOTO; f.alt = 'Sua foto'; p.appendChild(f);
      if (E === 'gerando') { var v = el('div', 'mvpVeu'); v.appendChild(el('div', 'mvpGira')); v.appendChild(el('div', 'mvpVeuT', 'Montando sua imagem…')); v.appendChild(el('div', 'mvpVeuS', 'Leva até 1 minuto. Não feche esta tela.')); p.appendChild(v); }
    } else {
      var pr = el('img', 'mvpImg'); pr.src = O.foto; pr.alt = O.nome; pr.referrerPolicy = 'no-referrer'; p.appendChild(pr);
    }
    return p;
  }
  function lado() {
    var l = el('div', 'mvpLado'), arq = campoFoto();
    l.appendChild(arq);
    var abrirArq = function () { if (!ACEITE) { MSG = 'Marque a caixa para confirmar que a foto é sua e que você tem 18 anos ou mais.'; pintar(); return; } arq.click(); };
    if (O.loja) l.appendChild(el('div', 'mvpLoja', O.loja));
    l.appendChild(el('h2', 'mvpNome', O.nome));
    if (O.precoTxt) l.appendChild(el('div', 'mvpPreco', O.precoTxt));

    if (E === 'pronto') {
      if (O.comprar) l.appendChild(botao('mvpBtn mvpPri', 'Quero este', function () { var c = O.comprar; ev('provador_quero', {}); fechar(); try { c(); } catch (_) {} }));
      if (O.whatsapp) {
        var w = el('a', 'mvpBtn ' + (O.comprar ? 'mvpSec' : 'mvpPri'), 'Perguntar no WhatsApp');
        w.href = 'https://wa.me/55' + String(O.whatsapp).replace(/\D/g, '') + '?text=' + encodeURIComponent('Olá! Vi "' + O.nome + '" no provador da loja e quero saber mais.');
        w.target = '_blank'; w.rel = 'noopener'; l.appendChild(w);
      }
      var par = el('div', 'mvpPar');
      par.appendChild(botao('mvpBtn mvpSec', 'Trocar foto', abrirArq));
      par.appendChild(botao('mvpBtn mvpSec', 'Salvar imagem', salvar));
      l.appendChild(par);
      if (RESTAM !== null) l.appendChild(el('p', 'mvpNota', RESTAM > 0 ? ('Você ainda pode fazer ' + RESTAM + (RESTAM === 1 ? ' prova' : ' provas') + ' hoje nesta loja.') : 'Essa foi a sua última prova de hoje nesta loja. Amanhã tem mais.'));
    } else if (E === 'gerando') {
      l.appendChild(el('p', 'mvpTxt', 'Estamos montando o produto na sua foto. Assim que ficar pronto, arraste a barra para comparar.'));
    } else {
      l.appendChild(el('p', 'mvpTit', 'Veja como fica em você'));
      l.appendChild(el('p', 'mvpTxt', DICA[O.tipo] || DICA.roupa));
      var lab = el('label', 'mvpAceite'), cx = el('input'); cx.type = 'checkbox'; cx.checked = ACEITE;
      cx.addEventListener('change', function () { ACEITE = cx.checked; if (ACEITE && MSG) { MSG = ''; pintar(); } });
      lab.appendChild(cx); lab.appendChild(el('span', null, 'Tenho 18 anos ou mais, a foto é minha e aceito que ela seja enviada para gerar a imagem.'));
      l.appendChild(lab);
      l.appendChild(botao('mvpBtn mvpPri', FOTO ? 'Escolher outra foto' : 'Escolher minha foto', abrirArq));
      if (FOTO) l.appendChild(botao('mvpBtn mvpSec', E === 'erro' ? 'Tentar de novo com a mesma foto' : 'Usar a mesma foto de antes', function () { if (!ACEITE) { abrirArq(); return; } gerar(); }));
    }
    if (MSG) { var m = el('p', 'mvpMsg', MSG); m.setAttribute('role', 'alert'); l.appendChild(m); }

    var av = el('div', 'mvpAviso');
    av.appendChild(el('p', null, 'Imagem criada por inteligência artificial. É uma simulação: mostra a aparência, não o caimento nem o tamanho.'));
    var pv = el('p', null, 'O Moviki não guarda a sua foto nem a imagem gerada. '), a = el('a', null, 'Como tratamos a foto');
    a.href = '/privacidade.html#provador'; a.target = '_blank'; a.rel = 'noopener'; pv.appendChild(a);
    av.appendChild(pv);
    l.appendChild(av);
    return l;
  }
  function pintar() {
    if (!O) return;
    if (!raiz) {
      raiz = el('div'); raiz.id = 'mvpOv'; raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-modal', 'true'); raiz.setAttribute('aria-label', 'Provador virtual');
      document.body.appendChild(raiz);
    }
    while (raiz.firstChild) raiz.removeChild(raiz.firstChild);
    var topo = el('div', 'mvpTopo');
    topo.appendChild(el('span', 'mvpMarca', 'Provador'));
    var x = botao('mvpX', '×', function () { if (E !== 'gerando') fechar(); }); x.setAttribute('aria-label', 'Fechar o provador');
    if (E === 'gerando') x.disabled = true;
    topo.appendChild(x);
    var corpo = el('div', 'mvpCorpo'); corpo.appendChild(palco()); corpo.appendChild(lado());
    raiz.appendChild(topo); raiz.appendChild(corpo);
    try { x.focus({ preventScroll: true }); } catch (_) {}
  }

  function abrir(o) {
    if (!o || !o.uid || !o.foto || !o.nome) return;
    O = {
      uid: String(o.uid), ci: Number(o.ci), pi: Number(o.pi), tipo: String(o.tipo || 'roupa'), nome: String(o.nome).slice(0, 80),
      precoTxt: String(o.precoTxt || '').slice(0, 30), foto: String(o.foto), slug: String(o.slug || ''), loja: String(o.loja || '').slice(0, 60),
      whatsapp: String(o.whatsapp || ''), comprar: typeof o.comprar === 'function' ? o.comprar : null
    };
    E = 'inicio'; MSG = ''; SAIDA = ''; RESTAM = null; antesFoco = document.activeElement;
    estilo();
    document.documentElement.classList.add('mvpAberto');
    document.addEventListener('keydown', tecla);
    pintar();
  }

  function estilo() {
    if (document.getElementById('mvpCss')) return;
    var s = document.createElement('style'); s.id = 'mvpCss';
    s.textContent = [
      '.provarBtn{display:inline-flex;align-items:center;gap:7px;margin-top:10px;padding:9px 14px;min-height:40px;border-radius:999px;border:1.5px solid var(--loja,#0066FF);background:transparent;color:var(--loja,#0066FF);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;}',
      '.provarBtn svg{width:17px;height:17px;flex:0 0 auto;}',
      '.provarBtn:active{transform:scale(.98);}',
      'html.mvpAberto,html.mvpAberto body{overflow:hidden;}',
      '#mvpOv{--pf:#0b1220;--pt:#eaf6ff;--pt2:#b9cbe2;--pl:#22395c;--ps:#101d31;position:fixed;inset:0;z-index:10000;background:var(--pf);color:var(--pt);display:flex;flex-direction:column;font-family:inherit;}',
      'html.mvClaro #mvpOv{--pf:#fff;--pt:#111827;--pt2:#4b5563;--pl:#e5e7eb;--ps:#f3f4f6;}',
      '#mvpOv *{box-sizing:border-box;}',
      '.mvpTopo{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;padding-top:max(10px,env(safe-area-inset-top));border-bottom:1px solid var(--pl);flex:0 0 auto;}',
      '.mvpMarca{font-weight:800;font-size:15px;letter-spacing:.2px;}',
      '.mvpX{width:40px;height:40px;border-radius:50%;border:0;background:var(--ps);color:var(--pt);font-size:24px;line-height:1;cursor:pointer;}',
      '.mvpX:disabled{opacity:.35;cursor:default;}',
      '.mvpCorpo{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}',
      '.mvpPalco{position:relative;flex:0 0 auto;height:56vh;height:56dvh;min-height:260px;background:#0a0f18;overflow:hidden;}',
      '.mvpImg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;-webkit-user-select:none;user-select:none;-webkit-user-drag:none;}',
      '.mvpComp{position:absolute;inset:0;touch-action:pan-y;cursor:ew-resize;}',
      '.mvpLinha{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);pointer-events:none;}',
      '.mvpPega{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:50%;background:#fff;color:#111827;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;box-shadow:0 4px 14px rgba(0,0,0,.35);}',
      '.mvpBarra{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;pointer-events:none;-webkit-appearance:none;appearance:none;}',
      '.mvpComp:focus-within .mvpPega{outline:3px solid var(--loja,#0066FF);outline-offset:2px;}',
      '.mvpTag{position:absolute;top:12px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;font-weight:700;pointer-events:none;}',
      '.mvpTagS{left:12px;}.mvpTagC{right:12px;}',
      '.mvpVeu{position:absolute;inset:0;background:rgba(6,10,18,.62);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:20px;}',
      '.mvpVeuT{font-weight:800;font-size:17px;}.mvpVeuS{font-size:13.5px;opacity:.85;}',
      '.mvpGira{width:44px;height:44px;border-radius:50%;border:4px solid rgba(255,255,255,.25);border-top-color:#fff;animation:mvpG 1s linear infinite;}',
      '@keyframes mvpG{to{transform:rotate(360deg);}}',
      '@media (prefers-reduced-motion:reduce){.mvpGira{animation-duration:3s;}}',
      '.mvpLado{flex:1 1 auto;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:16px 16px max(18px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px;}',
      '.mvpArq{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}',
      '.mvpLoja{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--pt2);}',
      '.mvpNome{margin:0;font-size:20px;line-height:1.2;font-weight:800;overflow-wrap:anywhere;}',
      '.mvpPreco{font-size:19px;font-weight:800;color:var(--loja,#0066FF);}',
      '.mvpTit{margin:6px 0 0;font-weight:800;font-size:16px;}',
      '.mvpTxt{margin:0;font-size:14.5px;line-height:1.5;color:var(--pt2);}',
      '.mvpAceite{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;line-height:1.45;color:var(--pt2);padding:10px 12px;border:1px solid var(--pl);border-radius:12px;cursor:pointer;}',
      '.mvpAceite input{width:20px;height:20px;margin:1px 0 0;flex:0 0 auto;accent-color:var(--loja,#0066FF);}',
      '.mvpBtn{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;padding:12px 16px;border-radius:14px;font:inherit;font-size:15.5px;font-weight:800;text-decoration:none;cursor:pointer;text-align:center;}',
      '.mvpPri{border:0;background:var(--loja,#0066FF);color:#fff;}',
      '.mvpSec{border:1.5px solid var(--pl);background:transparent;color:var(--pt);}',
      '.mvpPar{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
      '.mvpNota{margin:0;font-size:13px;color:var(--pt2);}',
      '.mvpMsg{margin:0;padding:10px 12px;border-radius:12px;background:rgba(225,29,72,.1);color:#be123c;font-size:14px;font-weight:600;}',
      'html:not(.mvClaro) .mvpMsg{color:#fda4af;}',
      '.mvpAviso{margin-top:auto;padding-top:12px;border-top:1px solid var(--pl);font-size:12.5px;line-height:1.5;color:var(--pt2);}',
      '.mvpAviso p{margin:0 0 4px;}.mvpAviso a{color:var(--loja,#0066FF);font-weight:700;}',
      '@media (max-width:380px){.mvpPar{grid-template-columns:1fr;}.mvpPalco{height:50dvh;}}',
      '@media (orientation:landscape) and (max-height:520px) and (max-width:759px){.mvpCorpo{flex-direction:row;}.mvpPalco{flex:0 0 50%;height:auto;min-height:0;}}',
      '@media (min-width:760px){.mvpCorpo{flex-direction:row;}.mvpPalco{flex:0 0 50%;height:auto;min-height:0;}.mvpLado{flex:0 0 50%;padding:28px clamp(20px,4vw,56px) 28px;gap:12px;}.mvpLado>*{width:100%;max-width:520px;}.mvpNome{font-size:26px;}.mvpPreco{font-size:22px;}.mvpTopo{padding:12px 20px;}}',
      '@media (min-width:1120px){.mvpNome{font-size:30px;}.mvpLado{padding-top:44px;}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  estilo();   // o botao "Provar em mim" da lista usa o mesmo estilo

  window.mvProvador = { abrir: abrir, fechar: fechar, versao: '2026-11-12-provador' };
})();
