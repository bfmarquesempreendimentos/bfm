'use strict';

var { documentIdentityError, unitFromFileName, uniqueMarkers, allSeedProperties, seedPropertyById } = require('./property-identity');
var { extractLaudoFields } = require('./laudo-extract');

var failed = 0;
function eq(actual, expected, msg) {
  var ok = actual === expected;
  if (!ok) {
    failed += 1;
    console.error('FAIL', msg, { actual: expected === true || expected === false ? actual : actual, expected: expected });
  } else {
    console.log('ok', msg);
  }
}
function ok(cond, msg) {
  eq(!!cond, true, msg);
}

var all = allSeedProperties();
var jussara = seedPropertyById(4);
var apolo = seedPropertyById(5);
var bandeirantes = seedPropertyById(3);
var coelho = seedPropertyById(6);

eq(unitFromFileName('CERTIDÃO CASA 06 JUSSARA .pdf'), '6', 'filename casa 06');
eq(unitFromFileName('Cs_4.pdf'), '4', 'filename Cs_4');
eq(unitFromFileName('laudo.pdf'), '', 'laudo.pdf sem unidade no nome');

ok(uniqueMarkers(jussara, all).indexOf('jussara') >= 0, 'Jussara tem marcador único');
ok(uniqueMarkers(apolo, all).indexOf('apolo') >= 0, 'Apolo tem marcador único');

var apoloTxt = 'R MARIA JOSE DE ARRUDA BARBOSA, 270, Unidade 03. ITABORAI Municipio do Imovel APOLO II';
var rApolo = extractLaudoFields(apoloTxt, 'laudo.pdf');
ok(documentIdentityError({
  extracted: rApolo,
  property: jussara,
  unitCode: 'CS 03',
  fileName: 'laudo.pdf',
  allProperties: all,
  kind: 'laudo',
}), 'laudo Apolo recusado na Jussara');
eq(documentIdentityError({
  extracted: rApolo,
  property: apolo,
  unitCode: 'CS 03',
  fileName: 'laudo.pdf',
  allProperties: all,
  kind: 'laudo',
}), '', 'laudo Apolo aceito no Apolo');

ok(documentIdentityError({
  extracted: { unitHint: '', identityHaystack: '' },
  property: apolo,
  unitCode: 'CS 03',
  fileName: 'CERTIDAO CASA 06 JUSSARA.pdf',
  allProperties: all,
  kind: 'rgi',
}), 'RGI da Jussara recusado no Apolo (nome + unidade)');

eq(documentIdentityError({
  extracted: { unitHint: '', identityHaystack: 'CARTÓRIO 3º OFÍCIO DE SÃO GONÇALO CERTIDÃO' },
  property: jussara,
  unitCode: 'CS 06',
  fileName: 'CERTIDAO CASA 06 JUSSARA.pdf',
  allProperties: all,
  kind: 'rgi',
}), '', 'RGI da Jussara aceito na CS 06 Jussara');

var igor = extractLaudoFields('R DOUTOR LOPES DA CRUZ, 136, Unidade 106.', 'laudo2.pdf');
eq(documentIdentityError({
  extracted: igor,
  property: bandeirantes,
  unitCode: 'APTO 106',
  fileName: 'laudo2.pdf',
  allProperties: all,
  kind: 'laudo',
}), '', 'laudo 136 aceito no Bandeirantes');
ok(documentIdentityError({
  extracted: igor,
  property: coelho,
  unitCode: 'APTO 106',
  fileName: 'laudo2.pdf',
  allProperties: all,
  kind: 'laudo',
}), 'laudo 136 recusado no Coelho 122');

if (failed) {
  console.error('\n' + failed + ' falha(s)');
  process.exit(1);
}
console.log('\ntodos os testes de identidade ok');
