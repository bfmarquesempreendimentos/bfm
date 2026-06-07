# Campanha para corretores — criar template na Meta (passo a passo)

## O que é isso, em linguagem simples?

Quando a **Bia** (WhatsApp da empresa) **nunca conversou** com um corretor, a Meta **não deixa** mandar mensagem “livre” como no WhatsApp pessoal.

Você precisa de um **modelo de mensagem** (template) **aprovado** pela Meta. Isso é uma mensagem padrão que você cadastra uma vez; depois o sistema preenche nome, link do site, etc.

**Categoria Marketing:** avisos comerciais para corretores (ofertas, site atualizado, campanha semanal). É a categoria correta para essa campanha.

---

## Modo atual da campanha (painel)

Por padrão o sistema envia **só 1 mensagem de texto** (com nome do corretor, destaque, links) + **até 2 fotos e 1 vídeo** — **sem** abrir o template Meta antes.

O template `campanha_corretor_msg` só é usado **se** a Meta exigir (corretor sem conversa nas últimas 24 h). Nesse caso o texto completo vai no `{{1}}` e as mídias vêm em seguida, sem segunda mensagem repetida.

---

## Opção recomendada (template de fallback — 1 variável)

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

A Meta **não aceita** corpo só com `{{1}}`. A variável **não pode** ser a primeira nem a última linha — precisa de **texto fixo antes e depois**.

Use exatamente (3 blocos: fixo + variável + fixo):

```
Material oficial para corretores parceiros B F Marques Empreendimentos:

{{1}}

Obrigado pela parceria. Duvidas ou visitas: responda esta mensagem.
```

| Campo extra | Valor |
|-------------|--------|
| **Rodapé** | **Nenhum** (deixar vazio) |
| **Cabeçalho** | Nenhum |
| **Status** | **Ativo / Aprovado** (atualizado em jun/2026) |

O sistema envia no `{{1}}` o **mesmo texto** da campanha para quem já conversou com a Bia (layout completo com destaque, links, valores e Bruno).

### Amostra da variável {{1}} (obrigatório na Meta)

Na seção **Amostras de variáveis**, cole este exemplo em `{{1}}` (a Meta exige amostra para aprovar):

```
B F MARQUES EMPREENDIMENTOS
Material oficial para corretores — semana 23

Ola, Joao! Obrigado pela parceria.

Destaque desta semana: Edificio Cacador
Rua Alcio Souto, 576, Luiz Cacador, Sao Goncalo - RJ
Venda a partir de R$ 160.000,00. Engenharia ate R$193.000,00 (referencia do predio).
Minha Casa Minha Vida
Mapa: https://maps.app.goo.gl/N4CNvNQwx1KW8FCH6

Empreendimento (fotos, videos, unidades):
https://bfmarquesempreendimentos.github.io/bfm/?p=edificio-cacador

Portfolio completo:
https://bfmarquesempreendimentos.github.io/bfm/

A seguir: fotos e video do destaque para repassar ao cliente.
Suporte comercial: Bruno Marques (21) 99555-7010
```

Após o template, o sistema envia **uma mensagem de texto completa** (apresentação + link) e **fotos/vídeo** com legendas com preço e site.

**Importante:** sem `{{1}}` no corpo o WhatsApp só envia o texto fixo do modelo (sem site nem destaque). O corpo **precisa** ter `{{1}}` entre as linhas fixas.

Depois clique em **Enviar** / **Submit** e aguarde status **Aprovado** (Approved), em geral de algumas horas até 48 h.

---

## Templates de foto e video (corretor que nunca falou com a Bia)

A Meta **nao deixa** enviar foto/video livre fora da janela 24h. Para o Raphael receber midia igual ao Bruno, crie **dois modelos Marketing** aprovados:

### 1. `campanha_corretor_foto`

| Campo | Valor |
|--------|--------|
| **Categoria** | Marketing |
| **Idioma** | pt_BR |
| **Cabecalho** | **Imagem** (amostra: foto do empreendimento) |
| **Corpo** | `Material oficial B F Marques Empreendimentos.` |
| **Rodape** | Nenhum |

### 2. `campanha_corretor_video`

| Campo | Valor |
|--------|--------|
| **Categoria** | Marketing |
| **Idioma** | pt_BR |
| **Cabecalho** | **Video** (amostra: tour do empreendimento) |
| **Corpo** | `Tour virtual - B F Marques Empreendimentos.` |
| **Rodape** | Nenhum |

O sistema envia **ate 2 fotos** (template foto) + **1 video** (template video) logo apos o texto principal, automaticamente.

Nomes padrao no backend: `campanha_corretor_foto` e `campanha_corretor_video`.

---

## iPhone vs Android

O **mesmo texto** e enviado pela API da Meta para todos os aparelhos. Pequenas diferencas visuais (preview de link, negrito, "Ler mais") sao do app WhatsApp, nao do sistema. Usamos o mesmo layout em blocos com emojis nos dois modos.

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
| Erro vermelho no corpo só com `{{1}}` | A Meta exige texto fixo **antes e depois** da variável. Use o corpo de 3 blocos acima. |
| "Adicionar texto de amostra" | Preencha o exemplo completo em **Amostras de variáveis** → `{{1}}`. |
| Teste não chega | Confira se o telefone do corretor está com DDD + 9 dígitos no cadastro. |

---

## Quem não consegue acessar a Meta?

Peça para quem administra o **Meta Business** / **WhatsApp Business** da B F Marques criar o modelo com este arquivo e te passar o **nome exato** quando estiver **Aprovado**.
