/*!
 * MOVIKI vocab.js | versao 2026-10-17-vocab
 * DUAS CÓPIAS IDÊNTICAS: moviki-app/vocab.js (painel e estúdio da live)
 * e moviki/vocab.js (página pública do negócio e prévia do link no
 * WhatsApp, lida pelo api/og.js no servidor). Mexeu numa, mexe na outra
 * (mesma regra do mvmetrica.js).
 *
 * VOCABULÁRIO POR RAMO (17/10/2026)
 * Pedido do Paulo: uma loja de roupas entrou e viu "Cardápio" com garfo e
 * faca. "Cardápio" só vale para quem vende comida e bebida pronta; os demais
 * ramos veem "Catálogo" (masculino, como "cardápio": "do catálogo",
 * "seu catálogo" continuam certos sem reescrever frase nenhuma).
 *
 * Chave = subtipo do quiz (campo `segmento` de negocios/{uid}), a mesma de
 * quiz/quiz-segmentos.js. Subtipo novo no quiz = linha nova aqui.
 *   [macro, nome exibido, comida(1/0), desenho da barra, ícone 3D (icones/cat-*.png)]
 *
 * Nada é gravado: só muda o que aparece na tela. O id interno (`cardapio`,
 * aba, coleção, campo) NÃO muda.
 */
(function(){
  'use strict';

  var SUB = {
    /* Loja de bairro / Shopping */
    farmacia:["lojas","Farmácia / Drogaria",0,"sacola","farmacia"],
    lojapet:["lojas","Pet Shop",0,"sacola","pet"],
    bebe:["lojas","Bebê e Infantil",0,"roupa","infantil"],
    brinquedos:["lojas","Brinquedos",0,"sacola","infantil"],
    esportes:["lojas","Esporte e Fitness",0,"roupa","moda"],
    casa:["lojas","Casa, Cama, Mesa e Banho",0,"sacola","casa"],
    eletronicos:["lojas","Eletrônicos e Games",0,"sacola","eletronicos"],
    autopecas:["lojas","Autopeças e Acessórios",0,"sacola","automotivo"],
    presentes:["lojas","Presentes e Artigos de Festa",0,"sacola","shopping"],
    /* Alimentação */
    foodtruck:["alimentacao","Hamburgueria / Food Truck",1,"talher",""],
    pizzaria:["alimentacao","Pizzaria",1,"talher",""],
    sushi:["alimentacao","Sushi / Comida Japonesa",1,"talher",""],
    lanches:["alimentacao","Pastelaria / Lanches de Rua",1,"talher",""],
    pratofeito:["alimentacao","Prato Feito / Marmitex",1,"talher",""],
    pipoca:["alimentacao","Pipoca / Doces e Guloseimas",1,"talher",""],
    padaria:["alimentacao","Padaria / Confeitaria / Doces",1,"talher",""],
    acougue:["alimentacao","Açougue / Empório",0,"sacola","feira"],
    /* Hortifrúti / Feira */
    feira:["hortifruti","Verduras, Legumes e Frutas",0,"sacola","feira"],
    floricultura:["hortifruti","Floricultura / Plantas e Mudas",0,"sacola","naturais"],
    /* Bebidas */
    sorvete:["bebidas","Sorvete / Picolé / Açaí",1,"talher",""],
    suco:["bebidas","Suco / Vitamina Natural",1,"talher",""],
    cafeteria:["bebidas","Café / Cafeteria",1,"talher",""],
    aguacoco:["bebidas","Água de Coco / Bebidas",1,"talher",""],
    barmovel:["bebidas","Bar Móvel / Chopp / Drinks",1,"talher",""],
    /* Suplementos & Nutrição */
    suplementosesportivos:["suplementos","Suplementos / Nutrição Esportiva",0,"sacola","naturais"],
    naturaisvitaminas:["suplementos","Produtos Naturais / Vitaminas",0,"sacola","naturais"],
    /* Moda / Brechó */
    roupas:["moda","Moda / Roupas",0,"roupa","moda"],
    calcados:["moda","Calçados",0,"roupa","moda"],
    acessorios:["moda","Acessórios / Bijuterias",0,"sacola","joalheria"],
    /* Artesanato */
    decoracao:["artesanato","Decoração / Utilidades",0,"sacola","artesanato"],
    bijuteriaartesanal:["artesanato","Bijuteria Artesanal",0,"sacola","joalheria"],
    manufaturados:["artesanato","Artesanato",0,"sacola","artesanato"],
    /* Serviços */
    petshop:["servicos","Banho e Tosa",0,"servico","pet"],
    barbeariasalao:["servicos","Barbearia / Salão",0,"servico","beleza"],
    estetica:["servicos","Estética / Manicure",0,"servico","beleza"],
    lavagemcarro:["servicos","Lavagem de Carro",0,"servico","automotivo"],
    chaveiroconserto:["servicos","Chaveiro / Conserto Rápido",0,"servico","servicos"],
    otica:["servicos","Ótica / Óculos",0,"servico","otica"],
    /* Beleza & Perfumaria */
    perfumariacosmeticos:["belezaperfumaria","Perfumaria / Cosméticos",0,"sacola","beleza"],
    /* Papelaria & Livraria */
    livrariapapelaria:["papelarialivraria","Livraria / Papelaria",0,"sacola","papelaria"],
    /* Tecnologia / Acessórios */
    acessorioscelular:["tecnologia","Acessórios de Celular",0,"sacola","eletronicos"],
    relogiosgadgets:["tecnologia","Relógios e Gadgets",0,"sacola","eletronicos"]
  };

  /* Macro sem subtipo conhecido (conta antiga): comida só nestes dois. */
  var MACRO_COMIDA = { alimentacao:1, bebidas:1 };
  var MACRO_DESENHO = { moda:'roupa', servicos:'servico' };

  /* Desenhos de traço 24x24 (mesmo estilo dos ícones da barra). */
  var DESENHO = {
    talher: ['M6 3v7a3 3 0 0 0 6 0V3','M9 10v11','M17 3c-1.7 1.6-2.5 3.6-2.5 6 0 1.7.8 2.8 2.5 3v9'],
    roupa:  ['M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z'],
    sacola: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z','M3 6h18','M16 10a4 4 0 0 1-8 0'],
    servico:['M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z','M7.5 7.5h.01']
  };

  /* Conta sem ramo (cadastro direto, P82) fica no neutro "Catálogo": ela
     escolhe o ramo logo na entrada do painel. */
  function info(seg, macro){
    seg = String(seg || '').trim();
    macro = String(macro || '').trim();
    var s = SUB[seg];
    if (s && !macro) macro = s[0];
    var comida = s ? !!s[2] : !!MACRO_COMIDA[macro];
    var desenho = s ? s[3] : (comida ? 'talher' : (MACRO_DESENHO[macro] || 'sacola'));
    var ico = s && s[4] ? s[4] : (comida ? '' : 'shopping');
    return {
      comida: comida,
      T: comida ? 'Cardápio' : 'Catálogo',
      t: comida ? 'cardápio' : 'catálogo',
      desenho: desenho,
      ico3d: comida ? 'icones/cardapio.png' : ('icones/cat-' + ico + '.png'),
      rotulo: s ? s[1] : '',
      macro: macro
    };
  }

  function svgTexto(nome, extraAttr){
    var p = DESENHO[nome] || DESENHO.sacola, h = '';
    for (var i = 0; i < p.length; i++) h += '<path d="' + p[i] + '"/>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (extraAttr || '') + '>' + h + '</svg>';
  }

  /* Troca os traços de um <svg> já na tela (sem innerHTML). */
  function pintarSvg(svg, nome){
    if (!svg || svg.getAttribute('data-mvdesenho') === nome) return;
    var p = DESENHO[nome] || DESENHO.sacola;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    for (var i = 0; i < p.length; i++){
      var e = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      e.setAttribute('d', p[i]); svg.appendChild(e);
    }
    svg.setAttribute('data-mvdesenho', nome);
  }

  /* ---------- troca de texto na tela ---------- */
  var atual = null, vigia = null;
  var RE = /Cardápio|Catálogo|cardápio|catálogo|CARDÁPIO|CATÁLOGO/g;
  /* Texto que não se troca: código, e o que o próprio usuário digita. */
  var PULA = { SCRIPT:1, STYLE:1, TEXTAREA:1, INPUT:1, NOSCRIPT:1, CODE:1 };
  /* Elemento cujos atributos não se trocam. */
  var NAO_EL = { SCRIPT:1, STYLE:1, NOSCRIPT:1 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function trocar(str){
    if (!atual || !str || str.indexOf('rdápio') < 0 && str.indexOf('atálogo') < 0 && str.indexOf('RDÁPIO') < 0 && str.indexOf('ATÁLOGO') < 0) return str;
    var v = atual;
    return str.replace(RE, function(m){
      if (m === m.toUpperCase()) return v.T.toUpperCase();
      return m.charAt(0) === m.charAt(0).toUpperCase() ? v.T : v.t;
    });
  }
  function pulavel(n){
    for (var e = n; e && e.nodeType === 1; e = e.parentNode){
      if (PULA[e.nodeName]) return true;
      if (e.isContentEditable) return true;
      if (e.getAttribute && e.getAttribute('data-mvvocab') === 'nao') return true;
    }
    return false;
  }
  function trocarTexto(no){
    if (no.nodeType !== 3) return;
    var a = no.nodeValue, b = trocar(a);
    if (b !== a && !pulavel(no.parentNode)) no.nodeValue = b;
  }
  function trocarElemento(el){
    if (el.nodeType !== 1 || NAO_EL[el.nodeName]) return;
    for (var i = 0; i < ATTRS.length; i++){
      var v = el.getAttribute(ATTRS[i]);
      if (v){ var w = trocar(v); if (w !== v) el.setAttribute(ATTRS[i], w); }
    }
    if (el.nodeName === 'IMG') icone3d(el);
    if (el.nodeName === 'svg' || el.nodeName === 'SVG'){ if (el.getAttribute('data-mvvocab') === 'desenho') pintarSvg(el, atual.desenho); return; }
  }
  /* Ícone 3D: guarda o original e aponta para o do ramo. Desenho que
     faltar cai no original pelo onerror já existente na tag. */
  function icone3d(img){
    var orig = img.getAttribute('data-mvico');
    var src = img.getAttribute('src') || '';
    if (!orig){
      if (!/(^|\/)icones\/cardapio\.png$/.test(src)) return;
      orig = src; img.setAttribute('data-mvico', orig);
    }
    var pref = orig.replace(/icones\/cardapio\.png$/, '');
    var alvo = pref + atual.ico3d;
    if (src !== alvo) img.setAttribute('src', alvo);
  }
  function varrer(raiz){
    if (!atual || !raiz) return;
    if (raiz.nodeType === 3){ trocarTexto(raiz); return; }
    if (raiz.nodeType !== 1 && raiz.nodeType !== 9 && raiz.nodeType !== 11) return;
    if (raiz.nodeType === 1){ if (NAO_EL[raiz.nodeName]) return; trocarElemento(raiz); }
    var w = document.createTreeWalker(raiz, 1 | 4, null);
    var n;
    while ((n = w.nextNode())){
      if (n.nodeType === 3) trocarTexto(n);
      else trocarElemento(n);
    }
  }
  function ligarVigia(){
    if (vigia || typeof MutationObserver === 'undefined' || !document.body) return;
    vigia = new MutationObserver(function(lista){
      if (!atual) return;
      for (var i = 0; i < lista.length; i++){
        var m = lista[i];
        if (m.type === 'characterData') trocarTexto(m.target);
        else if (m.type === 'attributes') trocarElemento(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) varrer(m.addedNodes[j]);
      }
    });
    vigia.observe(document.body, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['src','placeholder','title','aria-label','alt'] });
  }

  /* Aplica o vocabulário do ramo na página inteira e vigia o que entrar
     depois. Chamar de novo com outro ramo troca tudo de volta. */
  function aplicar(seg, macro){
    var v = info(seg, macro);
    v.chave = String(seg||'') + '|' + String(macro||'');
    if (atual && atual.chave === v.chave && vigia) return atual;
    atual = v;
    try { localStorage.setItem('mv_vocab', JSON.stringify([String(seg||''), String(macro||'')])); } catch(_){}
    var go = function(){
      varrer(document.body);
      var ds = document.querySelectorAll('svg[data-mvvocab="desenho"]');
      for (var i = 0; i < ds.length; i++) pintarSvg(ds[i], v.desenho);
      ligarVigia();
      try { document.documentElement.setAttribute('data-mvcomida', v.comida ? '1' : '0'); } catch(_){}
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
    return v;
  }

  /* Painel: repete o último ramo visto neste aparelho já na abertura, para
     a palavra certa não piscar antes de o negócio carregar. */
  function lembrar(){
    try {
      var x = JSON.parse(localStorage.getItem('mv_vocab') || 'null');
      if (x && x.length === 2) aplicar(x[0], x[1]);
    } catch(_){}
  }

  var api = { info:info, aplicar:aplicar, lembrar:lembrar, svgTexto:svgTexto, trocar:function(s){ return trocar(s); }, SUB:SUB };
  if (typeof window !== 'undefined') window.mvVocab = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
