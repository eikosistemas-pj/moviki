/*!
 * MOVIKI api/teste-cf.js | versao 2026-11-09-teste-cf | repo: moviki (site publico)
 *
 * TESTE UNICO DE CARGA NA API DO CLOUDFLARE (plano de escala da live, teste B).
 * Arquivo TEMPORARIO: apagar depois de ler o resultado.
 *
 * A PERGUNTA
 * O Cloudflare aceita 1.200 chamadas a cada 5 minutos. A documentacao diz
 * "por usuario" num lugar e "por token" em outro. O api/live.js usa 4 tokens
 * em rodizio (CF_STREAM_TOKEN de usuario; CF_STREAM_TOKEN_2 a _4 da conta).
 * Se cada token tem o seu limite, a abertura de lives ao mesmo tempo fica ~4x
 * maior. Se o limite e somado, as chaves extras nao mudam nada.
 *
 * COMO RESPONDE
 *   0. 1 chamada com cada token: confere se todos funcionam.
 *   1. Rajada SO DE LEITURA (lista de entradas de live, custo zero) com o
 *      token 1 ate levar 429. Na hora, 1 chamada com cada um dos outros.
 *   2. Se o token 2 seguiu livre, rajada nele ate o 429 e 1 chamada com o 3
 *      e o 4 (descobre se os tokens da CONTA dividem o limite entre si).
 * Nao cria, nao apaga e nao muda nada no Cloudflare. Nenhum token sai no log.
 *
 * QUEM CHAMA
 * So o cron da Vercel (vercel.json), uma vez, as 03:00 de Brasilia de
 * 10/11/2026 (06:00 UTC), com Authorization: Bearer CRON_SECRET (env deste
 * projeto). Fora da janela de 06:00 a 06:30 UTC desse dia, nao faz nada.
 *
 * EFEITO COLATERAL ACEITO PELO PAULO (09/11/2026)
 * O token que leva 429 descansa 5 minutos. Se o limite for somado, a abertura
 * de live fica travada por ate 5 minutos as 03:00 (o estudio mostra a fila e
 * tenta de novo sozinho). Live que ja esta no ar nao cai: o video nao passa
 * por esta API.
 *
 * O RESULTADO sai numa linha "TESTE_CF {...}" nos logs da Vercel do projeto
 * moviki (e na resposta, que so o cron ve).
 */

const CF_API = 'https://api.cloudflare.com/client/v4/accounts/';
const JANELA_INI = Date.UTC(2026, 10, 10, 6, 0, 0);   // 10/11/2026 06:00 UTC
const JANELA_FIM = Date.UTC(2026, 10, 10, 6, 30, 0);
const LOTE = 25;           // chamadas em paralelo por vez
const MAX_RAJADA = 1500;   // passa com folga do limite de 1.200
let rodou = false;

function tokens() {
  const nomes = ['CF_STREAM_TOKEN', 'CF_STREAM_TOKEN_2', 'CF_STREAM_TOKEN_3', 'CF_STREAM_TOKEN_4', 'CF_STREAM_TOKEN_5'];
  return nomes.map(n => ({ nome: n, valor: process.env[n] })).filter(t => t.valor);
}

async function chamar(t) {
  const ini = Date.now();
  try {
    const r = await fetch(CF_API + process.env.CF_ACCOUNT_ID + '/stream/live_inputs?per_page=1', {
      headers: { Authorization: 'Bearer ' + t.valor }
    });
    const cab = {};
    r.headers.forEach((v, k) => { if (/ratelimit|retry-after/i.test(k)) cab[k] = v; });
    await r.text().catch(() => '');
    return { status: r.status, ms: Date.now() - ini, cab };
  } catch (e) {
    return { status: 0, ms: Date.now() - ini, erro: String(e && e.message || e).slice(0, 80) };
  }
}

async function sonda(lista) {
  const out = {};
  for (const t of lista) { const r = await chamar(t); out[t.nome] = { status: r.status, cab: r.cab }; }
  return out;
}

async function rajada(t) {
  const ini = Date.now();
  let feitas = 0, ok = 0, primeiro429 = null, cab429 = null, outros = {};
  while (feitas < MAX_RAJADA && primeiro429 === null) {
    const lote = await Promise.all(Array.from({ length: LOTE }, () => chamar(t)));
    for (const r of lote) {
      feitas++;
      if (r.status === 200) ok++;
      else if (r.status === 429) { if (primeiro429 === null) { primeiro429 = feitas; cab429 = r.cab; } }
      else outros[r.status] = (outros[r.status] || 0) + 1;
    }
    if (Date.now() - ini > 150000) break;   // trava de seguranca do tempo da funcao
  }
  return { token: t.nome, feitas, ok, primeiro429, cab429, outros, segundos: Math.round((Date.now() - ini) / 1000) };
}

module.exports = async (req, res) => {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.authorization !== 'Bearer ' + segredo) {
    res.statusCode = 401; return res.end('{"erro":"nao"}');
  }
  const agora = Date.now();
  if (agora < JANELA_INI || agora > JANELA_FIM) {
    res.statusCode = 200; return res.end('{"pulado":"fora_da_janela"}');
  }
  if (rodou) { res.statusCode = 200; return res.end('{"pulado":"ja_rodou"}'); }
  rodou = true;

  const lista = tokens();
  const resultado = { em: new Date(agora).toISOString(), tokens: lista.map(t => t.nome) };
  if (!process.env.CF_ACCOUNT_ID || lista.length < 2) {
    resultado.erro = 'precisa de CF_ACCOUNT_ID e de 2 ou mais tokens';
  } else {
    resultado.passo0_cada_token = await sonda(lista);
    resultado.passo1_rajada = await rajada(lista[0]);
    resultado.passo1_depois = await sonda(lista.slice(1));
    const t2 = resultado.passo1_depois[lista[1].nome];
    if (t2 && t2.status === 200 && lista.length >= 3) {
      resultado.passo2_rajada = await rajada(lista[1]);
      resultado.passo2_depois = await sonda(lista.slice(2));
    }
    const d1 = resultado.passo1_depois;
    const livres1 = Object.values(d1).filter(x => x.status === 200).length;
    if (resultado.passo1_rajada.primeiro429 === null) resultado.conclusao = 'o token 1 nao chegou ao limite; teste inconclusivo';
    else if (livres1 === 0) resultado.conclusao = 'LIMITE SOMADO: todos os tokens travaram junto com o token 1';
    else if (resultado.passo2_depois) {
      const livres2 = Object.values(resultado.passo2_depois).filter(x => x.status === 200).length;
      resultado.conclusao = livres2 > 0
        ? 'LIMITE POR TOKEN: cada token tem o seu (usuario e conta separados, e os da conta separados entre si)'
        : 'usuario separado da conta, mas os tokens da conta dividem um limite entre si';
    } else resultado.conclusao = 'token de usuario separado dos da conta; parte 2 nao rodou';
  }
  console.log('TESTE_CF ' + JSON.stringify(resultado));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(resultado));
};
