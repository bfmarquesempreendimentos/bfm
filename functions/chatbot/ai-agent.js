const Anthropic = require('@anthropic-ai/sdk');
const { sendTextMessage, sendImageMessage, sendInteractiveButtons } = require('./whatsapp-api');
const { getPropertyById, filterProperties, formatPropertyShort, formatPropertyFull, getPropertiesSummaryForAI, properties } = require('./property-data');
const { simulateFinancing, formatSimulationResult } = require('./finance-simulator');
const { getOrCreateLead, saveMessage, getConversationHistory, qualifyLead, addInterestedProperty, scheduleVisit, updateLead } = require('./lead-manager');

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const SYSTEM_PROMPT = `Você é o assistente virtual de vendas da *B F Marques Empreendimentos*, uma construtora com 15 anos de experiência no Rio de Janeiro. Seu nome é *Bia*.

## SUA MISSÃO
Converter leads em vendas de imóveis. Seja amigável, profissional e persuasiva. Crie urgência sem ser agressiva. Sempre busque qualificar o lead coletando nome, renda e interesse.

## DADOS DA EMPRESA
- Nome: B F Marques Empreendimentos
- Gerente de Vendas: Davi
- WhatsApp do Davi: (21) 99759-0814
- Email: bfmarquesempreendimentos@gmail.com
- Região de atuação: São Gonçalo, Itaboraí e Maricá (RJ)
- Experiência: 15 anos construindo com qualidade
- Site: www.bfmarquesempreendimentos.com.br

## NOSSOS EMPREENDIMENTOS
${getPropertiesSummaryForAI()}

## PROGRAMA MCMV
- Faixa 1: Renda até R$ 2.640 → Subsídio até R$ 55.000
- Faixa 2: Renda entre R$ 2.640,01 e R$ 4.400 → Subsídio até R$ 55.000
- Faixa 3: Renda entre R$ 4.400,01 e R$ 8.000 → Sem subsídio, taxas reduzidas
- Taxa de juros: 4,25% a 7,66% a.a. conforme faixa
- Prazo: até 360 meses (30 anos)
- Parcela não pode ultrapassar 30% da renda familiar
- 7 dos 8 empreendimentos aceitam MCMV (exceto Casa Luxo Maricá)
- Documentação grátis: ITBI e Registro (condição especial)

## REGRAS DE COMPORTAMENTO
1. Sempre responda em português do Brasil, de forma amigável e acolhedora
2. Use emojis com moderação para tornar a conversa agradável
3. Quando o cliente perguntar sobre imóveis, use a ferramenta listar_imoveis
4. Quando pedir detalhes de um imóvel específico, use detalhes_imovel
5. Para simulação de financiamento, use simular_financiamento (peça renda e valor antes)
6. Quando o cliente fornecer nome, renda ou CPF, use salvar_dados_lead
7. Quando quiser agendar visita, use agendar_visita
8. Se o cliente pedir para falar com humano ou parecer insatisfeito, use encaminhar_humano
9. Sempre tente coletar pelo menos o nome do cliente no início da conversa
10. Crie senso de urgência: "Unidades limitadas", "Condição especial por tempo limitado"
11. Destaque benefícios do MCMV quando aplicável: subsídio, ITBI grátis, entrada facilitada
12. Não invente informações. Se não souber, diga que vai verificar com o Davi
13. Mantenha respostas concisas (máximo 3-4 parágrafos no WhatsApp)
14. Quando der detalhes do imóvel, pergunte se quer ver fotos
15. Ao final de qualquer interação significativa, sugira agendar uma visita`;

const TOOLS = [
  {
    name: 'listar_imoveis',
    description: 'Lista os imóveis disponíveis. Use para mostrar opções ao cliente.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', description: 'Filtro por tipo: apartamento, casa, ou vazio para todos', enum: ['apartamento', 'casa', ''] },
        preco_maximo: { type: 'number', description: 'Preço máximo desejado pelo cliente' },
        apenas_mcmv: { type: 'boolean', description: 'Filtrar apenas imóveis que aceitam MCMV' },
      },
      required: [],
    },
  },
  {
    name: 'detalhes_imovel',
    description: 'Retorna detalhes completos de um imóvel específico e envia foto.',
    input_schema: {
      type: 'object',
      properties: {
        imovel_id: { type: 'number', description: 'ID do imóvel (1 a 8)' },
      },
      required: ['imovel_id'],
    },
  },
  {
    name: 'simular_financiamento',
    description: 'Simula financiamento MCMV. Use quando o cliente informar renda e valor do imóvel.',
    input_schema: {
      type: 'object',
      properties: {
        renda_mensal: { type: 'number', description: 'Renda familiar mensal em reais' },
        valor_imovel: { type: 'number', description: 'Valor do imóvel em reais' },
      },
      required: ['renda_mensal', 'valor_imovel'],
    },
  },
  {
    name: 'salvar_dados_lead',
    description: 'Salva dados de qualificação do lead (nome, renda, CPF, email).',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do cliente' },
        renda: { type: 'number', description: 'Renda mensal informada' },
        cpf: { type: 'string', description: 'CPF do cliente' },
        email: { type: 'string', description: 'Email do cliente' },
      },
      required: [],
    },
  },
  {
    name: 'agendar_visita',
    description: 'Agenda uma visita ao empreendimento.',
    input_schema: {
      type: 'object',
      properties: {
        imovel_id: { type: 'number', description: 'ID do empreendimento' },
        data_sugerida: { type: 'string', description: 'Data e horário sugeridos pelo cliente' },
        observacoes: { type: 'string', description: 'Observações adicionais' },
      },
      required: ['imovel_id', 'data_sugerida'],
    },
  },
  {
    name: 'encaminhar_humano',
    description: 'Encaminha a conversa para o Davi (gerente de vendas). Use quando o cliente pedir ou quando a situação exigir atendimento humano.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo do encaminhamento' },
      },
      required: ['motivo'],
    },
  },
  {
    name: 'enviar_foto_imovel',
    description: 'Envia a foto principal do imóvel para o cliente.',
    input_schema: {
      type: 'object',
      properties: {
        imovel_id: { type: 'number', description: 'ID do imóvel' },
      },
      required: ['imovel_id'],
    },
  },
];

async function executeTool(toolName, input, context) {
  switch (toolName) {
    case 'listar_imoveis': {
      const filters = {};
      if (input.tipo) filters.type = input.tipo;
      if (input.preco_maximo) filters.maxPrice = input.preco_maximo;
      if (input.apenas_mcmv) filters.mcmv = true;
      const results = filterProperties(filters);
      if (results.length === 0) return 'Nenhum imóvel encontrado com esses critérios.';
      return results.map(formatPropertyShort).join('\n\n');
    }

    case 'detalhes_imovel': {
      const property = getPropertyById(input.imovel_id);
      if (!property) return 'Imóvel não encontrado.';
      await addInterestedProperty(context.from, property.id);
      return formatPropertyFull(property);
    }

    case 'simular_financiamento': {
      const result = simulateFinancing(input.renda_mensal, input.valor_imovel);
      if (input.renda_mensal) {
        await qualifyLead(context.from, { income: input.renda_mensal });
      }
      return formatSimulationResult(result);
    }

    case 'salvar_dados_lead': {
      await qualifyLead(context.from, {
        name: input.nome,
        income: input.renda,
        cpf: input.cpf,
        email: input.email,
      });
      return 'Dados do cliente salvos com sucesso.';
    }

    case 'agendar_visita': {
      const property = getPropertyById(input.imovel_id);
      if (!property) return 'Imóvel não encontrado para agendamento.';
      await scheduleVisit(context.from, input.imovel_id, input.data_sugerida, input.observacoes || '');
      await notifyManager(context.from, property.title, input.data_sugerida, null, { phoneNumberId: context.phoneNumberId });
      return `Visita agendada para ${property.title} em ${input.data_sugerida}. O Davi será notificado e confirmará o horário.`;
    }

    case 'encaminhar_humano': {
      await updateLead(context.from, { status: 'encaminhado', notes: `Encaminhado: ${input.motivo}` });
      await notifyManager(context.from, null, null, input.motivo, { phoneNumberId: context.phoneNumberId });
      return `Conversa encaminhada para o Davi. Motivo: ${input.motivo}`;
    }

    case 'enviar_foto_imovel': {
      const property = getPropertyById(input.imovel_id);
      if (!property || !property.image) return 'Foto não disponível.';
      await sendImageMessage(context.from, property.image, `📸 ${property.title}`, { phoneNumberId: context.phoneNumberId });
      return `Foto de ${property.title} enviada.`;
    }

    default:
      return 'Ferramenta não reconhecida.';
  }
}

async function notifyManager(leadPhone, propertyTitle, visitDate, reason, waOptions = {}) {
  const managerNumber = '5521997590814';
  let msg = '🔔 *Notificação do Chatbot*\n\n';
  msg += `📱 Lead: ${leadPhone}\n`;

  if (visitDate) {
    msg += `🏠 Imóvel: ${propertyTitle}\n`;
    msg += `📅 Visita: ${visitDate}\n`;
    msg += '\nPor favor, confirme o horário com o cliente.';
  } else if (reason) {
    msg += `📝 Motivo: ${reason}\n`;
    msg += '\nO cliente pediu atendimento humano.';
  }

  try {
    await sendTextMessage(managerNumber, msg, waOptions);
  } catch (err) {
    console.error('Erro ao notificar gerente:', err.message);
  }
}

async function handleIncomingMessage(messageData) {
  const { from, profileName, text } = messageData;

  const lead = await getOrCreateLead(from, profileName);
  await saveMessage(from, 'user', text);

  const history = await getConversationHistory(from, 20);
  const messages = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  if (messages.length === 0 || (messages.length === 1 && messages[0].role === 'user')) {
    messages.length = 0;
    messages.push({ role: 'user', content: text });
  }

  if (messages.length > 0 && messages[messages.length - 1].role === 'user' &&
      messages[messages.length - 1].content !== text) {
    messages.push({ role: 'user', content: text });
  }

  const dedupedMessages = [];
  for (const m of messages) {
    if (dedupedMessages.length === 0 || dedupedMessages[dedupedMessages.length - 1].role !== m.role) {
      dedupedMessages.push(m);
    } else {
      dedupedMessages[dedupedMessages.length - 1].content += '\n' + m.content;
    }
  }

  if (dedupedMessages.length === 0) {
    dedupedMessages.push({ role: 'user', content: text });
  }
  if (dedupedMessages[0].role !== 'user') {
    dedupedMessages.unshift({ role: 'user', content: text });
  }

  const client = getClient();

  let response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT + `\n\nDados do lead atual: Nome: ${lead.name || 'Desconhecido'}, Status: ${lead.status}, Imóveis de interesse: ${(lead.interestedProperties || []).join(', ') || 'Nenhum ainda'}`,
    tools: TOOLS,
    messages: dedupedMessages,
  });

  let finalText = '';
  let iterations = 0;
  const maxIterations = 5;

  while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
    iterations++;
    const toolBlocks = response.content.filter(b => b.type === 'tool_use');
    const textBlocks = response.content.filter(b => b.type === 'text');

    if (textBlocks.length > 0) {
      finalText += textBlocks.map(b => b.text).join('');
    }

    const toolResults = [];
    for (const tool of toolBlocks) {
      const result = await executeTool(tool.name, tool.input, { from, phoneNumberId: messageData.phoneNumberId });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tool.id,
        content: result,
      });
    }

    dedupedMessages.push({ role: 'assistant', content: response.content });
    dedupedMessages.push({ role: 'user', content: toolResults });

    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: dedupedMessages,
    });
  }

  const responseTextBlocks = response.content.filter(b => b.type === 'text');
  if (responseTextBlocks.length > 0) {
    finalText += responseTextBlocks.map(b => b.text).join('');
  }

  if (!finalText.trim()) {
    finalText = 'Olá! Sou a Bia, assistente virtual da B F Marques. Como posso te ajudar hoje? 😊';
  }

  console.log(`Resposta do Claude para ${from} (${finalText.length} chars): "${finalText.substring(0, 200)}..."`);

  await saveMessage(from, 'assistant', finalText);

  const waOpts = { phoneNumberId: messageData.phoneNumberId };
  try {
    await sendTextMessage(from, finalText, waOpts);
    console.log(`Mensagem enviada com sucesso para ${from} (phoneNumberId=${waOpts.phoneNumberId || 'env'})`);
  } catch (sendErr) {
    console.error(`ERRO ao enviar mensagem para ${from}:`, JSON.stringify(sendErr.response?.data || sendErr.message));
    throw sendErr;
  }
}

module.exports = { handleIncomingMessage };
