# Configuração Facebook Developers - BF Marques Chatbot

## URLs para preencher no painel

Use exatamente estas URLs ao configurar o app **BF Marques Chatbot** no [Meta for Developers](https://developers.facebook.com).

### URLs obrigatórias

| Campo | URL |
|-------|-----|
| **Política de Privacidade** | `https://bfmarquesempreendimentos.github.io/bfm/privacidade.html` |
| **Termos de Serviço** | `https://bfmarquesempreendimentos.github.io/bfm/termos.html` |
| **URL de Exclusão de Dados** (Data Deletion) | `https://bfmarquesempreendimentos.github.io/bfm/exclusao-dados.html` |

### Webhook WhatsApp

| Campo | Valor |
|-------|-------|
| **URL de callback** | `https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/chatbotWebhook` |
| **Token de verificação** | Igual ao `WHATSAPP_VERIFY_TOKEN` definido no Firebase |

### Domínios do app

- `bfmarquesempreendimentos.github.io`
- `bfm` (se aplicável no contexto de domínio)

---

## Checklist de pendências

1. ✅ Política de Privacidade – URL criada e publicada
2. ✅ Termos de Serviço – URL criada e publicada
3. ✅ Exclusão de Dados – URL criada e publicada (LGPD/GDPR)
4. ⬜ Configurar domínios do app nas Configurações Básicas
5. ⬜ Adicionar ícone 1024×1024 (se solicitado)
6. ⬜ Definir categoria do app (ex: Business)
7. ⬜ Webhook WhatsApp configurado e verificado
8. ⬜ Inscrever-se em eventos: **messages**

---

## Passo a passo no painel

### Configurações Básicas
1. Acesse **App Dashboard** → **Configurações** → **Básico**
2. Cole as URLs de Política de Privacidade e Termos de Serviço
3. Adicione o domínio: `bfmarquesempreendimentos.github.io`

### WhatsApp → Webhook
1. **WhatsApp** → **Configuração** → **Webhook**
2. **Editar** ou **Configurar**
3. URL de callback: `https://us-central1-site-interativo-b-f-marques.cloudfunctions.net/chatbotWebhook`
4. Token de verificação: valor do secret `WHATSAPP_VERIFY_TOKEN`
5. Inscrever em: **messages**
6. **Verificar e salvar**

### Exclusão de Dados (Data Deletion)
1. Em **Configurações** ou **Recursos** do app, procure por **Data Deletion** ou **Exclusão de Dados**
2. Cole: `https://bfmarquesempreendimentos.github.io/bfm/exclusao-dados.html`
3. Salve

---

## Links diretos das páginas legais

- [Política de Privacidade](https://bfmarquesempreendimentos.github.io/bfm/privacidade.html)
- [Termos de Serviço](https://bfmarquesempreendimentos.github.io/bfm/termos.html)
- [Exclusão de Dados](https://bfmarquesempreendimentos.github.io/bfm/exclusao-dados.html)
