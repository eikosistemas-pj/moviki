/*!
 * MOVIKI lib/seo.js | versao 2026-09-16-seo1 | repo: moviki (site publico)
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * No dia em que o /sitemap-negocios.xml entrou no ar, ele listou CINCO paginas.
 * Duas delas eram lixo de cadastro:
 *
 *     moviki.com.br/email
 *     moviki.com.br/fabiofffggggmailcom
 *
 * A segunda e um e-mail digitado no campo do apelido, com os pontos e o arroba
 * comidos pelo saneamento do slug. As duas passavam no portao de qualidade do
 * api/og.js — tinham nome, ponto no mapa e algum conteudo — porque aquele
 * portao pergunta "a pagina esta preenchida?", e nao "esta pagina representa um
 * negocio de verdade?".
 *
 * O proprio comentario do og.js ja avisava do risco:
 *   "pagina magra em quantidade derruba a reputacao do dominio inteiro, e o
 *    dominio e um so pra todos os lojistas."
 * Com a base pequena, indexar duas paginas de teste em cinco significa que
 * 40% do que o Google ve do dominio e sujeira.
 *
 * A REGRA MORA AQUI, NUM LUGAR SO
 * O og.js decide o meta robots da pagina; o sitemap.js decide quem entra na
 * lista. Se a regra vivesse copiada nos dois, um dia eles divergiriam e o
 * Search Console encheria de "Enviada, mas marcada como noindex". Os dois
 * importam desta funcao.
 *
 * DUAS CAMADAS, de proposito
 *
 * 1. HEURISTICA (automatica): slug que e palavra generica de formulario ou que
 *    carrega provedor de e-mail dentro. Pega o lixo que vai continuar nascendo
 *    sem ninguem precisar lembrar de nada.
 *
 * 2. LISTA DA ENV `SEO_SLUGS_FORA` (manual): contas internas, demonstracoes e
 *    testes com nome de gente, que heuristica nenhuma adivinha. Hoje sao a
 *    conta do dono e a conta de demonstracao. E env, e nao codigo, para o Paulo
 *    tirar e por sem deploy — o que muda toda semana nao pode exigir upload.
 *
 * O QUE ESTA FUNCAO NAO FAZ
 * Nao esconde a pagina de ninguem. O link continua abrindo, o preview do
 * WhatsApp continua completo, o lojista continua compartilhando. O unico efeito
 * e `noindex,follow` e ficar fora do sitemap — buscador, so isso.
 */
'use strict';

/* Palavras que nunca sao nome de negocio. Sao o que sobra quando alguem
   preenche o campo do apelido com a etiqueta do campo, ou com um dado de
   cadastro. Comparadas ao slug INTEIRO, nunca a um pedaco: "emailmarketing" e
   um nome legitimo e nao pode cair aqui. */
const RESERVADOS = [
  'email', 'e-mail', 'mail', 'senha', 'login', 'teste', 'testes', 'test',
  'admin', 'administrador', 'demo', 'demonstracao', 'exemplo', 'example',
  'novo', 'nova', 'conta', 'user', 'usuario', 'cliente', 'nome', 'negocio',
  'meunegocio', 'undefined', 'null', 'nan', 'asdf', 'aaa', 'abc', '123',
  'sem-nome', 'semnome'
];

/* Provedor de e-mail dentro do slug: o campo do apelido recebeu um endereco de
   e-mail e o saneamento comeu o arroba e os pontos.
   "fabiofffggggmailcom" -> termina em "gmailcom".

   ANCORADO NO FIM, e isso importa: e-mail achatado SEMPRE termina em "com" ou
   "combr". Sem a ancora, um negocio chamado "Bol Comidas" vira "bolcomidas",
   casa com "bol"+"com" e sai do indice sem ninguem entender por que. Falso
   positivo aqui e pior que falso negativo: o lixo o Paulo tira na mao pela
   env, mas o negocio legitimo barrado ninguem descobre. */
const EMAIL_ACHATADO =
  /(gmail|hotmail|outlook|yahoo|icloud|bol|uol|terra|globomail|live|msn|protonmail)com(br)?$/i;

function normalizar(s) {
  return String(s || '').trim().toLowerCase();
}

/* Slugs barrados a mao, pela env do projeto Vercel do site.
   Formato: separados por virgula. Ex.: SEO_SLUGS_FORA=ricopj,karina
   Ler a env a cada chamada e de proposito: a funcao roda em serverless, e
   guardar em cache do modulo faria a troca da env so valer no proximo deploy. */
function listaManual() {
  return normalizar(process.env.SEO_SLUGS_FORA)
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

/* true = pagina de negocio de verdade, pode ir para o Google.
   false = existe e abre normalmente, mas sai do indice e do sitemap. */
function indexavelPeloSlug(slug) {
  const s = normalizar(slug);
  if (!s) return false;
  if (RESERVADOS.indexOf(s) >= 0) return false;
  if (EMAIL_ACHATADO.test(s)) return false;
  if (listaManual().indexOf(s) >= 0) return false;
  /* So digito tambem nao e nome de negocio: "12345" e cadastro de teste. */
  if (/^[0-9_-]+$/.test(s)) return false;
  return true;
}

module.exports = { indexavelPeloSlug, RESERVADOS };
