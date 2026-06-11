# App Review – Roteiro do screencast (WhatsApp Business Management)

Use este roteiro para gravar o vídeo solicitado pelo Meta (criar/gerenciar template e enviar para número de teste). **Idioma do vídeo e das legendas: inglês.**

---

## Objetivo do vídeo

Mostrar em sequência:
1. **Criação ou seleção** de um Message Template no WhatsApp.
2. **Onde o template é aprovado/gerenciado** (status e gestão).
3. **Envio de uma mensagem com esse template** para um número de teste.

---

## Duração sugerida

Entre **2 e 4 minutos**. Evite passar de 5 minutos.

---

## Roteiro minuto a minuto

### 0:00 – 0:20 | Abertura e contexto

- **O que mostrar:** Tela inicial do Meta for Developers (ou Meta Business Suite) com o app **BF Marques Chatbot** selecionado.
- **O que dizer (narração em inglês):**  
  *"This is the BF Marques Chatbot app. We use the WhatsApp Business Management permission to create and manage message templates and to send template messages to users."*
- **Legenda sugerida:**  
  *"App: BF Marques Chatbot. We use WhatsApp Business Management for templates and messaging."*

---

### 0:20 – 1:00 | Onde os templates são criados e gerenciados

- **O que mostrar:** Navegar até **WhatsApp** → **Message templates** (ou **Configuração** → **Modelos de mensagem** / equivalente no seu painel).
- Mostrar a **lista de templates** existentes (pelo menos um template aprovado).
- Clicar em um template e mostrar: **nome**, **categoria**, **idioma** e **status (Approved)**.
- **O que dizer:**  
  *"We create and manage message templates here. This template is approved and ready to use. Templates are submitted for Meta approval before we can send them."*
- **Legenda sugerida:**  
  *"Message templates are created and managed here. Status: Approved."*

---

### 1:00 – 1:40 | Criar um novo template (opcional, se quiser mostrar criação)

- **O que mostrar:** Clicar em **Create template** (ou **Criar modelo**). Preencher:
  - **Name:** e.g. `follow_up_reminder`
  - **Category:** Utility ou Marketing (conforme uso).
  - **Language:** Portuguese (Brazil).
  - **Body:** texto simples, e.g. *"Hello {{1}}, this is a reminder about your interest in our properties."*
- Mostrar o envio para **revisão** (Submit for review).
- **O que dizer:**  
  *"We can create new templates here. After submitting, Meta reviews and approves them. Once approved, we use them to message users."*
- **Legenda sugerida:**  
  *"New template created and submitted for Meta approval."*

*(Se não quiser mostrar criação, use só a lista de templates aprovados e diga que eles foram created and approved in this dashboard.)*

---

### 1:40 – 2:30 | Onde o template é aprovado e gerenciado

- **O que mostrar:** Na mesma tela de **Message templates**, mostrar a coluna ou badge de **Status** (Approved / Pending / Rejected).
- Opcional: abrir um template **Approved** e mostrar que não é possível editá-lo após aprovação (apenas criar nova versão), reforçando que a gestão e aprovação são feitas neste painel.
- **O que dizer:**  
  *"Approval and management of templates happen here. We only send templates that have been approved by Meta."*
- **Legenda sugerida:**  
  *"Template approval and management are done in this dashboard."*

---

### 2:30 – 3:30 | Envio para número de teste

- **O que mostrar:** Uma das opções abaixo (escolha a que estiver disponível no seu painel):
  - **Opção A:** Em **WhatsApp** → **API Setup** ou **Send and receive messages**, usar a ferramenta **"Send message"** / **"Testar envio"** com um **template** selecionado e enviar para o **número de teste** cadastrado no app.
  - **Opção B:** Mostrar no código (ou em um ambiente de teste) uma chamada à API que envia mensagem do tipo `template` para um número de teste e, em seguida, mostrar o WhatsApp do celular de teste recebendo a mensagem.
- **O que dizer:**  
  *"We now send a message using this approved template to our test phone number."*  
  Em seguida, mostrar o celular (ou emulador) com o WhatsApp aberto recebendo a mensagem.  
  *"The test number received the template message. This is how we use the whatsapp_business_management permission in production."*
- **Legendas sugeridas:**  
  *"Sending template message to test number."*  
  *"Test device received the template. This is our production use of the permission."*

---

### 3:30 – 4:00 | Fechamento

- **O que mostrar:** Voltar à lista de templates ou à tela do app no Meta for Developers.
- **O que dizer:**  
  *"To summarize: we create and manage message templates in this dashboard, use only Meta-approved templates, and send them to users—including for follow-ups and business notifications—via the WhatsApp Cloud API. Thank you."*
- **Legenda sugerida:**  
  *"Summary: we create and manage templates here, use only approved templates, and send them via the API. Thank you."*

---

## Dicas técnicas

- Grave a tela em **1080p** (ou 720p no mínimo).
- Use **áudio claro** (microfone próximo, sem ruído).
- **Legendas:** pode usar as frases acima como legendas em inglês no próprio vídeo (ferramenta de edição ou YouTube).
- **Número de teste:** use o número adicionado como "testador" no app (App Dashboard → Roles ou WhatsApp → Test numbers).
- Se o painel estiver em português, narre em inglês e, se possível, adicione legendas em inglês com os textos acima.

---

## Checklist antes de enviar

- [ ] Vídeo em inglês (narração ou legendas).
- [ ] Mostra criação ou lista de templates.
- [ ] Mostra onde o template é aprovado/gerenciado (status).
- [ ] Mostra envio de template para número de teste.
- [ ] Duração entre 2 e 4 minutos.
- [ ] Áudio e imagem legíveis.
