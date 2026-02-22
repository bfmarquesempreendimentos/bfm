function simulateFinancing(monthlyIncome, propertyValue) {
  const maxSubsidy = 55000;
  let subsidy = 0;
  let faixa = '';

  if (monthlyIncome <= 2640) {
    subsidy = maxSubsidy;
    faixa = 'Faixa 1';
  } else if (monthlyIncome <= 4400) {
    subsidy = maxSubsidy;
    faixa = 'Faixa 2';
  } else if (monthlyIncome <= 8000) {
    subsidy = 0;
    faixa = 'Faixa 3';
  } else {
    subsidy = 0;
    faixa = 'Acima das faixas MCMV';
  }

  const financedAmount = Math.max(0, propertyValue - subsidy);
  const annualRate = faixa === 'Faixa 1' ? 4.25 : faixa === 'Faixa 2' ? 6.5 : 7.66;
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
  text += `👤 *Sua Renda:* ${fmt(result.monthlyIncome)}\n`;
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
