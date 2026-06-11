# Guia – Templates de mensagem no WhatsApp (Meta)

Este guia explica como **criar**, **gerenciar** e **enviar** Message Templates do WhatsApp no painel da Meta, e como usar um **número de teste** para o App Review.

---

## 1. Onde ficam os templates

- **Meta for Developers:** [developers.facebook.com](https://developers.facebook.com) → seu app (**BF Marques Chatbot**) → menu **WhatsApp** → **Message templates** (ou **Configuração** → **Modelos de mensagem**).
- Ou pelo **Meta Business Suite:** WhatsApp Manager → conta Business vinculada ao app → **Modelos de mensagem**.

No painel você vê a **lista de templates**, com **nome**, **idioma**, **categoria** e **status** (Approved / Pending / Rejected).

---

## 2. Criar um novo template

1. No app, em **WhatsApp** → **Message templates**, clique em **Create template** (ou **Criar modelo**).
2. Preencha:
   - **Name:** nome interno (ex.: `follow_up_reminder`). Use apenas letras minúsculas, números e underscore.
   - **Category:** Utility, Marketing ou Authentication (conforme o uso).
   - **Language:** ex. Portuguese (Brazil).
   - **Body:** texto da mensagem. Você pode usar variáveis, ex.: `Olá {{1}}, este é um lembrete sobre seu interesse em nossos imóveis.`
   - **Header / Buttons / Footer:** opcionais, conforme o tipo de template.
3. Clique em **Submit** (Enviar para revisão). O status passará a **Pending** até a Meta aprovar.
4. Quando o status mudar para **Approved**, o template poderá ser usado para envio.

**Dica:** Siga as [políticas de template da Meta](https://developers.facebook.com/docs/whatsapp/message-templates/guidelines). Evite spam, conteúdo enganoso ou uso de categoria errada.

---

## 3. Gerenciar e ver aprovação

- **Lista de templates:** em **Message templates** você vê todos os modelos e o **status** (Approved, Pending, Rejected).
- **Aprovado:** pode ser usado na API para enviar mensagens.
- **Pendente:** aguardando revisão da Meta (geralmente 24–48 h).
- **Rejeitado:** não pode ser usado; leia o motivo e crie uma nova versão ou outro template.

Não é possível editar um template já aprovado; para mudar o texto, crie um novo template (ou nova versão, se o produto permitir).

---

## 4. Enviar template para número de teste

Você precisa enviar uma mensagem **usando um template aprovado** para um **número de teste** (para o App Review ou para testes no dia a dia).

### 4.1 Cadastrar número de teste

1. No **App Dashboard** → **Roles** (ou **WhatsApp** → **API Setup**), procure por **Test numbers** ou **Números de teste**.
2. Adicione o número do celular que receberá o template (com DDI, ex.: 5521999999999).
3. Confirme o número pelo código que a Meta envia no WhatsApp.

### 4.2 Enviar pelo painel (se disponível)

- Em **WhatsApp** → **API Setup** ou **Send and receive messages**, procure a opção **"Send message"** / **"Enviar mensagem"**.
- Se houver suporte a **template**, escolha o template aprovado, preencha os parâmetros (ex.: `{{1}}` = nome) e o número de destino (use o número de teste).
- Envie e confira no WhatsApp do celular de teste se a mensagem chegou.

### 4.3 Enviar pela API (Cloud API)

Se o painel não tiver “Enviar com template”, use a API. Exemplo de corpo de requisição (POST para `https://graph.facebook.com/v22.0/{phone_number_id}/messages`):

```json
{
  "messaging_product": "whatsapp",
  "to": "5521999999999",
  "type": "template",
  "template": {
    "name": "nome_do_template",
    "language": { "code": "pt_BR" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "João" }
        ]
      }
    ]
  }
}
```

Substitua:
- `phone_number_id` pelo ID do número de WhatsApp do app (ex.: em **WhatsApp** → **API Setup**).
- `to` pelo número de teste (apenas dígitos, com DDI).
- `name` pelo nome do template aprovado.
- `parameters` conforme as variáveis do template (ex.: `{{1}}` = primeiro parâmetro).

Use o token de acesso permanente do app no header: `Authorization: Bearer {access_token}`.

---

## 5. Resumo para o App Review

Para o vídeo e o formulário do App Review:

1. **Criar/Selecionar template:** mostre a tela **Message templates** e um template aprovado (ou crie um e mostre o envio para revisão).
2. **Aprovação/Gestão:** mostre a lista com a coluna **Status** (Approved) e diga que só usamos templates aprovados.
3. **Envio para teste:** mostre o envio (pelo painel ou pela API) para o número de teste e o celular recebendo a mensagem.

Use o roteiro em **APP-REVIEW-SCREENCAST-SCRIPT.md** para gravar o screencast e o texto em **APP-REVIEW-INSTRUCTIONS.md** no campo de instruções do revisor.
