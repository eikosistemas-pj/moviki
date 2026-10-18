/*!
 * MOVIKI mvvip.js | versao 2026-10-17-basepropria | antes 2026-10-03-vip | repo: moviki (site publico)
 * P84 (17/10/2026): origem por rede (?vip=tiktok|instagram|kwai|facebook|youtube|whatsapp,
 * o link da bio de cada rede); quem chega de uma rede ja abre com o WhatsApp marcado
 * (navegador de dentro do app quase nunca aceita notificacao); depois da inscricao,
 * botao para o canal da loja (Canal do WhatsApp, grupo ou Telegram) que o robo devolve.
 * LISTA VIP — "Me avise da proxima live" (P70, etapa 4, 03/10/2026).
 * Usado pela live (live.html) e pela pagina do negocio (404.html). So aparece
 * quando a pagina chama mvVip.montar(): a pagina so chama com a chave
 * listaVip ligada em checkout_publico/{uid}.recursos (o robo confere de novo).
 * Canais: notificacao neste aparelho (sw-vip.js), e-mail (com confirmacao) e
 * WhatsApp (vai para a lista da propria loja). Consentimento obrigatorio.
 * Origem (P71): ?vip=qr (QR impresso), ?vip=link ou ?vip=1 (link fixo da loja),
 * 'live' e 'pagina' (botao). So a origem vai junto, nenhum dado a mais.
 * Medicao: evento lista_vip_inscricao com a origem, pelo mvEv (respeita o
 * "Nao medir"); nunca nome, e-mail ou telefone.
 */
(function () {
  'use strict';
  var ROBO = 'https://moviki-robo.vercel.app/api/pedido';
  var cfg = null, montado = false;
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function loja() { var n = cfg && (typeof cfg.loja === 'function' ? cfg.loja() : cfg.loja); n = String(n || '').trim(); return n && n !== '—' ? n.slice(0, 60) : 'esta loja'; }
  function pushOk() { try { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext; } catch (_) { return false; } }
  function chaveLocal() { return 'mv_vip_push_' + (cfg ? cfg.uid : ''); }
  function lerLocal() { try { return localStorage.getItem(chaveLocal()) === '1'; } catch (_) { return false; } }
  function gravarLocal(v) { try { if (v) localStorage.setItem(chaveLocal(), '1'); else localStorage.removeItem(chaveLocal()); } catch (_) {} }
  function post(corpo) {
    return fetch(ROBO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, erro: 'rede' }; }); });
  }
  var ERROS = {
    aceite: 'Marque a caixa de autorização para continuar.', nome: 'Escreva o seu primeiro nome.', canal: 'Escolha pelo menos um jeito de receber o aviso.',
    email: 'Confira o e-mail.', whatsapp: 'Confira o WhatsApp com DDD.', push: 'Este navegador não aceitou a notificação.', freio: 'Muitos pedidos agora. Tente daqui a pouco.',
    vip_off: 'Esta loja não está recebendo pedidos de aviso agora.', vip_cheia: 'A lista desta loja está cheia.', rede: 'Sem conexão. Tente de novo.'
  };
  function textoConsentimento() { return 'Quero ser avisado(a) quando ' + loja() + ' entrar ao vivo. Meus dados ficam com a loja e com o Moviki só para esse aviso, e posso sair quando quiser.'; }

  function css() {
    if (el('mvvCss')) return;
    var s = document.createElement('style'); s.id = 'mvvCss';
    s.textContent = '#mvvFundo{position:fixed;inset:0;z-index:2147483000;background:rgba(3,9,16,.72);display:flex;align-items:flex-end;justify-content:center}'
      + '#mvvFundo.mvvEsc{display:none}'
      + '#mvvCaixa{width:100%;max-width:460px;max-height:92vh;overflow:auto;background:#0f1b29;color:#eaf2fb;border:1px solid rgba(0,212,255,.22);border-radius:20px 20px 0 0;padding:20px 18px 24px;font-family:inherit;box-sizing:border-box}'
      + '@media(min-width:600px){#mvvFundo{align-items:center}#mvvCaixa{border-radius:20px}}'
      + '#mvvCaixa h2{font-size:19px;margin:0 0 4px;display:flex;align-items:center;justify-content:space-between;gap:10px}'
      + '#mvvCaixa .mvvSub{color:#9fb2c6;font-size:14px;margin:0 0 14px;line-height:1.5}'
      + '#mvvCaixa label.mvvL{display:block;font-size:13px;color:#c6d8ee;margin:10px 0 4px}'
      + '#mvvCaixa input[type=text],#mvvCaixa input[type=email],#mvvCaixa input[type=tel]{width:100%;box-sizing:border-box;background:#0a1420;border:1px solid #2f4a63;border-radius:10px;color:#eaf2fb;font-size:16px;padding:11px 12px;font-family:inherit}'
      + '#mvvCaixa .mvvCanal{display:flex;gap:10px;align-items:flex-start;border:1px solid #2f4a63;border-radius:12px;padding:11px 12px;margin:8px 0;cursor:pointer}'
      + '#mvvCaixa .mvvCanal input{margin-top:3px;width:18px;height:18px;flex:none}'
      + '#mvvCaixa .mvvCanal b{display:block;font-size:15px}#mvvCaixa .mvvCanal small{color:#9fb2c6;font-size:12.5px;line-height:1.4;display:block}'
      + '#mvvCaixa .mvvExtra{margin:-2px 0 8px}'
      + '#mvvCaixa .mvvAceite{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:#c6d8ee;line-height:1.45;margin:14px 0 6px}'
      + '#mvvCaixa .mvvAceite input{margin-top:2px;width:18px;height:18px;flex:none}'
      + '#mvvCaixa .mvvAceite a{color:#6fd0ff}'
      + '#mvvCaixa .mvvBtn{width:100%;border:0;border-radius:12px;padding:14px;font-size:16px;font-weight:700;cursor:pointer;background:linear-gradient(90deg,#0066ff,#00d4ff);color:#fff;margin-top:10px;font-family:inherit}'
      + '#mvvCaixa .mvvBtn2{width:100%;border:1px solid #2f4a63;border-radius:12px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;background:transparent;color:#c6d8ee;margin-top:10px;font-family:inherit}'
      + '#mvvCaixa .mvvX{background:none;border:0;color:#9fb2c6;font-size:26px;line-height:1;cursor:pointer;padding:0 4px}'
      + '#mvvCaixa .mvvMsg{font-size:13.5px;margin-top:10px;line-height:1.5}#mvvCaixa .mvvMsg.erro{color:#ff8f8f}'
      + '#mvvCaixa .mvvOk{background:rgba(46,204,113,.09);border-left:3px solid #2ecc71;border-radius:8px;padding:12px;font-size:14.5px;line-height:1.55}'
      + '#mvvCaixa .mvvOk p{margin:0 0 6px}';
    document.head.appendChild(s);
  }

  function html() {
    var p = pushOk();
    return '<div id="mvvCaixa" role="dialog" aria-modal="true" aria-labelledby="mvvTit">'
      + '<h2 id="mvvTit"><span>🔔 Me avise da próxima live</span><button type="button" class="mvvX" id="mvvFechar" aria-label="Fechar">×</button></h2>'
      + '<p class="mvvSub" id="mvvSub"></p>'
      + '<div id="mvvForm">'
      + '<label class="mvvL" for="mvvNome">Seu primeiro nome</label><input type="text" id="mvvNome" maxlength="30" autocomplete="given-name">'
      + '<label class="mvvL">Como quer ser avisado(a)?</label>'
      + (p ? '<label class="mvvCanal"><input type="checkbox" id="mvvPush"><span><b>Notificação neste aparelho</b><small id="mvvPushTxt">Chega na hora que a live começar.</small></span></label>' : '')
      + '<label class="mvvCanal"><input type="checkbox" id="mvvMail"><span><b>E-mail</b><small>Você confirma por um link antes de começar a receber.</small></span></label>'
      + '<div class="mvvExtra" id="mvvMailBox" hidden><input type="email" id="mvvEmail" maxlength="120" autocomplete="email" placeholder="seu@email.com"></div>'
      + '<label class="mvvCanal"><input type="checkbox" id="mvvWpp"><span><b>WhatsApp da loja</b><small>Seu nome e número vão para a lista da loja, que avisa pelo WhatsApp dela.</small></span></label>'
      + '<div class="mvvExtra" id="mvvWppBox" hidden><input type="tel" id="mvvWhats" maxlength="20" autocomplete="tel" placeholder="(DDD) 9 9999-9999"></div>'
      + '<label class="mvvAceite"><input type="checkbox" id="mvvAceite"><span id="mvvAceiteTxt"></span></label>'
      + '<button type="button" class="mvvBtn" id="mvvEnviar">Quero ser avisado(a)</button>'
      + '<div class="mvvMsg" id="mvvMsg" role="status"></div>'
      + '</div>'
      + '<div id="mvvFeito" hidden></div>'
      + '</div>';
  }

  function msg(t, erro) { var m = el('mvvMsg'); if (m) { m.textContent = t || ''; m.className = 'mvvMsg' + (erro ? ' erro' : ''); } }
  function b64ParaBytes(b) { var p = '='.repeat((4 - b.length % 4) % 4); var r = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); var a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }

  function assinarPush() {
    return navigator.serviceWorker.register('/sw-vip.js').then(function (reg) {
      return Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') throw new Error('negado');
        return navigator.serviceWorker.ready.then(function () { return reg.pushManager.getSubscription(); }).then(function (sub) {
          if (sub) return sub;
          return post({ acao: 'compra_vip_chave' }).then(function (j) {
            if (!j || !j.ok || !j.chave) throw new Error('chave');
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaBytes(j.chave) });
          });
        });
      });
    });
  }

  function pintarPush() {
    var t = el('mvvPushTxt'), c = el('mvvPush'); if (!t || !c) return;
    if (Notification.permission === 'denied') { c.disabled = true; c.checked = false; t.textContent = 'As notificações estão bloqueadas neste navegador. Libere nas configurações para usar.'; return; }
    if (lerLocal()) { c.checked = false; t.innerHTML = 'Este aparelho já recebe o aviso. <a href="#" id="mvvParar" style="color:#6fd0ff">Parar de receber</a>'; var pa = el('mvvParar'); if (pa) pa.onclick = function (e) { e.preventDefault(); parar(); }; return; }
    t.textContent = 'Chega na hora que a live começar.';
  }
  function parar() {
    navigator.serviceWorker.getRegistration('/sw-vip.js').then(function (reg) { return reg && reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) { gravarLocal(false); pintarPush(); return; }
      return post({ acao: 'compra_vip_sair_push', lojistaUid: cfg.uid, endpoint: sub.endpoint }).then(function () { gravarLocal(false); pintarPush(); msg('Pronto: este aparelho não recebe mais o aviso desta loja.'); });
    }).catch(function () { msg('Não deu para parar agora. Tente de novo.', true); });
  }

  function enviar() {
    var b = el('mvvEnviar');
    var nome = String(el('mvvNome').value || '').trim();
    var quer = { push: !!(el('mvvPush') && el('mvvPush').checked), mail: el('mvvMail').checked, wpp: el('mvvWpp').checked };
    var email = quer.mail ? String(el('mvvEmail').value || '').trim() : '';
    var whats = quer.wpp ? String(el('mvvWhats').value || '').trim() : '';
    msg('');
    if (nome.length < 2) return msg(ERROS.nome, true);
    if (!quer.push && !quer.mail && !quer.wpp) return msg(ERROS.canal, true);
    if (quer.mail && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return msg(ERROS.email, true);
    if (quer.wpp && String(whats).replace(/\D/g, '').length < 10) return msg(ERROS.whatsapp, true);
    if (!el('mvvAceite').checked) return msg(ERROS.aceite, true);
    b.disabled = true; b.textContent = 'Enviando…';
    var corpo = { acao: 'compra_vip_entrar', lojistaUid: cfg.uid, nome: nome, aceite: true, origem: origemAtual() };
    if (email) corpo.email = email;
    if (whats) corpo.whatsapp = whats;
    var passo = quer.push ? assinarPush().then(function (sub) { corpo.push = { endpoint: sub.endpoint }; }).catch(function (e) {
      if (!quer.mail && !quer.wpp) throw e;
      corpo.semPush = true;
    }) : Promise.resolve();
    passo.then(function () { return post(corpo); }).then(function (j) {
      if (!j || !j.ok) { msg(ERROS[(j && j.erro)] || 'Não deu certo. Tente de novo.', true); return; }
      try { localStorage.setItem('mv_vip_nome', nome); } catch (_) {}
      if (j.push) gravarLocal(true);
      var h = '<div class="mvvOk"><p><b>Pronto, ' + esc(nome) + '!</b></p>';
      if (j.push) h += '<p>🔔 Este aparelho vai receber a notificação quando ' + esc(loja()) + ' entrar ao vivo.</p>';
      if (quer.push && !j.push) h += '<p>A notificação não foi liberada neste aparelho; os outros avisos estão valendo.</p>';
      if (j.email) h += '<p>✉️ Mandamos um link para <b>' + esc(email) + '</b>. Confirme por lá para começar a receber' + (j.emailAtrasado ? ' (pode demorar algumas horas para chegar)' : '') + '.</p>';
      if (j.whatsapp) h += '<p>💬 Seu WhatsApp está na lista da loja. Para sair, é só pedir para ela.</p>';
      var cn = canalOk(j.canal);
      if (cn) h += '<p style="margin-top:10px">Novidades, bastidores e o dia da próxima live também saem no canal da loja.</p>';
      h += '</div>';
      if (cn) h += '<a class="mvvBtn" id="mvvCanal" style="display:block;text-align:center;text-decoration:none;box-sizing:border-box" href="' + esc(cn.url) + '" target="_blank" rel="noopener noreferrer">' + esc(cn.rot) + '</a>';
      h += '<button type="button" class="mvvBtn2" id="mvvOkFechar">Fechar</button>';
      el('mvvForm').hidden = true; var f = el('mvvFeito'); f.innerHTML = h; f.hidden = false;
      el('mvvOkFechar').onclick = fechar;
      if (cn) el('mvvCanal').onclick = function () { try { if (window.mvEv) window.mvEv('lista_vip_canal', { tipo: String(j.canal.tipo || ''), origem: corpo.origem }); } catch (_) {} };
      try { if (window.mvEv) window.mvEv('lista_vip_inscricao', { origem: corpo.origem, canais: [j.push ? 'push' : '', j.email ? 'email' : '', j.whatsapp ? 'whatsapp' : ''].filter(Boolean).join(',') }); } catch (_) {}
    }).catch(function () {
      msg(quer.push ? 'A notificação não foi liberada neste aparelho. Escolha e-mail ou WhatsApp, ou libere a notificação.' : ERROS.rede, true);
    }).then(function () { b.disabled = false; b.textContent = 'Quero ser avisado(a)'; });
  }

  var REDES = ['tiktok', 'instagram', 'kwai', 'facebook', 'youtube', 'whatsapp'];
  function origemDaUrl() { try { var m = /[?&]vip=(1|link|qr|tiktok|instagram|kwai|facebook|youtube|whatsapp)(?:&|$)/.exec(location.search); if (!m) return ''; return m[1] === '1' ? 'link' : m[1]; } catch (_) { return ''; } }
  function deRede() { return REDES.indexOf(origemDaUrl()) >= 0; }
  /* Mesmos tres formatos que o robo aceita: nada de endereco qualquer na tela. */
  function canalOk(c) {
    var u = c && String(c.url || '');
    if (!/^https:\/\/(whatsapp\.com\/channel\/[A-Za-z0-9]{10,40}|chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}|t\.me\/(\+[A-Za-z0-9_-]{10,40}|joinchat\/[A-Za-z0-9_-]{10,40}|[A-Za-z][A-Za-z0-9_]{4,31}))$/.test(u)) return null;
    var rot = c.tipo === 'telegram' ? 'Entrar no canal da loja no Telegram' : (c.tipo === 'wpp_grupo' ? 'Entrar no grupo da loja no WhatsApp' : 'Seguir o canal da loja no WhatsApp');
    return { url: u, rot: rot };
  }
  function origemAtual() { return origemDaUrl() || (cfg && cfg.origem === 'live' ? 'live' : 'pagina'); }
  function fechar() { var f = el('mvvFundo'); if (f) f.classList.add('mvvEsc'); document.body.style.overflow = ''; }
  function abrir() {
    if (!cfg) return;
    css();
    var f = el('mvvFundo');
    if (!f) {
      f = document.createElement('div'); f.id = 'mvvFundo'; f.className = 'mvvEsc'; f.innerHTML = html(); document.body.appendChild(f);
      f.addEventListener('click', function (e) { if (e.target === f) fechar(); });
      el('mvvFechar').onclick = fechar;
      el('mvvEnviar').onclick = enviar;
      el('mvvMail').onchange = function () { el('mvvMailBox').hidden = !this.checked; if (this.checked) el('mvvEmail').focus(); };
      el('mvvWpp').onchange = function () { el('mvvWppBox').hidden = !this.checked; if (this.checked) el('mvvWhats').focus(); };
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
      try { el('mvvNome').value = localStorage.getItem('mv_vip_nome') || localStorage.getItem('mv_live_nome') || ''; } catch (_) {}
    }
    el('mvvForm').hidden = false; el('mvvFeito').hidden = true; msg('');
    el('mvvSub').textContent = loja() + ' avisa você quando entrar ao vivo. Escolha como prefere receber.';
    el('mvvAceiteTxt').innerHTML = esc(textoConsentimento()) + ' <a href="/privacidade.html" target="_blank" rel="noopener">Privacidade</a>';
    if (pushOk()) pintarPush();
    /* Veio da bio de uma rede: o WhatsApp ja vem marcado (o mais simples para quem chega pelo app). */
    if (deRede() && !el('mvvWpp').checked) { el('mvvWpp').checked = true; el('mvvWppBox').hidden = false; }
    f.classList.remove('mvvEsc'); document.body.style.overflow = 'hidden';
  }

  window.mvVip = {
    montar: function (o) {
      if (!o || !/^[A-Za-z0-9]{10,128}$/.test(String(o.uid || ''))) return false;
      cfg = { uid: o.uid, loja: o.loja, origem: o.origem };
      montado = true;
      if (origemDaUrl()) setTimeout(abrir, 600);
      return true;
    },
    abrir: abrir,
    pronto: function () { return montado; }
  };
})();
