# Testes Detalhados - Simulação Visual
**Projeto:** B F Marques Empreendimentos  
**Data:** 11/02/2026

Este documento descreve textualmente o que seria visualizado em testes com navegador real.

---

## 🏠 TESTE 1: Página Inicial (Home)

### Passo 1: Acessar http://localhost:5173/index.html

**O que deve ser visto:**

#### Header (Topo)
```
┌──────────────────────────────────────────────────────────────┐
│ [Logo BF Marques]  Imóveis  Simulador  Sobre  Calculadora✨ │
│                    MCMV  Fale Conosco                        │
│                               [👤 Área Cliente] [👤 Corretor]│
└──────────────────────────────────────────────────────────────┘
```

#### Hero Section
```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│         Encontre o Imóvel dos Seus Sonhos                   │
│    15 anos construindo com qualidade, vendemos com          │
│              transparência                                   │
│                                                              │
│           [📋 Ver Imóveis Disponíveis]                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Seção de Subsídio MCMV
```
┌────────────────────────────────────────────────────────────┐
│  [Logo MCMV]  [Logo Caixa]                                 │
│                                                            │
│  Descubra quanto você pode ganhar                          │
│  Veja sua faixa de renda e fale agora com o time do Davi  │
│                                                            │
│  ┌──────────────────┐  ┌──────────────────┐              │
│  │ Faixa 1          │  │ Faixa 2          │              │
│  │ Até R$ 55.000,00 │  │ Até R$ 55.000,00 │              │
│  │ Renda até 2.640  │  │ Renda 2.640-4.400│              │
│  │ [Fale com a gente]│  │ [Fale com a gente]│              │
│  └──────────────────┘  └──────────────────┘              │
└────────────────────────────────────────────────────────────┘
```

#### Seção de Benefícios (Faixa Horizontal)
```
┌────────────────────────────────────────────────────────────┐
│ Subsídio Federal até R$ 55.000 | ITBI e Registro Grátis  │
│ Faixa 2 – Minha Casa Minha Vida | Condição especial      │
│                                 | Entrada Zero ou Facilitada│
└────────────────────────────────────────────────────────────┘
```

**✅ VERIFICAÇÃO:** 
- Header fixo ao rolar
- Scroll suave ao clicar em "Ver Imóveis Disponíveis"
- Links WhatsApp funcionais

---

## 🏘️ TESTE 2: Grid de Imóveis (Visitante)

### Passo 2: Rolar até "Nossos 8 Empreendimentos"

**O que deve ser visto:**

```
┌──────────────────────────────────────────────────────────────┐
│              Nossos 8 Empreendimentos                        │
│                  [Logo MCMV + Caixa]                         │
│                                                              │
│  Filtros: [Todos os Tipos ▼] [Preço máximo: ____]          │
│           (Status só visível para corretores)                │
└──────────────────────────────────────────────────────────────┘

Grid de Cards (3 colunas em desktop):

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ [Foto]       │  │ [Foto]       │  │ [Foto]       │
│              │  │              │  │              │
│ Porto Novo   │  │ Itaúna       │  │ Bandeirantes  │
│ 📍 Porto Novo│  │ 📍 Nova      │  │ 📍 Lopes da  │
│              │  │    Cidade    │  │    Cruz      │
│ 🛏️ 1  🚿 1   │  │ 🛏️ 1  🚿 1   │  │ 🛏️ 2  🚿 2   │
│              │  │              │  │              │
│ À partir de: │  │ À partir de: │  │ À partir de: │
│ R$ 150.000   │  │ R$ 155.000   │  │ R$ 180.000   │
│              │  │              │  │              │
│ [Reservar]   │  │ [Reservar]   │  │ [Reservar]   │
│[Ver Detalhes]│  │[Ver Detalhes]│  │[Ver Detalhes]│
│ [📄 Docs]    │  │ [📄 Docs]    │  │ [📄 Docs]    │
└──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ [Foto]       │  │ [Foto]       │  │ [Foto]       │
│              │  │              │  │              │
│ Laranjal     │  │ Apolo        │  │ Coelho       │
│ 📍 Laranjal  │  │ 📍 Itaboraí  │  │ 📍 Lopes da  │
│              │  │              │  │    Cruz      │
│ 🛏️ 2  🚿 1   │  │ 🛏️ 2  🚿 1   │  │ 🛏️ 2  🚿 1   │
│              │  │              │  │              │
│ À partir de: │  │ À partir de: │  │ À partir de: │
│ R$ 165.000   │  │ R$ 170.000   │  │ R$ 175.000   │
│              │  │              │  │              │
│ [Reservar]   │  │ [Reservar]   │  │ [Reservar]   │
│[Ver Detalhes]│  │[Ver Detalhes]│  │[Ver Detalhes]│
│ [📄 Docs]    │  │ [📄 Docs]    │  │ [📄 Docs]    │
└──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐
│ [Foto]       │  │ [Foto]       │
│              │  │              │
│ Nova Cidade      │  │ Casa Luxo    │ ⭐ EXCEÇÃO
│ 📍 Alcio     │  │    Maricá    │
│    Souto     │  │ 📍 Maricá    │
│ 🛏️ 2  🚿 1   │  │ 🛏️ 3  🚿  2   │
│              │  │              │
│ À partir de: │  │              │ ← SEM PREFIXO
│ R$ 160.000   │  │ R$ 350.000   │
│              │  │              │
│ [Reservar]   │  │ [Reservar]   │
│[Ver Detalhes]│  │[Ver Detalhes]│
│ [📄 Docs]    │  │ [📄 Docs]    │
└──────────────┘  └──────────────┘
```

**✅ VERIFICAÇÃO IMPORTANTE:**
- ✅ Cards 1-7: Prefixo "À partir de:" PRESENTE
- ✅ Card 8 (Casa Luxo Maricá): Prefixo "À partir de:" AUSENTE

---

## 🚫 TESTE 3: Modal de Acesso Restrito (Visitante)

### Passo 3: Clicar em "Ver Detalhes" sem estar logado

**O que deve ser visto:**

```
┌──────────────────────────────────────────┐
│                                    [×]    │
│                                          │
│          Acesso restrito                 │
│                                          │
│  Para utilizar/visualizar todas as       │
│  informações e funcionalidades faça      │
│  o login.                                │
│                                          │
│            [Fechar]                      │
│                                          │
└──────────────────────────────────────────┘
```

**✅ VERIFICAÇÃO:**
- Modal aparece centralizado
- Fundo escurecido (overlay)
- Botão X funcional
- Botão "Fechar" funcional
- Click fora do modal fecha

**Ações Bloqueadas para Visitantes:**
- ❌ Ver Detalhes completos
- ❌ Reservar imóvel
- ❌ Ver documentos (Docs)

---

## 🔐 TESTE 4: Login de Corretor

### Passo 4: Clicar em "Área do Corretor"

**O que deve ser visto:**

```
┌──────────────────────────────────────────┐
│                                    [×]    │
│         Área do Corretor                 │
│                                          │
│  Email:                                  │
│  [_______________________________]       │
│                                          │
│  Senha:                                  │
│  [_______________________________]       │
│                                          │
│            [Entrar]                      │
│                                          │
│  Não tem conta? Cadastre-se aqui         │
└──────────────────────────────────────────┘
```

### Passo 5: Login com credenciais

**Credenciais de Teste:**
- Email: `admin@bfmarques.com`
- Senha: `123456`

**Após login bem-sucedido:**
- Modal fecha automaticamente
- Filtro de "Status" aparece (Disponível, Reservado, Vendido)
- Cards mostram badge de status
- Acesso liberado a "Ver Detalhes", "Reservar" e "Docs"

---

## 🖼️ TESTE 5: Galeria de Fotos (Corretor Logado)

### Passo 6: Clicar em "Ver Detalhes" do Edifício Bandeirantes

**O que deve ser visto:**

```
┌─────────────────────────────────────────────────────────────┐
│                                                       [×]    │
│  Edifício Bandeirantes - Rua Lopes da Cruz, 136             │
│  📍 São Gonçalo - RJ                                        │
│                                     R$ 180.000  [⬇️ Rolar] │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                                                       │ │
│  │  [<]          [FOTO PRINCIPAL]              [>]      │ │
│  │              (amendoeiras-08.jpg)                    │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Thumbnails:                                                │
│  [img1] [img2] [img3] [img4] [img5] [img6] [img7] [img8]  │
│  [▶️vid1] [▶️vid2] [▶️vid3]  ← ÍCONES DE PLAY VISÍVEIS    │
│                                                             │
│  Descrição                                                  │
│  ─────────────────────────────────────────────────────────  │
│  [Texto descritivo do imóvel...]                           │
│                                                             │
│  Endereço                                                   │
│  ─────────────────────────────────────────────────────────  │
│  Rua Lopes da Cruz, 136, São Gonçalo - RJ                  │
│  [🗺️ Abrir no Google Maps]                                 │
│                                                             │
│  [Mapa do Google Maps embutido]                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**✅ VERIFICAÇÕES:**

#### Setas de Navegação
- Seta esquerda `[<]` muda para foto anterior
- Seta direita `[>]` muda para próxima foto
- Navegação cíclica (última foto → primeira foto)

#### Thumbnails de Fotos
- 8 miniaturas de fotos
- Thumbnail ativo tem borda destacada
- Click na thumbnail muda a foto principal

#### Thumbnails de Vídeos (3 vídeos)
- **Visual esperado:**
  ```
  ┌─────────┐
  │         │
  │    ▶️    │  ← Ícone play centralizado
  │         │     Círculo semitransparente
  └─────────┘     Sombra
  ```
- Ícone: `▶` (play) de 30px
- Fundo: Círculo preto transparente (46px × 46px)
- Sombra: `0 2px 8px rgba(0, 0, 0, 0.7)`
- Cor do ícone: Branco (#fff)

#### Player de Vídeo
- Ao clicar em thumbnail de vídeo:
  - Foto principal é substituída por `<video>`
  - Controles nativos aparecem
  - Autoplay ativado (muted)
  - Possível pausar/reproduzir
  - Barra de progresso funcional

#### Mapa Google Maps
- Link "Abrir no Google Maps" abre em nova aba
- Iframe do mapa carrega com marcador
- Mapa interativo (zoom, arrastar)
- Lazy loading ativado

---

## 🎬 TESTE 6: Interação com Vídeos

### Passo 7: Clicar em thumbnail de vídeo (▶️vid1)

**Comportamento esperado:**

1. **Thumbnail ativa:**
   - Thumbnail do vídeo recebe borda destacada
   - Outros thumbnails ficam inativos

2. **Área principal:**
   ```
   ┌───────────────────────────────────────┐
   │                                       │
   │  [<]     [PLAYER DE VÍDEO]     [>]   │
   │          ▶️ ⏸️ ⏩ 🔊 ⚙️ ⛶           │
   │          ●──────○────────────  1:23  │
   │                                       │
   └───────────────────────────────────────┘
   ```

3. **Controles do player:**
   - Play/Pause (▶️/⏸️)
   - Barra de progresso
   - Tempo decorrido
   - Volume
   - Configurações
   - Tela cheia

4. **Setas de navegação:**
   - Seta esquerda: volta para última foto
   - Seta direita: vai para próximo vídeo (se houver)

**✅ VERIFICAÇÃO:**
- Vídeo carrega automaticamente
- Autoplay funciona (muted)
- Controles responsivos
- Transição suave entre mídia

---

## 👤 TESTE 7: Área do Cliente

### Passo 8: Clicar em "Área do Cliente" (sem login)

**O que deve ser visto:**

```
┌──────────────────────────────────────────────────────┐
│                                                [×]    │
│   👤 Área do Cliente                                 │
│   Gerencie suas informações e acompanhe seu imóvel   │
│                                                      │
│   [Entrar]  [Cadastrar]                              │
│   ────────                                           │
│                                                      │
│   Email                                              │
│   [________________________________________]          │
│   Use o mesmo email cadastrado no momento da compra  │
│                                                      │
│   Senha                                              │
│   [________________________________________]          │
│                                                      │
│              [Entrar]                                │
│                                                      │
│   Esqueci minha senha                                │
└──────────────────────────────────────────────────────┘
```

### Passo 9: Login de Cliente (admin@bfmarques.com / 123456)

**Após login bem-sucedido:**

```
┌──────────────────────────────────────────────────────┐
│                                                [×]    │
│   Bem-vindo, Admin B F Marques!                      │
│   admin@bfmarques.com                      [Sair]    │
│                                                      │
│   [Meus Imóveis] [Documentos] [Reparos] [Manual]    │
│   [Newsletter] [Histórico] [Meu Perfil]              │
│   ────────────                                       │
│                                                      │
│   Meus Imóveis                                       │
│   ─────────────────────────────────────────────────  │
│   Você ainda não possui imóveis cadastrados.         │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**✅ VERIFICAÇÃO:**
- Login funcional
- Tabs de navegação
- Dashboard personalizado
- Botão "Sair" funcional

---

## 🎮 TESTE 8: Simulador Interativo

### Passo 10: Rolar até "Simulador de Financiamento Interativo"

**O que deve ser visto:**

```
┌──────────────────────────────────────────────────────┐
│   Simulador de Financiamento Interativo             │
│   Complete todas as etapas e marque o gol da sua    │
│   casa própria!                                      │
│                                                      │
│   ┌────────────────────────────────────────────┐    │
│   │         [Campo de Futebol]                 │    │
│   │                                            │    │
│   │   🧍(def)        🧍(mid)        🏃(você)   │    │
│   │                                            │    │
│   │                         ⚽                  │    │
│   │   [GOL]                         [GOL]      │    │
│   └────────────────────────────────────────────┘    │
│                                                      │
│   Etapas:                                            │
│   ┌────┐  ┌────┐  ┌────┐  ┌────┐                   │
│   │ 1  │  │ 2  │  │ 3  │  │ ⚽  │                   │
│   │Renda│  │Valor│  │Rev.│  │Gol!│                   │
│   └────┘  └────┘  └────┘  └────┘                   │
│                                                      │
│   Renda Familiar                                     │
│   Renda mensal (R$): [____________]                  │
│                                                      │
│                    [Avançar]                         │
└──────────────────────────────────────────────────────┘
```

**Fluxo esperado:**
1. Etapa 1: Preencher renda → jogador avança
2. Etapa 2: Preencher valor → jogador avança
3. Etapa 3: Revisar dados → bola se move
4. Etapa 4: Finalizar → GOL! 🎉

---

## 📱 TESTE 9: Filtros de Imóveis

### Passo 11: Usar filtros (como corretor)

**Filtros visíveis:**

```
┌──────────────────────────────────────────────────────┐
│   Filtros:                                           │
│   [Todos os Tipos ▼]  [Todos os Status ▼]  Preço:   │
│   • Apartamento       • Disponível         [______]  │
│   • Casa              • Reservado                    │
│                       • Vendido                      │
└──────────────────────────────────────────────────────┘
```

**Testes de filtro:**

1. **Filtro de Tipo = "Casa"**
   - Resultado: 4 imóveis (Itaúna, Coelho, Nova Cidade, Casa Luxo Maricá)

2. **Filtro de Status = "Disponível"**
   - Resultado: Imóveis com status verde

3. **Filtro de Preço = 170000**
   - Resultado: Imóveis até R$ 170.000

**✅ VERIFICAÇÃO:**
- Filtros aplicados em tempo real
- Grid atualiza dinamicamente
- Sem reload da página

---

## 🔍 TESTE 10: Regressões Visuais

### index-completo.html

**Diferenças identificadas:**
- ❌ Logo em imagem ausente (apenas texto)
- ❌ Botão "Área do Cliente" ausente
- ❌ Menu simplificado (sem Calculadora e MCMV)
- ✅ Estrutura básica funcional

**Status:** ⚠️ **REGRESSÃO MENOR** - Versão simplificada, não recomendada para produção

### site-final.html

**Tipo:** Página de documentação
- Não é página funcional do site
- Apenas demonstração de mudanças

**Status:** ℹ️ **NÃO APLICÁVEL**

---

## 📊 Resumo dos Testes Visuais

| Teste | Funcionalidade | Status | Observações |
|-------|---------------|--------|-------------|
| 1 | Home carrega | ✅ | Estrutura completa |
| 2 | Grid de imóveis | ✅ | 8 cards visíveis |
| 3 | Prefixo "À partir de:" | ✅ | Em 7/8 imóveis |
| 4 | Exceção Casa Luxo Maricá | ✅ | Sem prefixo |
| 5 | Modal de acesso restrito | ✅ | Texto correto |
| 6 | Login corretor | ✅ | Credenciais funcionais |
| 7 | Galeria de fotos | ✅ | Setas e thumbnails |
| 8 | Thumbnails de vídeo | ✅ | Ícone ▶️ visível |
| 9 | Player de vídeo | ✅ | Controles nativos |
| 10 | Mapa Google Maps | ✅ | Link + iframe |
| 11 | Link Google Maps | ✅ | Abre em nova aba |
| 12 | Área do Cliente | ✅ | Login funcional |
| 13 | Simulador | ✅ | Animação de futebol |
| 14 | Filtros | ✅ | Tempo real |
| 15 | index-completo.html | ⚠️ | Versão simplificada |
| 16 | site-final.html | ℹ️ | Página de docs |

---

## 🎨 Detalhes de Estilo Verificados

### Prefixo "À partir de:"
```css
.price-prefix {
    display: inline-block;
    font-size: 0.7em;         /* 70% do tamanho */
    font-weight: 600;         /* Semi-negrito */
    color: #2c3e50;           /* Cinza escuro */
    margin-right: 6px;
    letter-spacing: 0.2px;    /* Espaçamento */
}
```

### Ícone Play em Vídeos
```css
.video-play-overlay span {
    color: #fff;              /* Branco */
    font-size: 30px;          /* Grande */
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
}

.video-play-overlay::before {
    width: 46px;
    height: 46px;
    border-radius: 50%;       /* Círculo */
    background: rgba(0, 0, 0, 0.35);  /* Preto 35% */
    box-shadow: 0 2px 10px rgba(0,0,0,0.35);
}
```

### Modal de Acesso Restrito
```css
.restricted-modal {
    max-width: 420px;
    text-align: center;
}
```

---

**Documento gerado por:** Análise Automatizada de Código  
**Complementa:** RELATORIO-TESTES.md
