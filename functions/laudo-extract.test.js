'use strict';

var fs = require('fs');
var { extractLaudoFields, extractLaudoFromPdf, isPersonName, dateFromDocName, unitHintMatches } = require('./laudo-extract');
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

var apto205 = [
  'VistoriaData da VistoriaUso da UnidadeOcupaçãoPosição FísicaAndar',
  '01/06/2026ResidencialDesocupadoFrente/Meio2',
  'Sim, Somos Favoráveis à Aceitação do Imóvel Como Garantia',
  'MANIFESTAÇÃO SOBRE A POSSIBILIDADE DE ACEITAÇÃO DO BEM COMO GARANTIA E SOBRE A SUA CONFORMIDADE COM A DOCUMENTAÇÃO E',
  'ATENDIMENTO AOS REQUISITOS MÍNIMOS DE ENGENHARIA / ARQUITETURA ESTABELECIDOS PELA CAIXA',
  'Não atendeu aos seguintes Requisitos Gerais:',
  '33,625.978,58R$ 201.000,00',
  'Área (m²)R$/m²Valor Produto (R$)',
  '201.000,00 (DUZENTOS E UM MIL REAIS)Valor de Avaliação R$',
  'SIGNATÁRIOS',
  'Formação',
  'GUALTER VIEIRA FIGUEIREDO',
  'CPF/MatrículaResponsável Técnico',
  'CREA / CAU',
  'GUALTER VIEIRA FIGUEIREDO',
  'VIEIRA FIGUEIREDO ENGENHARIA',
  'LTDA',
].join('\n');
var r205 = extractLaudoFields(apto205, '27:11:2016.pdf');
eq(r205.appraisalDate, '2026-06-01', 'APTO 205 data da vistoria, não do nome do arquivo');
eq(r205.appraiser, 'GUALTER VIEIRA FIGUEIREDO', 'APTO 205 responsável');
eq(r205.engineeringValue, 201000, 'APTO 205 valor');
eq(r205.valuePerM2, 5978.58, 'APTO 205 m²');
eq(r205.garantiaCaixa, 'apta', 'APTO 205 garantia favorável');

var fromName = extractLaudoFields('', '27:11:2016.pdf');
var daniel = [
  'R DOUTOR LOPES DA CRUZ, 136, Unidade 101.',
  'VistoriaData da VistoriaUso da UnidadeOcupaçãoPosição FísicaAndar',
  '13/10/2026ResidencialDesocupadoLateral1',
  'Sim, Somos Favoráveis à Aceitação do Imóvel Como Garantia',
  '31,985.003,13R$ 160.000,00',
  'Área (m²)R$/m²Valor Produto (R$)',
  '160.000,00 (CENTO E SESSENTA MIL REAIS)Valor de Avaliação R$',
  'Valor unitário = -2818,443494 +144330,1849 / Area privativa',
  'Formação',
  'DANIEL LUIZ COSTA E SILVA',
  'CPF/MatrículaResponsável Técnico',
].join('\n');
var rDaniel = extractLaudoFields(daniel, 'laudo.pdf');
eq(rDaniel.appraisalDate, '2026-10-13', 'laudo Daniel data');
eq(rDaniel.appraiser, 'DANIEL LUIZ COSTA E SILVA', 'laudo Daniel responsável');
eq(rDaniel.engineeringValue, 160000, 'laudo Daniel valor');
eq(rDaniel.valuePerM2, 5003.13, 'laudo Daniel m², não o -2818 da fórmula');
eq(rDaniel.garantiaCaixa, 'apta', 'laudo Daniel garantia');
eq(rDaniel.unitHint, '101', 'laudo Daniel unidade no PDF');

var igor = [
  'R DOUTOR LOPES DA CRUZ, 136, Unidade 106.',
  '13/10/2026ResidencialDesocupadoFundos/Canto1',
  'Sim, Somos Favoráveis à Aceitação do Imóvel Como Garantia',
  'Não atendeu aos seguintes Requisitos Gerais:',
  '31,986.347,72R$ 203.000,00',
  '203.000,00 (DUZENTOS E TRÊS MIL REAIS)Valor de Avaliação R$',
  'Valor unitário = +26171,89738 +144330 / Area privativa',
  'Formação',
  'IGOR MIRANDA DO REGO BARROS',
  'CPF/MatrículaResponsável Técnico',
].join('\n');
var rIgor = extractLaudoFields(igor, 'laudo2.pdf');
eq(rIgor.appraisalDate, '2026-10-13', 'laudo Igor data');
eq(rIgor.appraiser, 'IGOR MIRANDA DO REGO BARROS', 'laudo Igor responsável');
eq(rIgor.engineeringValue, 203000, 'laudo Igor valor');
eq(rIgor.valuePerM2, 6347.72, 'laudo Igor m², não o +26171 da fórmula');
eq(rIgor.garantiaCaixa, 'apta', 'laudo Igor é apto mesmo com “Não atendeu aos seguintes” vazio');
eq(rIgor.unitHint, '106', 'laudo Igor unidade 106');
eq(unitHintMatches('101', 'APTO 106'), false, 'PDF da 101 não vale na ficha 106');
eq(unitHintMatches('106', 'APTO 106'), true, 'PDF da 106 vale na ficha 106');
eq(unitHintMatches('', 'APTO 106'), true, 'sem unidade no PDF não bloqueia');
eq(unitHintMatches('1', 'casa 01'), true, 'casa 01 aceita Unidade 1');

eq(fromName.appraisalDate, '', 'PDF vazio não inventa data pelo nome do arquivo');
eq(dateFromDocName('27-11-2016.pdf'), '2016-11-27', 'dateFromDocName hífen');
eq(isPersonName('Representante Legal'), false, 'isPersonName rejeita cargo');
eq(isPersonName('LUIZ FERNANDO GOMES SOUTINHO'), true, 'isPersonName aceita avaliador');

eq(nextDocFileName('laudo', []), 'laudo.pdf', 'primeiro laudo');
eq(nextDocFileName('laudo', ['27:11:2016.pdf', 'laudo.pdf']), 'laudo2.pdf', 'revalidação vira laudo2');
eq(nextDocFileName('laudo', ['27:11:2016.pdf']), 'laudo.pdf', 'nome antigo não conta como laudo1');
eq(nextDocFileName('laudo', ['Laudo_101.pdf']), 'laudo.pdf', 'Laudo_101 não vira revisão 101');

async function testRealPdf() {
  var p = '/tmp/bfm-laudo/laudo.pdf';
  if (!fs.existsSync(p)) {
    console.log('skip PDF real (arquivo local ausente)');
    return;
  }
  var ex = await extractLaudoFromPdf(fs.readFileSync(p), '27:11:2016.pdf');
  eq(ex.appraisalDate, '2026-06-01', 'PDF real APTO 205 data');
  eq(ex.appraiser, 'GUALTER VIEIRA FIGUEIREDO', 'PDF real APTO 205 responsável');
  eq(ex.engineeringValue, 201000, 'PDF real APTO 205 valor');
  eq(ex.valuePerM2, 5978.58, 'PDF real APTO 205 m²');
  eq(ex.garantiaCaixa, 'apta', 'PDF real APTO 205 garantia');
  eq(ex.unitHint, '205', 'PDF real APTO 205 unidade');
  var p106 = '/tmp/bfm-laudos/apto106.pdf';
  if (fs.existsSync(p106)) {
    var ex106 = await extractLaudoFromPdf(fs.readFileSync(p106), 'laudo.pdf');
    eq(ex106.appraisalDate, '2026-10-13', 'PDF real 106/101 data');
    eq(ex106.appraiser, 'DANIEL LUIZ COSTA E SILVA', 'PDF real 106/101 responsável');
    eq(ex106.engineeringValue, 160000, 'PDF real 106/101 valor');
    eq(ex106.valuePerM2, 5003.13, 'PDF real 106/101 m²');
    eq(ex106.garantiaCaixa, 'apta', 'PDF real 106/101 garantia');
    eq(ex106.unitHint, '101', 'PDF real 106/101 é Unidade 101');
  }
  var p106b = '/tmp/bfm-laudos/apto106-laudo2.pdf';
  if (fs.existsSync(p106b)) {
    var exIgor = await extractLaudoFromPdf(fs.readFileSync(p106b), 'laudo2.pdf');
    eq(exIgor.appraisalDate, '2026-10-13', 'PDF real laudo2 data');
    eq(exIgor.appraiser, 'IGOR MIRANDA DO REGO BARROS', 'PDF real laudo2 responsável');
    eq(exIgor.engineeringValue, 203000, 'PDF real laudo2 valor');
    eq(exIgor.valuePerM2, 6347.72, 'PDF real laudo2 m²');
    eq(exIgor.garantiaCaixa, 'apta', 'PDF real laudo2 garantia');
    eq(exIgor.unitHint, '106', 'PDF real laudo2 unidade 106');
  }
}

testRealPdf().then(function() {
  if (failed) {
    console.error('\n' + failed + ' falha(s)');
    process.exit(1);
  }
  console.log('\ntodos os testes ok');
}).catch(function(err) {
  console.error(err);
  process.exit(1);
});
