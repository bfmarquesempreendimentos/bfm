'use strict';

var { extractLaudoFields, isPersonName, dateFromDocName } = require('./laudo-extract');
var { nextDocFileName } = require('./doc-revision-name');

var failed = 0;
function eq(actual, expected, msg) {
  var ok = actual === expected;
  if (!ok) {
    failed += 1;
    console.error('FAIL', msg, { actual: actual, expected: expected });
  } else {
    console.log('ok', msg);
  }
}

var apto101 = [
  'Vistoria Data da | Vistoria | Uso | 15/01/2026 Residencial',
  'HAVA ROCHA | CPF/MatrículaResponsável Técnico | 082.254.239-09ENG. CIVIL 2014115698 | CREA / CAU | CYNTHIA VARGAS CUCHAVA | ROCHA | BLACK HILLS ENGINEERING SERVICE',
  '31,98 5.529,42 R$ 176.830,79',
  'Área (m²) R$/m² Valor Produto (R$)',
  '177.000,00 (CENTO E SETENTA E SETE MIL REAIS)Valor de Avaliação R$',
  'Vistoria do imóvel realizada em 15/01/2026 às 10:00hs',
  'MANIFESTAÇÃO SOBRE A POSSIBILIDADE DE ACEITAÇÃO DO BEM COMO GARANTIA',
  'Com Base nos Subsídios Disponíveis o imóvel é passível de aceitação.',
].join('\n');

var r101 = extractLaudoFields(apto101, 'Laudo_101.pdf');
eq(r101.appraisalDate, '2026-01-15', 'APTO 101 data');
eq(r101.appraiser, 'CYNTHIA VARGAS CUCHAVA ROCHA', 'APTO 101 responsável');
eq(r101.engineeringValue, 176830.79, 'APTO 101 valor');
eq(r101.valuePerM2, 5529.42, 'APTO 101 m²');
eq(r101.garantiaCaixa, 'apta', 'APTO 101 garantia');

var itauna = [
  'Vistoria Data da | Vistoria | Uso | 21/01/2026 Residencial Unifamiliar',
  'CPF | LUIZ FERNANDO GOMES SOUTINHO | Responsável Técnico | 21/01/2026 | Data | Responsável Tecnico Representante Legal Outros',
  '5.574,81',
  'Área (m²) R$/m² Valor Global (R$)',
  'Valor de Avaliação R$ 193.000,00 (CENTO E NOVENTA E TRÊS MIL REAIS)',
  'Vistoria do imóvel realizada em 21/01/2026 às 16:30hs',
  'Não atende aos requisitos mínimos estabelecidos pela CAIXA, conforme informações complementares',
  'Justificativa garantia: Não possui infraestrutura mínima estabelecida',
].join('\n');

var rCasa = extractLaudoFields(itauna, 'Casa_01.pdf');
eq(rCasa.appraisalDate, '2026-01-21', 'Itaúna data');
eq(rCasa.appraiser, 'LUIZ FERNANDO GOMES SOUTINHO', 'Itaúna responsável');
eq(rCasa.engineeringValue, 193000, 'Itaúna valor');
eq(rCasa.valuePerM2, 5574.81, 'Itaúna m²');
eq(rCasa.garantiaCaixa, 'inapta', 'Itaúna garantia');
eq(rCasa.appraiser === 'Representante Legal', false, 'não pega Representante Legal');

var junk = [
  'Responsável Tecnico Representante Legal Outros',
  'Área (m²) R$/m² Valor Global (R$)',
  '201.000,00',
  'Valor de Avaliação R$ 201.000,00',
].join('\n');
var rJunk = extractLaudoFields(junk, 'laudo.pdf');
eq(rJunk.appraiser, '', 'lixo do formulário não vira responsável');
eq(rJunk.valuePerM2, '', 'valor global não vira m²');
eq(rJunk.engineeringValue, 201000, 'ainda lê o valor de avaliação');

var fromName = extractLaudoFields('', '27:11:2016.pdf');
eq(fromName.appraisalDate, '2016-11-27', 'data pelo nome do arquivo');
eq(dateFromDocName('27-11-2016.pdf'), '2016-11-27', 'dateFromDocName hífen');
eq(isPersonName('Representante Legal'), false, 'isPersonName rejeita cargo');
eq(isPersonName('LUIZ FERNANDO GOMES SOUTINHO'), true, 'isPersonName aceita avaliador');

eq(nextDocFileName('laudo', []), 'laudo.pdf', 'primeiro laudo');
eq(nextDocFileName('laudo', ['27:11:2016.pdf', 'laudo.pdf']), 'laudo2.pdf', 'revalidação vira laudo2');
eq(nextDocFileName('laudo', ['27:11:2016.pdf']), 'laudo.pdf', 'nome antigo não conta como laudo1');
eq(nextDocFileName('laudo', ['Laudo_101.pdf']), 'laudo.pdf', 'Laudo_101 não vira revisão 101');

if (failed) {
  console.error('\n' + failed + ' falha(s)');
  process.exit(1);
}
console.log('\ntodos os testes ok');
