/*!
 * MOVIKI mvqr.js | versao 2026-09-14-mvqr2 | repos: moviki-app e moviki
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * O gerador de QR code nasceu dentro do parceiro.html porque a CSP do painel
 * nao deixa carregar biblioteca de fora. Depois o painel do dono precisou do
 * MESMO gerador para o cracha. Copiar 250 linhas para dentro de um segundo
 * arquivo de 3 mil linhas seria criar dois lugares para consertar o mesmo bug
 * — e este gerador JA teve um: em 04/09/2026 os 15 modulos do format info
 * estavam escritos transpostos (linha 8 x coluna 8), com dados e mascara
 * certos e nenhum leitor abrindo.
 *
 * ---- 14/09/2026: VERSOES 7 A 13, por causa do Pix ----
 * Ate aqui o gerador ia da versao 1 a 6, nivel M: teto de 108 bytes. Isso
 * cobria o endereco /v/<apelido> com folga e NAO cobre um BR Code Pix, que
 * fica entre 130 e 190 bytes mesmo com chave curta — a chave aleatoria sozinha
 * tem 36 caracteres. Na pratica o QR do pagamento NUNCA cabia: mvQR devolvia
 * null em toda venda.
 *
 * Subir para a versao 13 (331 bytes) trouxe tres coisas que nao existiam:
 *   1) tabela de blocos e correcao das versoes 7 a 13;
 *   2) CONTADOR DE 16 BITS a partir da versao 10 (ate a 9 sao 8 bits) — errar
 *      isso gera um codigo que fecha o CRC e nenhum leitor abre;
 *   3) BLOCO DE VERSION INFO, 18 bits BCH(18,6) em DOIS cantos, obrigatorio
 *      da versao 7 em diante. Sem ele o leitor nao sabe o tamanho do simbolo.
 *
 * COMO FOI VALIDADO (nao existe biblioteca de referencia no ambiente: PyPI e
 * npm recusam os pacotes de QR):
 *   - DECODIFICADOR INDEPENDENTE, escrito do lado inverso da especificacao,
 *     sem compartilhar funcao nenhuma com o gerador: reconstroi o mapa de
 *     modulos reservados, le as DUAS copias do format info e do version info
 *     separadamente, desmascara, desintercala os blocos e calcula as sindromes
 *     de Reed-Solomon.
 *   - REGRESSAO: para as versoes 1 a 6 a matriz gerada e IDENTICA, modulo a
 *     modulo, a do gerador que ja esta no ar desde 03/09/2026. O cracha do
 *     parceiro nao muda de desenho.
 *
 * PUBLICA: window.mvQR(texto) -> { tam, mods, versao, mascara } ou null
 *          window.mvQRDesenhar(canvas, q, lado, claro, escuro)
 *
 * Modo byte, correcao M, versoes 1 a 13 — de um apelido curto ao copia-e-cola
 * do Pix.
 */
(function(){
  'use strict';

/* mvQR - gerador de QR code, modo byte, correcao M, versoes 1 a 13.
   Escrito a mao porque a CSP do painel nao deixa carregar biblioteca de fora.
   Devolve { tam, mods } onde mods[r*tam+c] === 1 significa modulo ESCURO. */
function mvQR(texto){
  'use strict';

  /* ---- capacidade e blocos, nivel M, versoes 1 a 13 ----
     [ total de codewords, EC por bloco, blocos g1, dados por bloco g1,
       blocos g2, dados por bloco g2 ]
     Confere sozinho: g1*d1 + g2*d2 + EC*(g1+g2) = total. */
  var TAB = {
    1:  [26,  10, 1, 16, 0, 0],
    2:  [44,  16, 1, 28, 0, 0],
    3:  [70,  26, 1, 44, 0, 0],
    4:  [100, 18, 2, 32, 0, 0],
    5:  [134, 24, 2, 43, 0, 0],
    6:  [172, 16, 4, 27, 0, 0],
    7:  [196, 18, 4, 31, 0, 0],
    8:  [242, 22, 2, 38, 2, 39],
    9:  [292, 22, 3, 36, 2, 37],
    10: [346, 26, 4, 43, 1, 44],
    11: [404, 30, 1, 50, 4, 51],
    12: [466, 22, 6, 36, 2, 37],
    13: [532, 22, 8, 37, 1, 38]
  };
  var ALINHA = {
    1:[], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30], 6:[6,34],
    7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50],
    11:[6,30,54], 12:[6,32,58], 13:[6,34,62]
  };

  /* ---- bytes UTF-8 ---- */
  var bytes = [];
  (function(){
    var s = unescape(encodeURIComponent(String(texto)));
    for (var i=0;i<s.length;i++) bytes.push(s.charCodeAt(i) & 255);
  })();

  /* ---- menor versao que cabe ----
     O contador do modo byte muda de tamanho na versao 10: 8 bits ate a 9,
     16 bits da 10 em diante. Por isso o cabecalho entra na conta AQUI, e nao
     como um "+2" fixo: na fronteira ele decide se cabe ou nao. */
  function cabecalhoBits(v){ return 4 + (v >= 10 ? 16 : 8); }
  var ver = 0;
  for (var v=1; v<=13; v++){
    var t = TAB[v];
    var dadosBits = (t[2]*t[3] + t[4]*t[5]) * 8;
    if (bytes.length*8 + cabecalhoBits(v) <= dadosBits){ ver = v; break; }
  }
  if (!ver) return null;                                 /* texto grande demais */

  var T = TAB[ver], ECN = T[1], TOTDADOS = T[2]*T[3] + T[4]*T[5];

  /* ---- fluxo de bits ---- */
  var bits = [];
  function por(valor, n){ for (var i=n-1;i>=0;i--) bits.push((valor>>i) & 1); }
  por(4, 4);                                  /* modo byte */
  por(bytes.length, ver >= 10 ? 16 : 8);      /* contador */
  for (var i=0;i<bytes.length;i++) por(bytes[i], 8);
  var falta = TOTDADOS*8 - bits.length;
  por(0, Math.min(4, falta));                 /* terminador */
  while (bits.length % 8) bits.push(0);
  var pad = [0xEC, 0x11], k = 0;
  while (bits.length < TOTDADOS*8){ por(pad[k++ & 1], 8); }

  var dados = [];
  for (var i=0;i<bits.length;i+=8){
    var b = 0; for (var j=0;j<8;j++) b = (b<<1) | bits[i+j];
    dados.push(b);
  }

  /* ---- GF(256), primitivo 0x11D ---- */
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function(){
    var x = 1;
    for (var i=0;i<255;i++){ EXP[i]=x; LOG[x]=i; x<<=1; if (x & 256) x ^= 0x11D; }
    for (var i=255;i<512;i++) EXP[i]=EXP[i-255];
  })();
  function mul(a,b){ return (a===0||b===0) ? 0 : EXP[LOG[a]+LOG[b]]; }

  function geradorRS(n){
    var g = [1];
    for (var i=0;i<n;i++){
      var novo = new Array(g.length+1).fill(0);
      for (var j=0;j<g.length;j++){
        novo[j]   ^= mul(g[j], 1);
        novo[j+1] ^= mul(g[j], EXP[i]);
      }
      g = novo;
    }
    return g;
  }
  function ec(bloco, n){
    var g = geradorRS(n);
    var r = bloco.slice().concat(new Array(n).fill(0));
    for (var i=0;i<bloco.length;i++){
      var c = r[i]; if (c === 0) continue;
      for (var j=0;j<g.length;j++) r[i+j] ^= mul(g[j], c);
    }
    return r.slice(bloco.length);
  }

  /* ---- blocos e intercalacao ---- */
  var blocos = [], ecs = [], p = 0;
  function fatiar(qtd, tam){
    for (var i=0;i<qtd;i++){
      var b = dados.slice(p, p+tam); p += tam;
      blocos.push(b); ecs.push(ec(b, ECN));
    }
  }
  fatiar(T[2], T[3]);
  if (T[4]) fatiar(T[4], T[5]);

  var fluxo = [];
  var maiorD = Math.max.apply(null, blocos.map(function(b){ return b.length; }));
  for (var i=0;i<maiorD;i++)
    for (var j=0;j<blocos.length;j++)
      if (i < blocos[j].length) fluxo.push(blocos[j][i]);
  for (var i=0;i<ECN;i++)
    for (var j=0;j<ecs.length;j++) fluxo.push(ecs[j][i]);

  /* ---- matriz ---- */
  var tam = ver*4 + 17;
  var m = new Int8Array(tam*tam).fill(-1);   /* -1 = livre */
  function pos(r,c,v){ m[r*tam+c] = v; }
  function ler(r,c){ return m[r*tam+c]; }

  function finder(r,c){
    for (var i=-1;i<=7;i++) for (var j=-1;j<=7;j++){
      var rr=r+i, cc=c+j;
      if (rr<0||cc<0||rr>=tam||cc>=tam) continue;
      var dentro = (i>=0&&i<=6&&(j===0||j===6)) || (j>=0&&j<=6&&(i===0||i===6)) ||
                   (i>=2&&i<=4&&j>=2&&j<=4);
      pos(rr,cc, dentro?1:0);
    }
  }
  finder(0,0); finder(0,tam-7); finder(tam-7,0);

  /* alinhamento: todas as combinacoes menos as que caem sobre os finders */
  var A = ALINHA[ver];
  for (var a=0;a<A.length;a++) for (var b=0;b<A.length;b++){
    var r=A[a], c=A[b];
    if ((r===6&&c===6) || (r===6&&c===tam-7) || (r===tam-7&&c===6)) continue;
    for (var i=-2;i<=2;i++) for (var j=-2;j<=2;j++)
      pos(r+i, c+j, (Math.max(Math.abs(i),Math.abs(j))!==1) ? 1 : 0);
  }

  /* temporizacao */
  for (var i=8;i<tam-8;i++){ var v2 = (i%2===0)?1:0; pos(6,i,v2); pos(i,6,v2); }

  /* modulo escuro fixo */
  pos(4*ver+9, 8, 1);

  /* reserva das areas de formato */
  for (var i=0;i<9;i++){ if (ler(8,i)===-1) pos(8,i,0); if (ler(i,8)===-1) pos(i,8,0); }
  for (var i=0;i<8;i++){ if (ler(8,tam-1-i)===-1) pos(8,tam-1-i,0); if (ler(tam-1-i,8)===-1) pos(tam-1-i,8,0); }

  /* VERSION INFO — so da versao 7 em diante.
     18 bits: 6 da versao + 12 de BCH(18,6) com gerador 0x1F25. Vai em DOIS
     blocos, um 3x6 no canto de baixo a esquerda e o espelho dele 6x3 no canto
     de cima a direita. Entra ANTES do zigue-zague porque estes modulos sao
     area reservada: escrever depois apagaria dado. */
  if (ver >= 7){
    var vd = ver << 12;
    var resto = ver << 12;
    for (var i=5;i>=0;i--) if (resto & (1<<(i+12))) resto ^= 0x1F25 << i;
    vd = (ver << 12) | (resto & 0xFFF);
    for (var i=0;i<18;i++){
      var bit = (vd >> i) & 1;
      var aa = tam - 11 + (i % 3), bb = Math.floor(i / 3);
      pos(aa, bb, bit);
      pos(bb, aa, bit);
    }
  }

  var reservado = m.slice();   /* quem ja estava ocupado antes dos dados */

  /* dados em zigue-zague, pulando a coluna 6 */
  var bi = 0, total = fluxo.length*8;
  function bitEm(n){ return n<total ? (fluxo[n>>3] >> (7-(n&7))) & 1 : 0; }
  var sobe = true;
  for (var col=tam-1; col>0; col-=2){
    if (col === 6) col--;
    for (var q=0;q<tam;q++){
      var r = sobe ? (tam-1-q) : q;
      for (var s=0;s<2;s++){
        var c = col - s;
        if (reservado[r*tam+c] !== -1) continue;
        pos(r, c, bitEm(bi++));
      }
    }
    sobe = !sobe;
  }

  /* ---- mascaras ---- */
  function regra(r,c,n){
    switch(n){
      case 0: return (r+c)%2===0;
      case 1: return r%2===0;
      case 2: return c%3===0;
      case 3: return (r+c)%3===0;
      case 4: return (Math.floor(r/2)+Math.floor(c/3))%2===0;
      case 5: return ((r*c)%2)+((r*c)%3)===0;
      case 6: return (((r*c)%2)+((r*c)%3))%2===0;
      case 7: return (((r+c)%2)+((r*c)%3))%2===0;
    }
  }
  function aplicar(base, n){
    var out = base.slice();
    for (var r=0;r<tam;r++) for (var c=0;c<tam;c++){
      if (reservado[r*tam+c] !== -1) continue;
      if (regra(r,c,n)) out[r*tam+c] ^= 1;
    }
    return out;
  }
  function formato(n, alvo){
    /* EC nivel M = 00. BCH(15,5) com gerador 0x537 e mascara 0x5412.
       Ordem dos 15 modulos conforme ISO/IEC 18004: a primeira copia sobe pela
       coluna 8 e vira na linha 8; a segunda corre pela linha 8 a direita e
       desce pela coluna 8. Escrito transposto, o QR sai com dados corretos e
       formato ilegivel - nenhum leitor abre. */
    var v3 = (0 << 3) | n;
    var d = v3 << 10;
    for (var i=4;i>=0;i--) if (d & (1<<(i+10))) d ^= 0x537 << i;
    var f = ((v3 << 10) | d) ^ 0x5412;
    for (var i=0;i<15;i++){
      var b = (f >> i) & 1;
      /* copia 1: coluna 8 (linhas 0..5, 7, 8) e linha 8 (colunas 7..0) */
      if (i<6)        alvo[i*tam+8]        = b;
      else if (i<8)   alvo[(i+1)*tam+8]    = b;
      else if (i===8) alvo[8*tam+7]        = b;
      else            alvo[8*tam+(14-i)]   = b;
      /* copia 2: linha 8 a direita (8 modulos) e coluna 8 embaixo (7 modulos).
         O corte em 8 preserva o MODULO ESCURO fixo em (tam-8, 8). */
      if (i<8) alvo[8*tam+(tam-1-i)]       = b;
      else     alvo[(tam-15+i)*tam+8]      = b;
    }
  }
  function penal(g){
    var p1=0,p2=0,p3=0,escuros=0;
    function corrida(get){
      var t=0;
      for (var a=0;a<tam;a++){
        var n=1;
        for (var b=1;b<tam;b++){
          if (get(a,b)===get(a,b-1)) n++;
          else { if (n>=5) t += 3+(n-5); n=1; }
        }
        if (n>=5) t += 3+(n-5);
      }
      return t;
    }
    p1 = corrida(function(r,c){ return g[r*tam+c]; }) + corrida(function(c,r){ return g[r*tam+c]; });
    for (var r=0;r<tam-1;r++) for (var c=0;c<tam-1;c++){
      var a=g[r*tam+c];
      if (a===g[r*tam+c+1] && a===g[(r+1)*tam+c] && a===g[(r+1)*tam+c+1]) p2 += 3;
    }
    var A1=[1,0,1,1,1,0,1,0,0,0,0], A2=[0,0,0,0,1,0,1,1,1,0,1];
    function bate(v2,i,P){ for (var k=0;k<11;k++) if (v2[i+k]!==P[k]) return false; return true; }
    for (var r=0;r<tam;r++){
      var lin=[], col=[];
      for (var c=0;c<tam;c++){ lin.push(g[r*tam+c]); col.push(g[c*tam+r]); }
      for (var i=0;i+11<=tam;i++){
        if (bate(lin,i,A1)||bate(lin,i,A2)) p3 += 40;
        if (bate(col,i,A1)||bate(col,i,A2)) p3 += 40;
      }
    }
    for (var i=0;i<g.length;i++) if (g[i]===1) escuros++;
    var pct = escuros*100/(tam*tam);
    var p4 = Math.floor(Math.abs(pct-50)/5)*10;
    return p1+p2+p3+p4;
  }

  var melhor=null, melhorN=0, menor=Infinity;
  for (var n=0;n<8;n++){
    var g = aplicar(m, n);
    formato(n, g);
    var pe = penal(g);
    if (pe < menor){ menor=pe; melhor=g; melhorN=n; }
  }
  return { tam: tam, mods: melhor, versao: ver, mascara: melhorN };
}

  function mvQRDesenhar(cv, q, lado, claro, escuro){
    var ctx = cv.getContext('2d');
    var borda = 4;                                  /* zona de silencio, em modulos */
    var n = q.tam + borda*2;
    var p = Math.floor(lado / n);
    var sobra = lado - p*n;
    var off = Math.floor(sobra/2);
    cv.width = lado; cv.height = lado;
    ctx.fillStyle = claro; ctx.fillRect(0,0,lado,lado);
    ctx.fillStyle = escuro;
    for (var r=0;r<q.tam;r++) for (var c=0;c<q.tam;c++){
      if (!q.mods[r*q.tam+c]) continue;
      ctx.fillRect(off + (c+borda)*p, off + (r+borda)*p, p, p);
    }
  }

  window.mvQR = mvQR;
  window.mvQRDesenhar = mvQRDesenhar;
})();
