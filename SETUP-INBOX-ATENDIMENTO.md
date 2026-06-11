# Painel de Atendimento WhatsApp – Inbox

Sistema completo para administrar contatos de vendas, sugestões e dúvidas pelo WhatsApp, com handoff automático (cliente não precisa mudar de número).

## Fluxo

1. **Cliente conversa com a Bia (bot)** – respostas automáticas com IA.
2. **Cliente pede humano** – Bia usa a ferramenta `encaminhar_humano` e avisa que um atendente vai assumir.
3. **Atendente assume no painel** – clica em “Assumir” e passa a responder pelo painel.
4. **Bot para de responder** automaticamente para aquele contato até o humano “Devolver ao bot”.
5. **Histórico completo** – todas as mensagens ficam salvas e visíveis ao assumir.

## Onde acessar

- **Admin** → **Leads WhatsApp** (ou **Atendimento WhatsApp**)
- URL: `admin.html` → menu lateral → Leads WhatsApp

## Recursos do painel

### Estatísticas
- **Total** – contatos com conversa
- **Pendentes** – mensagens não lidas pelo atendente (badge no menu)
- **Em atendimento** – conversas assumidas por humano
- **Vendas / Dúvidas / Sugestões** – quantidade por categoria

### Filtros
- **Modo**: todas, em atendimento humano, com o bot
- **Categoria**: vendas, dúvidas, sugestões, geral
- **Status**: novo, qualificado, encaminhado, agendado, convertido
- **Busca** por nome ou telefone

### Ações na conversa
- **Assumir** – humano passa a responder pelo painel (bot para de responder)
- **Devolver ao bot** – bot volta a responder automaticamente
- **Enviar mensagem** – escrever e enviar pelo painel (via WhatsApp API)
- **Alterar status** – novo, qualificado, encaminhado, agendado, convertido
- **Abrir WhatsApp** – link para responder no app se preferir

### Avisos e notificações
- Badge vermelho no menu “Leads WhatsApp” quando há conversas pendentes
- Lista destaca conversas não lidas
- Atualização automática a cada 15 segundos quando uma conversa está aberta

## Cloud Functions utilizadas

| Função | Descrição |
|--------|-----------|
| `chatbotInbox` | Lista conversas, stats e histórico |
| `chatbotInboxAssume` | Assumir conversa (ativa modo humano) |
| `chatbotInboxReturnToBot` | Devolver conversa ao bot |
| `chatbotInboxSend` | Enviar mensagem via WhatsApp API |
| `chatbotInboxMarkRead` | Marcar como lido |
| `chatbotInboxUpdateStatus` | Alterar status do lead |
| `chatbotInboxUpdateCategory` | Alterar categoria |

## Campos no Firestore (chatbot_leads)

- `modo_humano` – se atendimento está com humano
- `assumido_por` – email do admin que assumiu
- `assumido_em` – data/hora em que assumiu
- `categoria` – vendas, duvidas, sugestoes, geral
- `adminUnreadCount` – mensagens não lidas pelo atendente
- `lastMessageAt` – última mensagem (para ordenação)
- `encaminhadoMotivo` – motivo do encaminhamento

## Deploy

```bash
cd functions
firebase deploy --only functions:chatbotInbox,functions:chatbotInboxAssume,functions:chatbotInboxReturnToBot,functions:chatbotInboxSend,functions:chatbotInboxMarkRead,functions:chatbotInboxUpdateStatus,functions:chatbotInboxUpdateCategory
```

Ou para fazer deploy de todas as funções:

```bash
firebase deploy --only functions
```

## Cenários previstos

1. **Novo contato** – entra na lista e pode ser assumido a qualquer momento
2. **Cliente pede humano** – Bia encaminha, categoria é definida pelo motivo e aparece “ pendente”
3. **Múltiplos atendentes** – quem assumir primeiro fica responsável
4. **Cliente volta a escrever durante atendimento** – mensagens acumulam e são marcadas como não lidas se o atendente não visualizar
5. **Devolução ao bot** – bot reassume e volta a responder normalmente
6. **Follow-up automático** – leads em modo humano são ignorados pelo follow-up de 24h/72h
7. **Respostas do painel** – todas são enviadas via WhatsApp API e salvas no histórico com `source: admin`
