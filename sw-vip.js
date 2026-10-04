/*! MOVIKI sw-vip.js | versao 2026-10-03-vip | NOVO | repo: moviki (site publico)
 * Lista VIP (P70 etapa 4): recebe o aviso "a loja entrou ao vivo".
 * O robo manda o aviso SEM conteudo; aqui se pergunta qual foi o ultimo
 * (compra_vip_ultimo) e mostra a notificacao. Clique abre so endereco do Moviki.
 * Nao guarda cache de pagina nenhuma: este service worker so cuida do aviso. */
'use strict';
var ROBO = 'https://moviki-robo.vercel.app/api/pedido';
var PADRAO = { titulo: 'Moviki', corpo: 'Uma loja que você segue está ao vivo.', url: 'https://www.moviki.com.br/aovivo' };
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  e.waitUntil((async function () {
    var d = PADRAO;
    try {
      var sub = await self.registration.pushManager.getSubscription();
      var r = await fetch(ROBO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'compra_vip_ultimo', endpoint: sub ? sub.endpoint : '' }) });
      var j = await r.json();
      if (j && j.ok && j.titulo) d = j;
    } catch (_) {}
    var url = /^https:\/\/www\.moviki\.com\.br\//.test(String(d.url || '')) ? d.url : PADRAO.url;
    return self.registration.showNotification(String(d.titulo || PADRAO.titulo).slice(0, 80), {
      body: String(d.corpo || '').slice(0, 120), icon: '/favicon512.png', badge: '/favicon512.png', tag: 'mv-vip', renotify: true, data: { url: url }
    });
  })());
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || PADRAO.url;
  if (!/^https:\/\/www\.moviki\.com\.br\//.test(url)) url = PADRAO.url;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
    for (var i = 0; i < lista.length; i++) { if (lista[i].url === url && 'focus' in lista[i]) return lista[i].focus(); }
    return self.clients.openWindow(url);
  }));
});
