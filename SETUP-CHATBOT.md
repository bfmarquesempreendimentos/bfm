# Setup do Chatbot WhatsApp - B F Marques

## ⚠️ IMPORTANTE: Erro "wabalD" ao adicionar número

Se você recebe **"Unexpected null value for wabalD"** ao tentar cadastrar um número no Meta, isso é um bug conhecido do fluxo antigo. Use o **Embedded Signup** abaixo.

---

## Fluxo correto: Embedded Signup (recomendado)

O Embedded Signup é o fluxo oficial que gera automaticamente o WABA e Phone Number ID, sem o erro wabalD.

### Passo 1: Acessar Embedded Signup

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Abra o app **BF Marques Chatbot**
3. Menu lateral: **WhatsApp** → **Configuração**
4. Procure **"ES Integration"** ou **"Embedded Signup"**
5. Ou acesse: App Dashboard → WhatsApp → Configuração da API
6. Se houver opção **"Usar Embedded Signup"**, prefira essa

### Passo 2: Completar o cadastro

1. Siga o wizard (negócio, perfil, número)
2. O Meta vai gerar automaticamente: **WABA ID**, **Phone Number ID**, **Token**
3. Copie o **Phone Number ID** (número longo, ex: 123456789012345)
4. O número de teste do Meta já vem configurado – adicione seu celular como destinatário de teste

### Passo 3: Configurar secrets no Firebase

```bash
cd functions

firebase functions:secrets:set WHATSAPP_TOKEN
# Cole o token do Embedded Signup

firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN
# Crie uma string (ex: bfmarques_chatbot_2024_xyz)

firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
# Cole o Phone Number ID do passo 2

firebase functions:secrets:set ANTHROPIC_API_KEY
# Sua chave da Anthropic (sk-ant-...)
```

---

## Fluxo alternativo (se Embedded Signup não estiver disponível)

### Passo 1: Conta Meta Business

1. [business.facebook.com](https://business.facebook.com)
2. Verifique seu negócio (pode levar 1-3 dias)

### Passo 2: App no Meta for Developers

1. [developers.facebook.com](https://developers.facebook.com) → Meus Apps → BF Marques Chatbot
2. WhatsApp → Configurar
3. Vincule a conta Meta Business

### Passo 3: Número de teste

1. Em **Primeiros passos** ou **API Setup**, o Meta exibe um **número de teste**
2. Copie o **Phone Number ID** (ao lado do número)
3. Adicione seu celular como destinatário de teste
4. **Não use** "Adicionar número" se aparecer o erro wabalD – use apenas o número de teste

### Passo 4: Token permanente

1. business.facebook.com → Configurações → Usuários do sistema
2. Crie usuário do sistema com permissão admin
3. Gere token com: `whatsapp_business_management`, `whatsapp_business_messaging`

### Passo 5-7: Chave Anthropic, plano Blaze, secrets

(Conforme seção anterior)

---

## Passo 8: Configurar webhook no Meta

1. Deploy: `firebase deploy --only functions`
2. URL do webhook: `https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/chatbotWebhook`
3. Meta → WhatsApp → Configuração → Webhook → Editar
4. URL de callback: cole a URL acima
5. Token de verificação: **igual** ao `WHATSAPP_VERIFY_TOKEN`
6. Inscreva-se em: **messages**
7. Clique em **Verificar e salvar**

---

## Migrar para número de produção (não teste)

Para usar seu número real (ex.: +55 21 99759 0814) em vez do número de teste:

### 1. Desconectar o número do WhatsApp atual

O número precisa estar **livre** para a API. Se já estiver no WhatsApp (pessoal ou Business):

- **WhatsApp comum:** Configurações → Conta → Excluir minha conta (o número ficará livre após ~30 dias, ou antes se usar "Migrar" no passo abaixo).
- **WhatsApp Business app:** Configurações → Excluir conta do WhatsApp Business. O número será desvinculado.

### 2. Adicionar o número no Meta

1. Acesse [developers.facebook.com](https://developers.facebook.com) → app **BF Marques Chatbot**
2. **WhatsApp** → **Configuração da API** → **Números de telefone** (ou **Gerenciar números**)
3. Clique em **Adicionar número** ou **Registrar número**
4. Informe o número no formato internacional (ex.: +55 21 99759 0814)
5. Receba o código por **SMS** ou **ligação** e informe na tela
6. Aguarde a verificação (pode levar alguns minutos)

### 3. Copiar o novo Phone Number ID

Após adicionar o número:

1. Na lista de números, clique no número que acabou de adicionar
2. Copie o **Identificação do número de telefone** (ex.: 1234567890123456)

### 4. Atualizar o secret e redeployar

```bash
cd "/Users/brunomarques/Downloads/Projetos/Exibicao e gerencia de Vendas"
firebase use site-interativo-b-f-marques
firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
# Cole o novo Phone Number ID quando pedir
# Aceite o redeploy quando perguntar
```

### 5. Forma de pagamento (produção)

Para uso em produção, a Meta costuma exigir **forma de pagamento válida** (linha de crédito):

1. [business.facebook.com](https://business.facebook.com) → **Configurações**
2. Procure **Linha de crédito** ou **Pagamentos**
3. Adicione um cartão ou forma de pagamento aceita

Sem isso, o envio proativo pode ser limitado; mensagens iniciadas pelo cliente geralmente seguem funcionando.

---

## Diagnóstico (verificar se está tudo configurado)

Após o deploy, acesse no navegador:

```
https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/chatbotWebhook?diagnostic=1
```

A resposta mostrará se os secrets estão definidos. Se **WHATSAPP_PHONE_NUMBER_ID** estiver "FALTANDO", o chatbot usa o `phone_number_id` do payload (número que recebeu a mensagem), mas o ideal é configurar o secret.

---

## ⚠️ Chatbot não funciona? Passos obrigatórios

Se o chatbot não responde, confira **nesta ordem**:

### 1. Webhook – Inscrever em **messages** (CRÍTICO)

Na tela de **Configuração da API → Configuração → Webhook**:

- Na tabela **"Campos do webhook"** (Webhook fields), procure o campo **`messages`**
- O status deve estar **"Assinado"** (toggle ligado), **não** "Cancelou a assinatura"
- Se estiver cancelado, **ative a inscrição** em `messages` e clique em **Verificar e salvar**

Sem isso, o Meta **não envia** as mensagens dos clientes para sua Cloud Function.

### 2. Número já registrado no WhatsApp ("phone number is already registered")

Se aparecer o erro *"This phone number is already registered to a WhatsApp account"* ao tentar verificar seu número:

- **Não use** o mesmo número do WhatsApp pessoal para a API
- Use o **número de teste** fornecido pelo Meta no painel (ex.: número temporário do app)
- Adicione **seu celular** como "Destinatário de teste" – assim você envia/recebe mensagens do chatbot no seu WhatsApp
- Para usar seu número real (+55 21 99759 0814) na API, é preciso fazer **Migração de número** (desvincula do WhatsApp normal)

### 3. Forma de pagamento

Sem forma de pagamento válida:

- **Receber** mensagens (cliente inicia) → funciona no período gratuito
- **Enviar** mensagens de forma proativa → exige forma de pagamento

Para testes com o número de teste, geralmente não é necessário pagamento.

### 4. Verificar secrets do Firebase

```bash
firebase functions:secrets:access WHATSAPP_VERIFY_TOKEN
firebase functions:secrets:access WHATSAPP_TOKEN
firebase functions:secrets:access WHATSAPP_PHONE_NUMBER_ID
firebase functions:secrets:access ANTHROPIC_API_KEY
```

O token de verificação no painel Meta deve ser **idêntico** ao `WHATSAPP_VERIFY_TOKEN`.

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Erro wabalD ao adicionar número | Use Embedded Signup ou apenas o número de teste do Meta |
| **Campos do webhook "Cancelou a assinatura"** | **Inscrever em `messages`** na seção Webhook → Verificar e salvar |
| **"Phone number already registered"** | Usar número de teste do Meta e adicionar seu celular como destinatário |
| Webhook não verifica | Confirme que `hub.verify_token` é igual ao secret WHATSAPP_VERIFY_TOKEN |
| Bot não responde | Verifique os logs: `firebase functions:log` e a URL `?diagnostic=1` |
| Número de teste não funciona | Confirme que seu celular está como destinatário de teste no painel Meta |
| **Respondo e nada acontece** | Veja a seção abaixo |
| **Erro 401 / token inválido** | O token do painel expira em 24h. Use token permanente (veja abaixo) |

---

## Respondo no WhatsApp e nada acontece

Se você recebe a mensagem de teste no celular mas, ao responder, o chatbot não responde:

### 1. Conferir webhook correto (messages)

Há **duas áreas** de webhook no Meta. É preciso inscrever **`messages`** na área **correta**:

- **Onde NÃO é:** Cadastro incorporado / ES Integration – lá aparecem campos como `smb_message_echoes`, `payment_configuration_update`, etc. O `smb_message_echoes` é eco das mensagens *que você envia*, não das respostas do usuário.
- **Onde é:** **Configuração da API** → **Configuração** → **Webhook**. Nessa tela, na tabela de campos, procure **`messages`** (para mensagens *recebidas* do usuário) e deixe em **Assinado**.

### 2. Conferir Phone Number ID nos secrets

O teste usa um número (ex.: +1 555 189 3245) com um **Phone Number ID** (ex.: 1001969349671358). Configure o secret:

```bash
firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
# Cole o ID exatamente como no painel (ex: 1001969349671358)
```

### 3. Conferir logs do webhook

Depois de responder no WhatsApp, confira os logs:

```bash
firebase functions:log --only chatbotWebhook
```

- Se não aparecer **"[Webhook] POST recebido"** → Meta não está chamando seu endpoint. Revise a URL e a assinatura em **`messages`**.
- Se aparecer **"change.field=..."** com algo diferente de `messages` → você está inscrito no campo errado.
- Se aparecer **"Nenhuma mensagem para processar"** → pode ser formato de payload diferente ou filtro de echo.

### 4. Fazer redeploy

Após alterar secrets ou código:

```bash
firebase deploy --only functions:chatbotWebhook
```

---

## Erro 401: Token inválido ou expirado

Se o webhook **recebe** a mensagem (logs mostram "Processando mensagem de...") mas não envia resposta, e os logs mostram **status 401** ou "token inválido":

O token do botão **"Gerar token de acesso"** no Meta Developers expira em **24 horas**. Você precisa de um **token permanente**.

### Como criar token permanente

1. Acesse [business.facebook.com](https://business.facebook.com)
2. **Configurações do negócio** (menu lateral) → **Usuários do sistema**
3. Clique em **Adicionar** → crie um usuário do sistema (ex.: "Chatbot WA")
4. Clique nos três pontos ao lado do usuário → **Gerar novo token**
5. Selecione o app **BF Marques Chatbot**
6. Marque as permissões:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
7. Gere o token e **copie** (não será exibido de novo)
8. Configure no Firebase:

```bash
cd "/Users/brunomarques/Downloads/Projetos/Exibicao e gerencia de Vendas"
firebase use site-interativo-b-f-marques
firebase functions:secrets:set WHATSAPP_TOKEN
# Cole o token permanente quando pedir
firebase deploy --only functions:chatbotWebhook
```

---

## Custos estimados

| Serviço | Custo mensal (~500 conversas) |
|---------|-------------------------------|
| WhatsApp API | R$ 0-200 (1000 grátis/mês) |
| Claude API | R$ 25-50 |
| Firebase Functions | Grátis |
| Firestore | Grátis |
| **Total** | **R$ 50-150/mês** |
