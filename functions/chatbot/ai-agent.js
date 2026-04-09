const Anthropic = require('@anthropic-ai/sdk');
const { sendTextMessage, sendImageMessage, sendVideoMessage, sendInteractiveButtons, getWhatsAppMediaBuffer } = require('./whatsapp-api');
const { transcribeAudioBuffer } = require('./audio-transcription');
const { getPropertyById, getPropertyMediaLists, filterProperties, formatPropertyShort, formatPropertyFull, getPropertiesSummaryForAI, properties } = require('./property-data');
const { simulateFinancing, formatSimulationResult } = require('./finance-simulator');
const { getOrCreateLead, saveMessage, getConversationHistory, qualifyLead, addInterestedProperty, scheduleVisit, updateLead, incrementAdminUnread, inferCategoryFromMotivo, normalizeWhatsAppPhone, recordInboundActivity, getLeadByPhone } = require('./lead-manager');

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const SYSTEM_PROMPT = `Você é o assistente virtual de vendas da *B F Marques Empreendimentos*, uma construtora com 15 anos de experiência no Rio de Janeiro. Seu nome é *Bia*.

## SUA MISSÃO
Ajudar famílias a *sair do aluguel* e conquistar *casa própria* com *Minha Casa Minha Vida*, com tom acolhedor e *direto*: crédito habitacional e simulação gratuita rápida. Conecte sempre com a vida real — menos gasto com aluguel, mais segurança, oportunidade na região (mencione *São Gonçalo* e cidades onde temos obra quando fizer sentido). Seu público é *baixa e média renda*; 7 dos 8 empreendimentos são MCMV (exceto Casa Luxo Maricá). Foque em Faixa 1 e 2, sem esquecer 3 e 4 quando o cliente se enquadrar nas novas regras de 2026.

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

## PÚBLICO-ALVO, MCMV E RENDA (2026)
- Sempre que for qualificar ou simular, peça explicitamente a *renda bruta familiar mensal* — soma do que a família ganha *antes* de descontos (salários, informal fixo que declarar, benefícios que entram na conta, etc.). Se o cliente só souber líquido, diga que o ideal para o programa é o *bruto familiar* e que o time humano pode ajudar a conferir.
- Tetos de renda *urbanos* usados na simulação do sistema (ampliação divulgada em 2026): Faixa 1 até *R$ 3.200*; Faixa 2 até *R$ 5.000*; Faixa 3 até *R$ 9.600*; Faixa 4 até *R$ 13.000*. Tetos de valor de imóvel (referência geral): Faixas 3 e 4 chegam a até *R$ 400 mil* e *R$ 600 mil* conforme programa — não invente valores de unidade; use listar_imoveis / detalhes_imovel.
- Faixa 1 e 2: subsídio *até* R$ 55.000 na simulação (confirmar na contratação). Taxas no simulador: Faixa 1 ~4,25% a.a.; Faixa 2 ~6,5%; Faixas 3 e 4 estimativas maiores — resultado traz o número calculado.
- Prazo: até 360 meses. Parcela referência até 30% da renda bruta.
- Exceto Casa Luxo Maricá (id 8), os demais empreendimentos são perfil MCMV.
- Documentação grátis: ITBI e Registro (condição especial da empresa, quando aplicável).

## REGRAS DE COMPORTAMENTO
1. Sempre responda em português do Brasil, de forma amigável e acolhedora
2. Use emojis com moderação para tornar a conversa agradável
3. Quando o cliente perguntar sobre imóveis, use listar_imoveis – priorize MCMV (IDs 1 a 7); cite Casa Luxo Maricá (id 8) só se pedir alto padrão
4. Quando pedir detalhes de um imóvel específico, use detalhes_imovel
5. Simulação *gratuita e rápida*: assim que tiver nome (ou uso contexto), peça a *renda bruta familiar mensal* e o *valor aproximado do imóvel* e use simular_financiamento. Frase-tipo: “Me passa a renda bruta da família e um valor de imóvel que você imagina que eu te mostro na hora uma simulação gratuita.”
6. Quando o cliente fornecer nome, renda bruta familiar ou CPF, use salvar_dados_lead
7. Quando quiser agendar visita, use agendar_visita (isso encaminha para humano automaticamente)
8. Quando o cliente enviar documentos para análise (PDF, imagem de CPF, RG, comprovante etc.) ou disser que vai enviar, use encaminhar_humano com motivo "Documentos para análise"
9. Se o cliente pedir para falar com humano ou parecer insatisfeito, use encaminhar_humano
10. No início: (1) nome, (2) *renda bruta familiar mensal*, (3) região ou imóvel de interesse — depois ofereça simulação ou opções com listar_imoveis
11. Crie senso de urgência: "Unidades limitadas", "Condição especial por tempo limitado"
12. Destaque benefícios do MCMV quando aplicável: subsídio, ITBI grátis, entrada facilitada
13. Não invente informações. Se não souber, diga que vai verificar com o Davi
14. Respostas concisas (máximo 3–4 parágrafos), sempre com foco em *aprovação de crédito* e próximo passo claro
15. Pedido de *fotos, imagens ou vídeos* do empreendimento: use *enviar_midias_imovel* na hora — envia até *3 fotos* e *1 vídeo* (se houver na pasta do imóvel). Se o cliente pedir *mais*, chame de novo com *enviar_mais: true*. *Não* use encaminhar_humano só por isso; a conversa segue com você
16. Ao final de qualquer interação significativa, sugira agendar uma visita
17. Documentos enviados ou visita solicitada SEMPRE exigem atendimento humano – use encaminhar_humano
18. Não diga apenas “renda”; diga *renda bruta familiar* para alinhar com o programa e evitar retrabalho na análise
19. *Nunca* encaminhe ao humano apenas porque o cliente pediu material visual do imóvel — isso é papel da ferramenta enviar_midias_imovel
20. Depois de *enviar_midias_imovel*, sua resposta em texto deve ser *curta* (ofereça simulação ou visita) — não repita o mesmo resumo que a ferramenta já deu ao cliente
21. Quando o cliente mandar *áudio*, a conversa pode trazer o texto *já transcrito* — responda ao conteúdo como se fosse mensagem escrita, em português natural`;

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
    description: 'Retorna detalhes completos de um imóvel específico (texto). Para enviar fotos/vídeos use enviar_midias_imovel.',
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
    description: 'Simula financiamento MCMV. Use quando o cliente informar renda BRUTA FAMILIAR mensal total e valor do imóvel (ou estimativa).',
    input_schema: {
      type: 'object',
      properties: {
        renda_mensal: { type: 'number', description: 'Renda bruta familiar mensal total em reais (antes de descontos)' },
        valor_imovel: { type: 'number', description: 'Valor do imóvel em reais' },
      },
      required: ['renda_mensal', 'valor_imovel'],
    },
  },
  {
    name: 'salvar_dados_lead',
    description: 'Salva dados de qualificação do lead (nome, renda bruta familiar mensal, CPF, email).',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do cliente' },
        renda: { type: 'number', description: 'Renda bruta familiar mensal informada' },
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
    description: 'Encaminha a conversa para atendimento humano. Use OBRIGATORIAMENTE quando: cliente pedir humano; enviar ou anunciar envio de documentos para análise; solicitar visita ao empreendimento; parecer insatisfeito. NÃO use só porque pediram fotos ou tour em vídeo — use enviar_midias_imovel.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo do encaminhamento' },
      },
      required: ['motivo'],
    },
  },
  {
    name: 'enviar_midias_imovel',
    description: 'Envia fotos e vídeo (se existir) do imóvel pelo WhatsApp. Primeira vez: use enviar_mais false. Se o cliente pedir mais fotos/ângulos, use enviar_mais true.',
    input_schema: {
      type: 'object',
      properties: {
        imovel_id: { type: 'number', description: 'ID do imóvel (1 a 8)' },
        enviar_mais: { type: 'boolean', description: 'True se o cliente já recebeu um lote e pediu mais mídias.' },
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
      const motivo = `Solicitou visita: ${property.title} em ${input.data_sugerida}`;
      const categoria = inferCategoryFromMotivo(motivo);
      await updateLead(context.from, {
        status: 'encaminhado',
        notes: motivo,
        modo_humano: true,
        categoria: categoria,
        encaminhadoMotivo: motivo,
        assumido_por: null,
        assumido_em: null,
        adminUnreadCount: 1,
        lastMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await notifyManager(context.from, property.title, input.data_sugerida, motivo, { phoneNumberId: context.phoneNumberId });
      return `Visita agendada para ${property.title} em ${input.data_sugerida}. Um atendente vai assumir nossa conversa agora para confirmar o horário com você – continue enviando mensagens aqui mesmo.`;
    }

    case 'encaminhar_humano': {
      const categoria = inferCategoryFromMotivo(input.motivo);
      await updateLead(context.from, {
        status: 'encaminhado',
        notes: `Encaminhado: ${input.motivo}`,
        modo_humano: true,
        categoria: categoria,
        encaminhadoMotivo: input.motivo,
        assumido_por: null,
        assumido_em: null,
        adminUnreadCount: 1,
        lastMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await notifyManager(context.from, null, null, input.motivo, { phoneNumberId: context.phoneNumberId });
      return `Pronto! Um atendente vai assumir nossa conversa em instantes. Enquanto isso, você pode continuar enviando mensagens aqui mesmo – não precisa ligar nem mudar de número.`;
    }

    case 'enviar_midias_imovel': {
      const property = getPropertyById(input.imovel_id);
      if (!property) return 'Imóvel não encontrado.';
      const lists = getPropertyMediaLists(property);
      const images = lists.images;
      const videos = lists.videos;
      if (images.length === 0 && videos.length === 0) return 'Não há fotos ou vídeos cadastrados para este imóvel.';

      const lead = await getLeadByPhone(context.from);
      var cur = lead && lead.mediaGalleryCursor;
      const pid = property.id;
      const mais = !!input.enviar_mais;
      if (!mais || !cur || cur.propertyId !== pid) {
        cur = { propertyId: pid, imageIdx: 0, videoIdx: 0 };
      }

      const maxImg = 3;
      const batchImages = images.slice(cur.imageIdx, cur.imageIdx + maxImg);
      var batchVideos = [];
      if (videos.length > 0 && cur.videoIdx < videos.length) {
        if (batchImages.length > 0) {
          batchVideos = videos.slice(cur.videoIdx, cur.videoIdx + 1);
        } else if (cur.imageIdx >= images.length) {
          batchVideos = videos.slice(cur.videoIdx, cur.videoIdx + 1);
        }
      }

      if (batchImages.length === 0 && batchVideos.length === 0) {
        return 'Já enviei todas as fotos e vídeos que temos deste imóvel. Se quiser, posso recomeçar do início — é só pedir "manda de novo as fotos".';
      }

      const waOpt = { phoneNumberId: context.phoneNumberId };
      var imgN = 0;
      var ii;
      for (ii = 0; ii < batchImages.length; ii++) {
        var cap = imgN === 0 ? `📸 ${property.title}` : '';
        await sendImageMessage(context.from, batchImages[ii], cap, waOpt);
        imgN++;
        await delay(650);
      }
      var jj;
      for (jj = 0; jj < batchVideos.length; jj++) {
        await sendVideoMessage(context.from, batchVideos[jj], `🎬 ${property.title}`, waOpt);
        await delay(900);
      }

      const newCursor = {
        propertyId: pid,
        imageIdx: cur.imageIdx + batchImages.length,
        videoIdx: cur.videoIdx + batchVideos.length,
      };
      await updateLead(context.from, { mediaGalleryCursor: newCursor });

      const summary = [];
      if (batchImages.length) summary.push(batchImages.length + ' foto(s)');
      if (batchVideos.length) summary.push('1 vídeo');
      const line = `Enviei ${summary.join(' e ')} de ${property.title}.`;
      await saveMessage(context.from, 'assistant', line, 'bot');
      await recordInboundActivity(context.from, line);

      var aindaTem = newCursor.imageIdx < images.length || newCursor.videoIdx < videos.length;
      return line + (aindaTem ? ' Se quiser mais, é só pedir.' : '');
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
  var fromRaw = messageData.from;
  var phone = normalizeWhatsAppPhone(fromRaw) || fromRaw;
  var profileName = messageData.profileName;
  var text = messageData.text;
  var type = messageData.type;
  var referral = messageData.referral;

  const lead = await getOrCreateLead(phone, profileName);
  var userContent;
  var userMsgMeta = {};
  if (type === 'audio' || type === 'video' || type === 'image' || type === 'document') {
    userMsgMeta = {
      attachmentType: type,
      mimeType: messageData.mimeType || '',
    };
    if (messageData.mediaId) {
      userMsgMeta.whatsappMediaId = String(messageData.mediaId);
    }
  }

  if (type === 'document' || type === 'image') {
    userContent = text || ('[' + type + ' enviado]') + (text ? ': ' + text : '');
  } else if (type === 'audio') {
    var captionAudio = (text && text.charAt(0) !== '[') ? text : '';
    userContent = null;
    if (messageData.mediaId) {
      try {
        const media = await getWhatsAppMediaBuffer(messageData.mediaId, {
          phoneNumberId: messageData.phoneNumberId,
        });
        var transcript = await transcribeAudioBuffer(media.buffer, media.mimeType);
        if (transcript) {
          userContent = transcript;
          if (captionAudio) {
            userContent = userContent + '\n[Legenda: ' + captionAudio + ']';
          }
        }
      } catch (err) {
        console.error('[Bia] áudio/transcrição:', err.response?.data || err.message);
      }
    }
    if (!userContent) {
      userContent = captionAudio || '🎤 Mensagem de áudio';
    }
  } else if (type === 'video') {
    userContent = (text && text.charAt(0) !== '[') ? text : '🎬 Vídeo';
  } else {
    userContent = text;
  }

  var textForAi = userContent;

  if (referral && typeof referral === 'object' && referral.source_type === 'ad') {
    await updateLead(phone, { ultimaOrigem: 'anuncio', updatedAt: new Date().toISOString() });
  }

  await saveMessage(phone, 'user', userContent, undefined, userMsgMeta);
  await recordInboundActivity(phone, userContent);

  if (lead.modo_humano) {
    await incrementAdminUnread(phone);
    return;
  }

  if (type === 'document' || type === 'image') {
    const motivo = type === 'document'
      ? 'Cliente enviou documento para análise'
      : 'Cliente enviou imagem (possível documento para análise)';
    const categoria = inferCategoryFromMotivo(motivo);
    await updateLead(phone, {
      status: 'encaminhado',
      notes: motivo,
      modo_humano: true,
      categoria: categoria,
      encaminhadoMotivo: motivo,
      assumido_por: null,
      assumido_em: null,
      adminUnreadCount: 1,
      lastMessageAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await notifyManager(phone, null, null, motivo, { phoneNumberId: messageData.phoneNumberId });
    var msg = 'Recebi seu ' + (type === 'document' ? 'documento' : 'arquivo') + '! Um atendente vai analisar e entrar em contato em instantes. Você pode continuar enviando mensagens aqui mesmo.';
    await saveMessage(phone, 'assistant', msg, 'bot');
    await sendTextMessage(phone, msg, { phoneNumberId: messageData.phoneNumberId });
    return;
  }

  const history = await getConversationHistory(phone, 20);
  const messages = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  if (messages.length === 0 || (messages.length === 1 && messages[0].role === 'user')) {
    messages.length = 0;
    messages.push({ role: 'user', content: textForAi });
  }

  if (messages.length > 0 && messages[messages.length - 1].role === 'user' &&
      messages[messages.length - 1].content !== textForAi) {
    messages.push({ role: 'user', content: textForAi });
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
    dedupedMessages.push({ role: 'user', content: textForAi });
  }
  if (dedupedMessages[0].role !== 'user') {
    dedupedMessages.unshift({ role: 'user', content: textForAi });
  }

  var client;
  try {
    client = getClient();
  } catch (e) {
    console.error('Anthropic client:', e.message);
    await handleAiFailure(phone, messageData, 'Configuração da IA ausente.');
    return;
  }

  try {
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
        const result = await executeTool(tool.name, tool.input, { from: phone, phoneNumberId: messageData.phoneNumberId });
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

    console.log('Resposta do Claude para ' + phone + ' (' + finalText.length + ' chars)');

    await saveMessage(phone, 'assistant', finalText, 'bot');
    await recordInboundActivity(phone, finalText);

    const waOpts = { phoneNumberId: messageData.phoneNumberId };
    await sendTextMessage(phone, finalText, waOpts);
    console.log('Mensagem enviada com sucesso para ' + phone);
  } catch (err) {
    console.error('Erro IA/envio para ' + phone + ':', err.response?.data || err.message);
    await handleAiFailure(phone, messageData, err.message);
  }
}

async function handleAiFailure(phone, messageData, detail) {
  var fallback = 'Olá! Recebemos sua mensagem. Nossa equipe responde em instantes por aqui — aguarde só um momento. 😊';
  try {
    await saveMessage(phone, 'assistant', fallback, 'bot');
    await sendTextMessage(phone, fallback, { phoneNumberId: messageData.phoneNumberId });
  } catch (e2) {
    console.error('Fallback send failed:', e2.message);
  }
  try {
    await incrementAdminUnread(phone);
    await updateLead(phone, {
      notes: 'Falha automação: ' + (detail || '').substring(0, 120),
      updatedAt: new Date().toISOString(),
    });
  } catch (e3) {
    console.warn('handleAiFailure update:', e3.message);
  }
}

module.exports = { handleIncomingMessage };
