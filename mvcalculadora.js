/* mvcalculadora.js — 2026-10-25-calculadora
   Motor da calculadora de taxas de live shop. Usado por /guia/calculadora-taxas-live-shop e pelo /embed.
   As tarifas NAO moram aqui: vem de /dados/taxas-live-shop.json (fonte unica). Este arquivo so faz a conta.
   Conta de TARIFA com os numeros que o visitante digita; nunca previsao de venda. */
(function(){
  'use strict';
  var DADOS_URL='/dados/taxas-live-shop.json';
  var AVISO_DIAS=60, REVISAO_DIAS=100;

  function brl(v){
    if(!isFinite(v)) return '—';
    try{ return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    catch(e){ return 'R$ '+v.toFixed(2).replace('.',','); }
  }
  function pct(v){
    if(!isFinite(v)) return '—';
    return (Math.round(v*10)/10).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  }
  function dataBR(iso){
    var p=String(iso||'').split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : '';
  }
  function diasDesde(iso){
    var t=Date.parse(iso+'T12:00:00-03:00'); if(!isFinite(t)) return 9999;
    return Math.floor((Date.now()-t)/86400000);
  }
  function frescor(plat){
    var d=diasDesde(plat && plat.conferido_em);
    return { dias:d, estado: d>REVISAO_DIAS ? 'revisao' : (d>AVISO_DIAS ? 'aviso' : 'ok') };
  }
  function faixa(plat, preco){
    var f=plat.faixas||[];
    for(var i=0;i<f.length;i++){ if(f[i].abaixo_de===null || preco<f[i].abaixo_de) return f[i]; }
    return f[f.length-1];
  }
  /* Tarifa de UM item, em reais. opts.cpf450 = vendedor CPF com mais de N pedidos em 90 dias (so Shopee). */
  function tarifaItem(plat, preco, opts){
    opts=opts||{};
    var fx=faixa(plat, preco), fixo=fx.fixo, nota='';
    if(plat.abaixo_de_8_fixo_metade_do_preco && preco<8){ fixo=preco/2; nota='Abaixo de R$ 8, o valor fixo é a metade do preço.'; }
    if(opts.cpf450 && plat.cpf_adicional_por_item){
      if(preco>=(plat.cpf_regressiva_abaixo_de||0)){ fixo+=plat.cpf_adicional_por_item; }
      else { nota='Abaixo de R$ '+plat.cpf_regressiva_abaixo_de+', a taxa do CPF é regressiva: confira na fonte oficial.'; }
    }
    var valor=preco*fx.pct/100+fixo;
    return { valor:valor, pctPreco: preco>0 ? valor/preco*100 : 0, regra: fx.pct+'% + '+brl(fixo)+' por item', nota:nota };
  }
  function carregar(){
    return fetch(DADOS_URL,{cache:'no-cache'}).then(function(r){
      if(!r.ok) throw new Error('http '+r.status); return r.json();
    });
  }
  /* Le ?preco= e ?qtd= do link compartilhado. So numeros. */
  function lerLink(){
    var q=new URLSearchParams(location.search), o={};
    var p=parseFloat(String(q.get('preco')||'').replace(',','.')), n=parseInt(q.get('qtd')||'',10);
    if(p>0 && p<=100000) o.preco=Math.round(p*100)/100;
    if(n>0 && n<=100000) o.qtd=n;
    if(q.get('cpf')==='1') o.cpf450=true;
    if(q.get('plano')==='premium'||q.get('plano')==='enterprise') o.plano=q.get('plano');
    return o;
  }
  /* Numero que sobe ate o valor (respeita reduced motion). */
  var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animar(el, alvo, fmt){
    if(!el) return;
    fmt=fmt||brl;
    var de=parseFloat(el.getAttribute('data-v')||'0'); el.setAttribute('data-v', String(alvo));
    if(reduz || !isFinite(de) || !isFinite(alvo)){ el.textContent=fmt(alvo); return; }
    var t0=null, dur=520;
    if(el._raf) cancelAnimationFrame(el._raf);
    function passo(t){
      if(!t0) t0=t; var k=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-k,3);
      el.textContent=fmt(de+(alvo-de)*e);
      if(k<1) el._raf=requestAnimationFrame(passo);
    }
    el._raf=requestAnimationFrame(passo);
  }
  window.MVCALC={ carregar:carregar, tarifaItem:tarifaItem, frescor:frescor, brl:brl, pct:pct, dataBR:dataBR, lerLink:lerLink, animar:animar, reduz:reduz };
})();
