/**
 * Simulação educativa MCMV — valores de faixa conforme ampliação divulgada em 2026
 * (tetos de renda urbana até R$ 3.200 / 5.000 / 9.600 / 13.000).
 * Subsídios e taxas efetivas variam por contratação; confirme sempre com Caixa / tabela oficial.
 */
function simulateFinancing(monthlyIncome, propertyValue) {
  const maxSubsidy = 55000;
  let subsidy = 0;
  let faixa = '';

  if (monthlyIncome <= 3200) {
    subsidy = maxSubsidy;
    faixa = 'Faixa 1';
  } else if (monthlyIncome <= 5000) {
    subsidy = maxSubsidy;
    faixa = 'Faixa 2';
  } else if (monthlyIncome <= 9600) {
    subsidy = 0;
    faixa = 'Faixa 3';
  } else if (monthlyIncome <= 13000) {
    subsidy = 0;
    faixa = 'Faixa 4';
  } else {
    subsidy = 0;
    faixa = 'Acima do teto MCMV (2026)';
  }

  var annualRate = 9.0;
  if (faixa === 'Faixa 1') annualRate = 4.25;
  else if (faixa === 'Faixa 2') annualRate = 6.5;
  else if (faixa === 'Faixa 3') annualRate = 7.66;
  else if (faixa === 'Faixa 4') annualRate = 8.16;

  const financedAmount = Math.max(0, propertyValue - subsidy);
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
  const termMonths = 360;

  const amortization = financedAmount / termMonths;
  const firstPayment = amortization + (financedAmount * monthlyRate);
  const lastPayment = amortization + (amortization * monthlyRate);
  const avgPayment = (firstPayment + lastPayment) / 2;

  const maxPayment = monthlyIncome * 0.30;
  const approved = avgPayment <= maxPayment;

  const downPayment = Math.max(0, propertyValue * 0.05);

  return {
    approved,
    faixa,
    subsidy,
    financedAmount,
    annualRate,
    termMonths,
    firstPayment,
    lastPayment,
    avgPayment,
    maxPayment,
    downPayment,
    monthlyIncome,
    propertyValue,
  };
}

function formatSimulationResult(result) {
  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  let text = result.approved
    ? '✅ *Simulação aprovada!*\n\n'
    : '⚠️ *Simulação precisa de ajustes*\n\n';

  text += `ℹ️ *Simulação com renda bruta familiar mensal* (total da família, antes de descontos). Números orientativos; crédito e condições finais são da Caixa / banco.\n\n`;
  text += `📊 *Resultado da Simulação MCMV*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🏷️ *Faixa:* ${result.faixa}\n`;
  text += `🏠 *Valor do Imóvel:* ${fmt(result.propertyValue)}\n`;
  text += `🎁 *Subsídio MCMV:* ${fmt(result.subsidy)}\n`;
  text += `💰 *Valor Financiado:* ${fmt(result.financedAmount)}\n`;
  text += `📅 *Prazo:* ${result.termMonths} meses (30 anos)\n`;
  text += `📈 *Taxa de Juros:* ${result.annualRate}% a.a.\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💵 *1ª Parcela:* ${fmt(result.firstPayment)}\n`;
  text += `💵 *Parcela Média:* ${fmt(result.avgPayment)}\n`;
  text += `💵 *Última Parcela:* ${fmt(result.lastPayment)}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `👤 *Renda bruta familiar informada:* ${fmt(result.monthlyIncome)}\n`;
  text += `📊 *30% da Renda:* ${fmt(result.maxPayment)}\n`;

  if (!result.approved) {
    text += `\n⚠️ A parcela média excede 30% da sua renda. Considere:\n`;
    text += `• Escolher um imóvel de menor valor\n`;
    text += `• Compor renda com cônjuge ou familiar\n`;
    text += `• Usar o FGTS para reduzir o valor financiado`;
  }

  return text;
}

module.exports = { simulateFinancing, formatSimulationResult };
