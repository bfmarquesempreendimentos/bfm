const Anthropic = require('@anthropic-ai/sdk');
const { sendTextMessage, sendImageMessage, sendVideoMessage, sendInteractiveButtons, getWhatsAppMediaBuffer } = require('./whatsapp-api');
const { transcribeAudioBuffer } = require('./audio-transcription');
const { getPropertyById, getPropertyMediaLists, filterProperties, formatPropertyShort, formatPropertyFull, getPropertiesSummaryForAI, properties } = require('./property-data');
const { formatPropertyInventory, formatUnitDetail } = require('./property-inventory');
const { simulateFinancing, formatSimulationResult } = require('./finance-simulator');
const { getOrCreateLead, saveMessage, getConversationHistory, qualifyLead, addInterestedProperty, scheduleVisit, updateLead, incrementAdminUnread, inferCategoryFromMotivo, normalizeWhatsAppPhone, recordInboundActivity, getLeadByPhone, queueInboundEmailAlert, getBiaTrainingPromptExtra, recordBiaAutoLesson, setFollowUpExclusion, findRegisteredBrokerByPhone, getBrokerBiaPromptBlock, BRUNO_CORRETOR_PHONE_DISPLAY } = require('./lead-manager');
const { detectAgeFinancingBlock } = require('./follow-up-engine');
const { sendWelcomeMessage, sendBrokerWelcomeMessage } = require('./templates');

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

/**
 * Vídeo de acesso para o corretor (mostra onde a chave fica escondida: no quadro
 * de luz da Enel — mesmo padrão em todos os empreendimentos).
 * Conteúdo EXCLUSIVO para corretores cadastrados.
 */
const BROKER_VISIT_ACCESS_VIDEO_URL =
  'https://bfmarquesempreendimentos.github.io/bfm/assets/videos/amendoeiras/amendoeiras-03.mp4';

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
- Tetos de renda *urbanos* usados na simulação do sistema (ampliação divulgada em 2026): Faixa 1 até *R$ 3.200*; Faixa 2 até *R$ 5.000*; Faixa 3 até *R$ 9.600*; Faixa 4 até *R$ 13.000*. Tetos de valor de imóvel (referência geral): Faixas 3 e 4 chegam a até *R$ 400 mil* e *R$ 600 mil* conforme programa — não invente status de unidade nem valor de engenharia; use estoque_empreendimento / consultar_unidade.
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
10. No início: (1) nome, (2) *renda bruta familiar mensal*, (3) região ou imóvel de interesse e (4) *se o nome está limpo (sem restrição no CPF)* — depois ofereça simulação ou opções com listar_imoveis
11. Crie senso de urgência: "Unidades limitadas", "Condição especial por tempo limitado"
12. Destaque benefícios do MCMV quando aplicável: subsídio, ITBI grátis, entrada facilitada
13. Não invente informações. Se não souber, diga que vai verificar com o Davi
14. Respostas concisas (máximo 3–4 parágrafos), sempre com foco em *aprovação de crédito* e próximo passo claro
15. Ao falar de um imóvel específico (*detalhes_imovel*), o sistema *envia automaticamente* fotos e vídeos — *nunca* pergunte "quer ver fotos?" ou "posso enviar imagens?". Só use *enviar_midias_imovel* com *enviar_mais: true* se o cliente pedir *mais* mídias depois do lote inicial
16. Ao final de qualquer interação significativa, sugira agendar uma visita
17. Documentos enviados ou visita solicitada SEMPRE exigem atendimento humano – use encaminhar_humano
18. Não diga apenas “renda”; diga *renda bruta familiar* para alinhar com o programa e evitar retrabalho na análise
19. *Nunca* encaminhe ao humano apenas porque o cliente pediu material visual do imóvel — isso é papel da ferramenta enviar_midias_imovel
20. Depois que as mídias forem enviadas (automático ou ferramenta), sua resposta em texto deve ser *curta* (simulação ou visita) — não repita descrições longas do imóvel
21. Use as *orientações do atendente* no contexto do sistema quando existirem — elas refletem como a equipe quer que você escreva
22. Quando o cliente mandar *áudio*, a conversa pode trazer o texto *já transcrito* — responda ao conteúdo como se fosse mensagem escrita, em português natural
23. Para leads de anúncios/WhatsApp, pergunte SEMPRE sobre *nome limpo* (CPF sem restrição). Sem essa informação, continue a qualificação até obter a resposta antes de avançar para proposta final
24. Se o cliente disser que *não passa na idade*, que o *banco não libera por idade*, que tem *idade avançada* ou similar, use *marcar_sem_follow_up* — não insista com follow-up automático
25. Não pressione financiamento para quem já indicou bloqueio por idade; ofereça apenas informações gerais ou encaminhe ao humano se pedir
26. *NUNCA* informe o telefone do Bruno Marques (21) 99555-7010 para clientes/leads — esse contato é *exclusivo* para corretores cadastrados (o sistema ativa o modo corretor automaticamente quando aplicável)
27. Perguntas sobre unidade específica, reservada ou disponível: use estoque_empreendimento ou consultar_unidade — nunca chute status. Valor de engenharia só informe se a ferramenta retornar (modo corretor)`;

/**
 * Cérebro DEDICADO para corretor cadastrado (curto e objetivo, sem roteiro de consumidor).
 * Usado no lugar do SYSTEM_PROMPT quando o contato é corretor.
 */
function buildBrokerSystemPrompt(broker) {
  var first = String((broker && broker.name) || '').trim().split(' ')[0] || 'parceiro(a)';
  return 'Você é a *Bia*, assistente da *B F Marques Empreendimentos*, falando com um *CORRETOR PARCEIRO CADASTRADO*: *' + first + '*. ' +
    'Trate como colega profissional do mercado imobiliário — NÃO é cliente final.\n\n' +
    '## ESTILO (OBRIGATÓRIO)\n' +
    '- Respostas *curtas e diretas*: no máximo 2 a 4 linhas. Sem enrolação, sem discurso de vendas.\n' +
    '- Responda só o que foi perguntado, com dados concretos. Pode usar 1 emoji no máximo.\n' +
    '- Tom profissional entre parceiros.\n\n' +
    '## NUNCA FAÇA\n' +
    '- NÃO explique como funciona o Minha Casa Minha Vida, faixas, subsídio, taxas, ITBI, prazos ou regras do programa. O corretor já sabe.\n' +
    '- NÃO peça renda, CPF nem "nome limpo". NÃO faça qualificação de consumidor.\n' +
    '- NÃO ofereça simulação por conta própria nem use frases tipo "sair do aluguel". Só rode simular_financiamento se ele pedir um número.\n' +
    '- NUNCA cite "Davi" nem o número (21) 99759-0814. O contato do corretor é SEMPRE o *Bruno Marques (21) 99555-7010*.\n\n' +
    '## O QUE VOCÊ FORNECE\n' +
    '- Preço de venda, *valor de engenharia* e status de unidade (disponível/reservado/assinado): use estoque_empreendimento e consultar_unidade (dados oficiais, não invente).\n' +
    '- Características, endereço e mapa: use detalhes_imovel, listar_imoveis e endereco_imovel.\n' +
    '- Fotos/vídeo de um imóvel: detalhes_imovel já envia automático; mais mídia, use enviar_midias_imovel.\n\n' +
    '## VISITA / CHAVE\n' +
    '- Se perguntar como conhecer o local, visitar, pegar/onde está a chave ou acessar o empreendimento, use *orientar_acesso_visita* (envia o vídeo). A chave fica no *quadro de luz da Enel* — mesmo padrão em todos os empreendimentos.\n\n' +
    '## ENCAMINHAR AO BRUNO\n' +
    '- Reserva, financiamento aprovado, valores fechados, proposta, agendamento/visita ou decisão comercial: direcione ao *Bruno Marques (21) 99555-7010* (não use encaminhar_humano no lugar do Bruno).\n' +
    '- Esse número é exclusivo para corretor; nunca passe para cliente final.\n\n' +
    '## EMPREENDIMENTOS\n' +
    getPropertiesSummaryForAI();
}

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
    description: 'Salva dados de qualificação do lead (nome, renda bruta familiar mensal, CPF, email e se o nome está limpo).',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do cliente' },
        renda: { type: 'number', description: 'Renda bruta familiar mensal informada' },
        cpf: { type: 'string', description: 'CPF do cliente' },
        email: { type: 'string', description: 'Email do cliente' },
        nome_limpo: { type: 'string', description: 'Situação do nome para MCMV: sim, nao, nao_informado', enum: ['sim', 'nao', 'nao_informado'] },
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
    name: 'marcar_sem_follow_up',
    description: 'Marca o lead para NÃO receber mensagens automáticas de follow-up. Use quando idade impede financiamento, banco não libera por idade, ou cliente pediu para não ser contatado.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Ex: idade_financiamento, pedido_cliente' },
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
  {
    name: 'estoque_empreendimento',
    description: 'Lista TODAS as unidades de um empreendimento com status oficial (disponível/reservado/assinado) e preço de venda. Corretores cadastrados também veem valor de engenharia quando existir no sistema. Use para dúvidas sobre unidades reservadas ou disponíveis.',
    input_schema: {
      type: 'object',
      properties: {
        imovel_id: { type: 'number', description: 'ID do empreendimento (1 a 8)' },
        filtro_status: {
          type: 'string',
          description: 'Opcional: disponivel, reservado ou assinado — filtra a lista',
          enum: ['', 'disponivel', 'reservado', 'assinado'],
        },
      },
      required: ['imovel_id'],
    },
  },
  {
    name: 'consultar_unidade',
    description: 'Consulta uma unidade específica pelo código (ex: APTO 202, casa 03, CS 4). Retorna status, preço de venda e valor de engenharia (corretores).',
    input_schema: {
      type: 'object',
      properties: {
        imovel_id: { type: 'number', description: 'ID do empreendimento (1 a 8)' },
        codigo_unidade: { type: 'string', description: 'Código da unidade como no estoque' },
      },
      required: ['imovel_id', 'codigo_unidade'],
    },
  },
  {
    name: 'endereco_imovel',
    description: 'Retorna o endereço completo e o link do mapa (Google Maps) de um empreendimento. Use quando perguntarem "onde fica", "qual o endereço", "manda a localização" — responda na hora, NÃO encaminhe para humano.',
    input_schema: {
      type: 'object',
      properties: {
        imovel_id: { type: 'number', description: 'ID do empreendimento (1 a 8)' },
      },
      required: ['imovel_id'],
    },
  },
  {
    name: 'orientar_acesso_visita',
    description: 'EXCLUSIVO PARA CORRETOR CADASTRADO. Use quando o corretor perguntar como conhecer o local, visitar, pegar/onde está a chave ou acessar o empreendimento. Envia o vídeo de acesso (onde a chave fica escondida — mesmo local para todos os empreendimentos). NUNCA use para cliente final.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

/** Envia fotos/vídeos do imóvel. fullGallery=true na primeira apresentação (detalhes). */
async function sendPropertyMedias(property, context, opts) {
  opts = opts || {};
  const lists = getPropertyMediaLists(property);
  const images = lists.images;
  const videos = lists.videos;
  if (images.length === 0 && videos.length === 0) {
    return { sent: false, summary: 'Não há fotos ou vídeos cadastrados para este imóvel.' };
  }

  const lead = await getLeadByPhone(context.from);
  var cur = lead && lead.mediaGalleryCursor;
  const pid = property.id;
  const mais = !!opts.enviar_mais;
  const fullGallery = !!opts.fullGallery;

  if (!mais || !cur || cur.propertyId !== pid) {
    cur = { propertyId: pid, imageIdx: 0, videoIdx: 0 };
  }

  var maxImg = fullGallery && !mais ? Math.min(images.length, 8) : 3;
  const batchImages = images.slice(cur.imageIdx, cur.imageIdx + maxImg);
  var batchVideos = [];
  if (videos.length > 0 && cur.videoIdx < videos.length) {
    if (fullGallery && !mais) {
      batchVideos = videos.slice(cur.videoIdx, Math.min(videos.length, cur.videoIdx + 2));
    } else if (batchImages.length > 0) {
      batchVideos = videos.slice(cur.videoIdx, cur.videoIdx + 1);
    } else if (cur.imageIdx >= images.length) {
      batchVideos = videos.slice(cur.videoIdx, cur.videoIdx + 1);
    }
  }

  if (batchImages.length === 0 && batchVideos.length === 0) {
    return {
      sent: false,
      summary: 'Já enviei todas as fotos e vídeos que temos deste imóvel. Peça "manda de novo as fotos" para recomeçar.',
    };
  }

  const waOpt = { phoneNumberId: context.phoneNumberId };
  var imgN = 0;
  var ii;
  for (ii = 0; ii < batchImages.length; ii++) {
    var cap = imgN === 0 ? '📸 ' + property.title : '';
    await sendImageMessage(context.from, batchImages[ii], cap, waOpt);
    imgN++;
    await delay(650);
  }
  var jj;
  for (jj = 0; jj < batchVideos.length; jj++) {
    await sendVideoMessage(context.from, batchVideos[jj], '🎬 ' + property.title, waOpt);
    await delay(900);
  }

  const newCursor = {
    propertyId: pid,
    imageIdx: cur.imageIdx + batchImages.length,
    videoIdx: cur.videoIdx + batchVideos.length,
  };
  await updateLead(context.from, { mediaGalleryCursor: newCursor });

  const summaryParts = [];
  if (batchImages.length) summaryParts.push(batchImages.length + ' foto(s)');
  if (batchVideos.length) summaryParts.push(batchVideos.length + ' vídeo(s)');
  const line = 'Enviei ' + summaryParts.join(' e ') + ' de ' + property.title + '.';
  await saveMessage(context.from, 'assistant', line, 'bot');
  await recordInboundActivity(context.from, line);

  var aindaTem = newCursor.imageIdx < images.length || newCursor.videoIdx < videos.length;
  return {
    sent: true,
    summary: line + (aindaTem && !fullGallery ? ' Se quiser mais, é só pedir.' : ''),
    aindaTem: aindaTem,
  };
}

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
      var mediaResult = await sendPropertyMedias(property, context, { fullGallery: true, enviar_mais: false });
      var detailText = formatPropertyFull(property);
      if (mediaResult.sent) {
        return detailText + '\n\n[Mídias enviadas automaticamente: ' + mediaResult.summary + ']';
      }
      return detailText + '\n\n[' + mediaResult.summary + ']';
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
        cleanNameStatus: input.nome_limpo,
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
        humanoJa: true,
        followUpPaused: true,
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

    case 'marcar_sem_follow_up': {
      var motivoFu = input.motivo || 'idade_financiamento';
      await setFollowUpExclusion(context.from, true, motivoFu, 'bia');
      return 'Lead marcado sem follow-up automático (' + motivoFu + ').';
    }

    case 'encaminhar_humano': {
      const categoria = inferCategoryFromMotivo(input.motivo);
      await updateLead(context.from, {
        status: 'encaminhado',
        notes: `Encaminhado: ${input.motivo}`,
        modo_humano: true,
        humanoJa: true,
        followUpPaused: true,
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

    case 'estoque_empreendimento': {
      var invOpts = {
        includeEngineering: !!context.isBroker,
        statusFilter: input.filtro_status || '',
      };
      return formatPropertyInventory(input.imovel_id, invOpts);
    }

    case 'consultar_unidade': {
      return formatUnitDetail(input.imovel_id, input.codigo_unidade, {
        includeEngineering: !!context.isBroker,
      });
    }

    case 'endereco_imovel': {
      const propAddr = getPropertyById(input.imovel_id);
      if (!propAddr) return 'Imóvel não encontrado.';
      var addrParts = [];
      addrParts.push('📍 ' + propAddr.title);
      if (propAddr.address) addrParts.push(propAddr.address);
      if (propAddr.location) addrParts.push(propAddr.location);
      if (propAddr.mapsUrl) addrParts.push('🗺️ Mapa: ' + propAddr.mapsUrl);
      return addrParts.join('\n');
    }

    case 'orientar_acesso_visita': {
      if (!context.isBroker) {
        return 'Orientação de acesso/chave é exclusiva para corretores cadastrados. Para cliente final, use agendar_visita.';
      }
      var waOptKey = { phoneNumberId: context.phoneNumberId };
      var keyVideoSent = false;
      if (BROKER_VISIT_ACCESS_VIDEO_URL) {
        try {
          await sendVideoMessage(
            context.from,
            BROKER_VISIT_ACCESS_VIDEO_URL,
            '🔑 Onde fica a chave: no quadro de luz da Enel (mesmo padrão em todos os empreendimentos)',
            waOptKey
          );
          keyVideoSent = true;
          await saveMessage(context.from, 'assistant', '[Vídeo de acesso/chave enviado ao corretor]', 'bot');
        } catch (keyErr) {
          console.error('orientar_acesso_visita vídeo:', keyErr.message);
        }
      }
      return (keyVideoSent
        ? 'Vídeo de acesso enviado. '
        : 'Vídeo de acesso indisponível no momento; oriente apenas por texto. ') +
        'Diga ao corretor, de forma objetiva: a chave fica escondida no *quadro de luz da Enel* do empreendimento — é o MESMO padrão em todos os empreendimentos (o vídeo mostra onde). Ele pode ir conhecer com o cliente. Para combinar horário ou suporte na visita, o contato é o Bruno Marques ' + BRUNO_CORRETOR_PHONE_DISPLAY + '. NÃO explique MCMV nem peça dados do corretor.';
    }

    case 'enviar_midias_imovel': {
      const property = getPropertyById(input.imovel_id);
      if (!property) return 'Imóvel não encontrado.';
      const mediaOut = await sendPropertyMedias(property, context, {
        fullGallery: !input.enviar_mais,
        enviar_mais: !!input.enviar_mais,
      });
      return mediaOut.summary;
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

/** Detecta quando a Bia "escorrega" no modo corretor (conteúdo que não deveria mandar p/ corretor). */
function detectBrokerReplySlip(text) {
  var t = String(text || '').toLowerCase();
  if (!t) return '';
  if (t.indexOf('davi') >= 0 || t.indexOf('99759-0814') >= 0 || t.indexOf('997590814') >= 0) {
    return 'citou_davi';
  }
  if (/nome\s+limpo|cpf\s+(sem\s+restri|limpo|est[aá]\s+limpo)/.test(t)) {
    return 'pediu_cpf_nome_limpo';
  }
  if (/renda\s+bruta|sua\s+renda|renda\s+familiar/.test(t)) {
    return 'pediu_renda';
  }
  if (/subs[ií]dio|minha\s+casa\s+minha\s+vida|sair\s+do\s+aluguel/.test(t)) {
    return 'explicou_mcmv';
  }
  return '';
}

function getConsecutiveUserMessages(messages) {
  var count = 0;
  var i;
  for (i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') count++;
    else break;
  }
  return count;
}

async function handleIncomingMessage(messageData) {
  var fromRaw = messageData.from;
  var phone = normalizeWhatsAppPhone(fromRaw) || fromRaw;
  var profileName = messageData.profileName;
  var text = messageData.text;
  var type = messageData.type;
  var referral = messageData.referral;

  const lead = await getOrCreateLead(phone, profileName);
  var registeredBroker = await findRegisteredBrokerByPhone(phone);
  if (registeredBroker) {
    await updateLead(phone, {
      isBroker: true,
      brokerId: registeredBroker.id,
      brokerName: registeredBroker.name,
      contactType: 'corretor',
      categoria: 'corretor',
      followUpExcluded: true,
      followUpExcludeReason: 'corretor_cadastrado',
    });
  }
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
  await queueInboundEmailAlert(phone, profileName || (lead && lead.name) || '', userContent);

  var ageBlockReason = detectAgeFinancingBlock(userContent);
  if (ageBlockReason) {
    await setFollowUpExclusion(phone, true, ageBlockReason, 'bia_auto');
  }

  if (!lead.welcomeSent && type !== 'document' && type !== 'image') {
    try {
      if (registeredBroker) {
        await sendBrokerWelcomeMessage(phone, registeredBroker.name || profileName);
      } else {
        await sendWelcomeMessage(phone, lead.name || profileName);
      }
      await updateLead(phone, { welcomeSent: true });
    } catch (welcomeErr) {
      console.error('[Bia] welcome:', welcomeErr.message);
    }
  }

  const escalationHistory = await getConversationHistory(phone, 12);
  const consecutiveUserMsgs = getConsecutiveUserMessages(escalationHistory);
  if (!registeredBroker && (type === 'audio' || consecutiveUserMsgs >= 3) && !lead.modo_humano) {
    const escReason = type === 'audio'
      ? 'Escalação automática: cliente enviou áudio e requer revisão humana'
      : 'Escalação automática: 3+ mensagens seguidas do cliente sem resposta humana';
    await updateLead(phone, {
      revisarBot: true,
      needsHumanFollowup: true,
      urgencyLevel: 'alta',
      notes: escReason,
      updatedAt: new Date().toISOString(),
    });
    await notifyManager(phone, null, null, escReason, { phoneNumberId: messageData.phoneNumberId });
  }

  if (type !== 'document' && type !== 'image' && !lead.modo_humano && lead.humanoJa) {
    await updateLead(phone, { revisarBot: true });
  }

  if (lead.modo_humano) {
    console.log('[Bia] modo_humano ativo para ' + phone + ' — aguardando atendente no painel');
    await incrementAdminUnread(phone);
    return;
  }

  if (type === 'document' || type === 'image') {
    if (registeredBroker) {
      var msgBroker = 'Recebi seu ' + (type === 'document' ? 'documento' : 'arquivo') + '! Para *reserva*, *financiamento*, *valores* ou *proposta*, envie direto ao Bruno Marques: ' + BRUNO_CORRETOR_PHONE_DISPLAY + '. Posso ajudar com dúvidas gerais sobre os imóveis por aqui.';
      await saveMessage(phone, 'assistant', msgBroker, 'bot');
      await sendTextMessage(phone, msgBroker, { phoneNumberId: messageData.phoneNumberId });
      return;
    }
    const motivo = type === 'document'
      ? 'Cliente enviou documento para análise'
      : 'Cliente enviou imagem (possível documento para análise)';
    const categoria = inferCategoryFromMotivo(motivo);
    await updateLead(phone, {
      status: 'encaminhado',
      notes: motivo,
      modo_humano: true,
      humanoJa: true,
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
    var cleanNameStatus = lead && lead.cleanNameStatus ? String(lead.cleanNameStatus) : 'nao_informado';
    var cleanNameMissing = cleanNameStatus !== 'sim' && cleanNameStatus !== 'nao';
    var cleanNameRule = cleanNameMissing
      ? '\n\nQualificação obrigatória pendente nesta conversa: pergunte de forma direta se o cliente está com NOME LIMPO (CPF sem restrição), pois isso é requisito essencial para MCMV.'
      : '';
    if (registeredBroker) {
      cleanNameRule = '';
    }
    var trainingExtra = '';
    try {
      trainingExtra = await getBiaTrainingPromptExtra(phone);
    } catch (te) {
      console.warn('getBiaTrainingPromptExtra:', te.message);
    }
    var leadContext;
    // Teto de segurança só p/ não cortar respostas longas (ex.: lista de estoque).
    // A brevidade do corretor é controlada pelo prompt, não por este limite.
    var brokerMaxTokens = 1024;
    if (registeredBroker) {
      leadContext = buildBrokerSystemPrompt(registeredBroker) +
        `\n\nDados do corretor: Nome: ${registeredBroker.name || lead.name || 'Corretor(a)'}, Imóveis de interesse: ${(lead.interestedProperties || []).join(', ') || 'Nenhum ainda'}` +
        trainingExtra;
    } else {
      leadContext = SYSTEM_PROMPT +
        `\n\nDados do contato (Lead/cliente): Nome: ${lead.name || 'Desconhecido'}, Status: ${lead.status}, Nome limpo: ${cleanNameStatus}, Imóveis de interesse: ${(lead.interestedProperties || []).join(', ') || 'Nenhum ainda'}` +
        cleanNameRule + trainingExtra;
    }
    let response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: registeredBroker ? brokerMaxTokens : 1024,
      system: leadContext,
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
        const result = await executeTool(tool.name, tool.input, {
          from: phone,
          phoneNumberId: messageData.phoneNumberId,
          isBroker: !!registeredBroker,
        });
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
        max_tokens: registeredBroker ? brokerMaxTokens : 1024,
        system: leadContext,
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

    if (registeredBroker) {
      var slip = detectBrokerReplySlip(finalText);
      if (slip) {
        try {
          await updateLead(phone, {
            revisarBot: true,
            biaSlip: slip,
            biaSlipAt: new Date().toISOString(),
            notes: 'Bia escorregou no modo corretor: ' + slip,
          });
        } catch (slipErr) {
          console.warn('registrar biaSlip:', slipErr.message);
        }
        try {
          await recordBiaAutoLesson(slip);
        } catch (lessonErr) {
          console.warn('recordBiaAutoLesson:', lessonErr.message);
        }
      }
    }

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
