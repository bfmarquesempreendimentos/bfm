# Campanha para corretores — criar template na Meta (passo a passo)

## O que é isso, em linguagem simples?

Quando a **Bia** (WhatsApp da empresa) **nunca conversou** com um corretor, a Meta **não deixa** mandar mensagem “livre” como no WhatsApp pessoal.

Você precisa de um **modelo de mensagem** (template) **aprovado** pela Meta. Isso é uma mensagem padrão que você cadastra uma vez; depois o sistema preenche nome, link do site, etc.

**Categoria Marketing:** avisos comerciais para corretores (ofertas, site atualizado, campanha semanal). É a categoria correta para essa campanha.

---

## Opção recomendada (mais fácil — 1 variável só)

A Meta costuma aprovar mais rápido modelos simples.

### Dados para preencher na Meta

| Campo | O que colocar |
|--------|----------------|
| **Nome do template** | `campanha_corretor_msg` |
| **Categoria** | **Marketing** |
| **Idioma** | **Português (Brasil)** — código `pt_BR` |
| **Cabeçalho** | Nenhum |
| **Rodapé** | Nenhum |
| **Botões** | Nenhum |

### Texto do corpo (copie e cole)

A Meta **não aceita** variável no final. Use exatamente:

```
🏡 B F Marques Empreendimentos

{{1}}

Equipe comercial parceira.
```

(A última linha fixa depois do `{{1}}` remove o erro em vermelho.)

A Meta vai pedir **exemplo** para a variável `{{1}}`. Cole isto (o sistema preenche automaticamente com destaque da semana, site e dica MCMV):

```
Olá, João! Semana B F Marques 🏡

⭐ DESTAQUE DA SEMANA
🏠 Residencial Itaúna
📍 Nova Cidade, São Gonçalo - RJ
💰 R$ 155.000,00
✅ Aceita Minha Casa Minha Vida

🌐 Todos os imóveis: https://bfmarquesempreendimentos.github.io/bfm/
📷 Em seguida enviamos fotos e vídeo deste empreendimento.
Suporte: (21) 99759-0814
```

**Importante:** sem `{{1}}` no corpo o WhatsApp só envia o texto fixo do modelo (sem site nem destaque). O corpo **precisa** ter `{{1}}` entre as linhas fixas.

Depois clique em **Enviar** / **Submit** e aguarde status **Aprovado** (Approved), em geral de algumas horas até 48 h.

---

## Opção formatada (5 variáveis — mensagem mais organizada)

Use só se quiser título, link e dica em campos separados.

| Campo | Valor |
|--------|--------|
| **Nome** | `atualizacao_semanal_corretor` |
| **Categoria** | Marketing |
| **Idioma** | Português (Brasil) |

### Corpo

```
Olá, {{1}}! 👋

🏡 *{{2}}*

📢 Site: {{3}}

💡 {{4}}

✅ Suporte: {{5}}

B F Marques Empreendimentos
```

### Exemplos para a Meta (na ordem {{1}} a {{5}})

1. `João`
2. `Atualização semanal B F Marques`
3. `https://bfmarquesempreendimentos.github.io/bfm/`
4. `Responda seus leads no mesmo dia para converter mais.`
5. `(21) 99759-0814`

---

## Onde clicar na Meta (passo a passo)

1. Abra **[business.facebook.com](https://business.facebook.com)** ou **[developers.facebook.com](https://developers.facebook.com)** e entre com a conta da empresa.
2. Vá em **WhatsApp Manager** (Gerenciador do WhatsApp)  
   — ou no app **BF Marques Chatbot** → menu **WhatsApp** → **Modelos de mensagem** / **Message templates**.
3. Clique em **Criar modelo** / **Create template**.
4. Preencha com a tabela acima (opção fácil: `campanha_corretor_msg`).
5. **Enviar para análise** e espere ficar **Aprovado** (verde).

Não use o nome `Bruno` — esse nome não existe na sua conta e gera erro **132001**.

---

## Depois de aprovado — configurar o painel

1. Atualize a página do admin (Ctrl+F5).
2. Menu **Corretores** → abra **Configuração da mensagem**.
3. No campo **Template Meta**, digite **exatamente** (minúsculas):
   - `campanha_corretor_msg` (opção fácil), **ou**
   - `atualizacao_semanal_corretor` (opção 5 variáveis).
4. O campo deve mostrar aviso **verde** “Template OK”.
5. **Salvar configuração** → **Testar** em 1 corretor → **Disparar agora**.

Se o painel listar outros nomes ao clicar no campo, pode escolher um **aprovado** da lista.

---

## Problemas comuns

| Problema | Solução |
|----------|---------|
| Erro 132001 | Nome do template errado ou ainda não aprovado. Confira o nome na Meta e no painel. |
| Status Pendente | Aguarde aprovação; não dá para enviar antes. |
| Rejeitado | Leia o motivo na Meta; crie outro modelo sem palavras promocionais exageradas. |
| Teste não chega | Confira se o telefone do corretor está com DDD + 9 dígitos no cadastro. |

---

## Quem não consegue acessar a Meta?

Peça para quem administra o **Meta Business** / **WhatsApp Business** da B F Marques criar o modelo com este arquivo e te passar o **nome exato** quando estiver **Aprovado**.
