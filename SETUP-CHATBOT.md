# Setup do Chatbot WhatsApp - B F Marques

## Passo 1: Conta Meta Business

1. Acesse [business.facebook.com]()https://business.facebook.com
2. Crie ou use sua conta Meta Business existente
3. Verifique seu negócio (pode levar 1-3 dias)

## Passo 2: App no Meta for Developers

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Clique em "Meus Apps" → "Criar App"
3. Escolha tipo "Business" → Preencha nome: "BF Marques Chatbot"
4. No painel do app, clique em "Adicionar produto" → "WhatsApp" → "Configurar"
5. Vincule sua conta Meta Business

## Passo 3: Número de teste (para desenvolvimento)

1. No painel WhatsApp do app, vá em "Primeiros passos"
2. Você receberá um número de teste e um token temporário
3. Adicione seu número pessoal como destinatário de teste

## Passo 4: Token permanente (System User)

1. Em business.facebook.com → Configurações → Usuários do sistema
2. Crie um "Usuário do sistema" com permissão de admin
3. Gere um token com as permissões:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
4. Copie e guarde o token gerado

## Passo 5: Chave API Anthropic (Claude)

1. Acesse [console.anthropic.com](https://console.anthropic.com)
2. Crie uma conta e adicione créditos (mínimo US$5)
3. Vá em "API Keys" → "Create Key"
4. Copie a chave gerada (formato: `sk-ant-...`)

## Passo 6: Firebase Blaze Plan

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Selecione o projeto `site-interativo-b-f-marques`
3. Vá em Configurações → Uso e faturamento → Mudar plano
4. Selecione "Blaze (pague pelo uso)"
5. Necessário para Functions fazerem chamadas HTTP externas

## Passo 7: Configurar secrets no Firebase

Execute no terminal:

```bash
cd functions

# Token do WhatsApp Business API
firebase functions:secrets:set WHATSAPP_TOKEN
# Cole o token do passo 4

# Verify Token (crie uma string aleatória)
firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN
# Ex: bfmarques_chatbot_2024_xyz

# Phone Number ID (encontre no painel do app Meta)
firebase functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
# Ex: 123456789012345

# Chave API Anthropic
firebase functions:secrets:set ANTHROPIC_API_KEY
# Cole a chave do passo 5
```

## Passo 8: Configurar webhook no Meta

1. Deploy das functions: `firebase deploy --only functions`
2. Copie a URL do webhook: `https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/chatbotWebhook`
3. No painel do app Meta → WhatsApp → Configuração
4. Em "Webhook", clique "Editar"
5. URL de callback: cole a URL acima
6. Token de verificação: o mesmo valor que definiu em `WHATSAPP_VERIFY_TOKEN`
7. Clique "Verificar e salvar"
8. Inscreva-se no campo: `messages`

## Passo 9: Testar

1. Envie uma mensagem para o número de teste do WhatsApp
2. O chatbot deve responder com a saudação inicial
3. Verifique os logs: `firebase functions:log`

## Custos estimados

| Serviço | Custo mensal (~500 conversas) |
|---------|-------------------------------|
| WhatsApp API | R$ 0-200 (1000 grátis/mês) |
| Claude API | R$ 25-50 |
| Firebase Functions | Grátis |
| Firestore | Grátis |
| **Total** | **R$ 50-150/mês** |
