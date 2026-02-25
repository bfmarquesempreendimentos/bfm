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

## Diagnóstico (verificar se está tudo configurado)

Após o deploy, acesse no navegador:

```
https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/chatbotWebhook?diagnostic=1
```

A resposta mostrará se os secrets estão definidos. Se **WHATSAPP_PHONE_NUMBER_ID** estiver "FALTANDO", o chatbot usa o `phone_number_id` do payload (número que recebeu a mensagem), mas o ideal é configurar o secret.

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Erro wabalD ao adicionar número | Use Embedded Signup ou apenas o número de teste do Meta |
| Webhook não verifica | Confirme que `hub.verify_token` é igual ao secret WHATSAPP_VERIFY_TOKEN |
| Bot não responde | Verifique os logs: `firebase functions:log` e a URL `?diagnostic=1` |
| Número de teste não funciona | Confirme que seu celular está como destinatário de teste no painel Meta |

---

## Custos estimados

| Serviço | Custo mensal (~500 conversas) |
|---------|-------------------------------|
| WhatsApp API | R$ 0-200 (1000 grátis/mês) |
| Claude API | R$ 25-50 |
| Firebase Functions | Grátis |
| Firestore | Grátis |
| **Total** | **R$ 50-150/mês** |
