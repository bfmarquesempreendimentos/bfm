'use strict';

var { extractContractFields, extractContractNumber, namesMatch, digitsOnly } = require('./contract-extract');

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

var sample = [
  'CONTRATO HABITACIONAL CAIXA',
  'Contrato nº 8.4444.4487508-6',
  'Proponente: FABRICIO DA SILVA SANTOS',
  'CPF 123.456.789-09',
  'Endereço do imóvel: Rua Lopes da Cruz, 136',
  'Unidade 106',
  'Valor de compra e venda R$ 188.000,00',
].join('\n');

eq(extractContractNumber(sample), '8.4444.4487508-6', 'número no formato Caixa');
var f = extractContractFields(sample, 'minuta.pdf');
eq(f.buyerCpf, '12345678909', 'CPF do comprador');
eq(!!f.buyerName && f.buyerName.indexOf('FABRICIO') >= 0, true, 'nome do proponente');
eq(f.saleValue, 188000, 'valor de compra e venda');
eq(f.unitHint, '106', 'unidade');
eq(namesMatch('Fabricio da Silva Santos', 'FABRICIO DA SILVA SANTOS'), true, 'nome bate');
eq(namesMatch('Fabricio da Silva Santos', 'Joao Pereira'), false, 'nome diferente');
eq(digitsOnly('8.4444.4487508-6'), '8444444875086', 'dígitos do contrato');

if (failed) {
  console.error(failed + ' falha(s)');
  process.exit(1);
}
console.log('contract-extract ok');
