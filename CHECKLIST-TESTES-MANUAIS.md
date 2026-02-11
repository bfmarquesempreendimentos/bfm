# ✅ Checklist de Testes Manuais
**Projeto:** B F Marques Empreendimentos  
**URL:** http://localhost:5173/index.html

Use este checklist para testes manuais no navegador.

---

## 🔐 Credenciais de Teste

### Corretor/Admin
- **Email:** `admin@bfmarques.com`
- **Senha:** `123456`

### Cliente (Área do Cliente)
- **Email:** `admin@bfmarques.com`
- **Senha:** `123456`

---

## 📋 PARTE 1: Testes como Visitante (Não Logado)

### 1.1 Home Page
- [ ] Acessar http://localhost:5173/index.html
- [ ] Header aparece com logo "B F Marques"
- [ ] Menu tem 6 itens: Imóveis, Simulador, Sobre, Calculadora✨, MCMV, Fale Conosco
- [ ] Botões "Área do Cliente" e "Área do Corretor" visíveis no header
- [ ] Hero section exibe título "Encontre o Imóvel dos Seus Sonhos"
- [ ] Subtítulo: "15 anos construindo com qualidade, vendemos com transparência"
- [ ] Botão "Ver Imóveis Disponíveis" funcional (rola para seção de imóveis)

### 1.2 Seção de Subsídio MCMV
- [ ] Logos MCMV e Caixa visíveis
- [ ] Faixa 1 mostra "Até R$ 55.000,00" e "Renda até R$ 2.640,00"
- [ ] Faixa 2 mostra "Até R$ 55.000,00" e "Renda entre R$ 2.640,01 e R$ 4.400,00"
- [ ] Botões "Fale com a gente" abrem WhatsApp
- [ ] Seção "ITBI e Registro Grátis" visível
- [ ] Imagem de presente decorativo aparece

### 1.3 Faixa de Benefícios
- [ ] 3 benefícios exibidos horizontalmente
- [ ] Textos legíveis e bem formatados

### 1.4 Grid de Imóveis (8 Empreendimentos)
- [ ] Título "Nossos 8 Empreendimentos" visível
- [ ] Logo MCMV + Caixa acima dos filtros
- [ ] **8 cards de imóveis exibidos**
- [ ] Filtros disponíveis: "Todos os Tipos" e "Preço máximo"
- [ ] **Filtro "Status" NÃO visível** (apenas para corretores)

### 1.5 Prefixo "À partir de:" nos Cards
**⭐ TESTE CRÍTICO**

- [ ] **Card 1 - Porto Novo:** Prefixo "À partir de:" **PRESENTE** ✅
- [ ] **Card 2 - Itaúna:** Prefixo "À partir de:" **PRESENTE** ✅
- [ ] **Card 3 - Amendoeiras:** Prefixo "À partir de:" **PRESENTE** ✅
- [ ] **Card 4 - Laranjal:** Prefixo "À partir de:" **PRESENTE** ✅
- [ ] **Card 5 - Apolo:** Prefixo "À partir de:" **PRESENTE** ✅
- [ ] **Card 6 - Coelho:** Prefixo "À partir de:" **PRESENTE** ✅
- [ ] **Card 7 - Caçador:** Prefixo "À partir de:" **PRESENTE** ✅
- [ ] **Card 8 - Casa Luxo Maricá:** Prefixo "À partir de:" **AUSENTE** ✅

**Formato esperado:**
```
Card 1-7:          Card 8 (Casa Luxo):
À partir de:       (sem prefixo)
R$ 150.000         R$ 350.000
```

### 1.6 Elementos dos Cards
Para cada card:
- [ ] Imagem principal carrega
- [ ] Título do empreendimento
- [ ] Ícone de localização (📍) + endereço
- [ ] Ícone de quartos (🛏️) + número
- [ ] Ícone de banheiros (🚿) + número
- [ ] Preço formatado em Real (R$)
- [ ] Botão "Reservar" visível
- [ ] Botão "Ver Detalhes" visível
- [ ] Botão "Docs" (📄) visível

### 1.7 Modal de Acesso Restrito
**⭐ TESTE CRÍTICO**

- [ ] Clicar em "Ver Detalhes" de qualquer imóvel
- [ ] **Modal aparece** com título "Acesso restrito"
- [ ] Texto: "Para utilizar/visualizar todas as informações e funcionalidades faça o login."
- [ ] Botão "Fechar" funcional
- [ ] Botão X (×) funcional
- [ ] Clicar fora do modal fecha
- [ ] Repetir teste clicando em "Reservar"
- [ ] Repetir teste clicando em "Docs" (📄)

### 1.8 Simulador Interativo
- [ ] Rolar até seção "Simulador de Financiamento Interativo"
- [ ] Campo de futebol visível
- [ ] Jogador animado (🏃) visível
- [ ] Bola (⚽) visível
- [ ] NPCs (defensor e meio-campo) visíveis
- [ ] 4 etapas numeradas (1, 2, 3, ⚽)
- [ ] Campo "Renda mensal" na etapa 1
- [ ] Botão "Avançar" funcional

### 1.9 Seção Sobre
- [ ] Título "Sobre a B F Marques Empreendimentos"
- [ ] Texto descritivo visível
- [ ] Estatísticas: 8 Empreendimentos, 98% Satisfação, 15 Anos
- [ ] Foto do escritório carrega

### 1.10 Footer
- [ ] Footer visível no final da página
- [ ] Links funcionais
- [ ] Ícones de redes sociais presentes
- [ ] Copyright "© 2025 B F Marques Empreendimentos"

---

## 🔐 PARTE 2: Testes como Corretor (Logado)

### 2.1 Login de Corretor
- [ ] Clicar em "Área do Corretor" no header
- [ ] Modal de login aparece
- [ ] Digitar email: `admin@bfmarques.com`
- [ ] Digitar senha: `123456`
- [ ] Clicar em "Entrar"
- [ ] Modal fecha automaticamente
- [ ] Mensagem de sucesso aparece (toast/notificação)

### 2.2 Mudanças Após Login
- [ ] **Filtro "Status" agora VISÍVEL** na grid de imóveis
- [ ] Opções: Disponível, Reservado, Vendido
- [ ] **Badges de status nos cards** (coloridos)
- [ ] Botões "Reservar", "Ver Detalhes", "Docs" **NÃO abrem modal de acesso restrito**

### 2.3 Detalhes do Imóvel - Edifício Amendoeiras
**⭐ TESTE CRÍTICO**

- [ ] Clicar em "Ver Detalhes" do **Edifício Amendoeiras**
- [ ] Modal grande (fullscreen ou semi-fullscreen) abre
- [ ] Título: "Edifício Amendoeiras - Rua Lopes da Cruz, 136"
- [ ] Localização com ícone: "📍 São Gonçalo - RJ"
- [ ] Preço exibido: "R$ 180.000"
- [ ] Botão de rolar para baixo (⬇️) visível

#### 2.3.1 Galeria de Fotos
- [ ] **Imagem principal grande e centralizada**
- [ ] Primeira imagem: `amendoeiras-08.jpg` (override configurado)
- [ ] **Seta esquerda (<) visível no lado esquerdo**
- [ ] **Seta direita (>) visível no lado direita**
- [ ] Clicar na seta direita: foto muda
- [ ] Clicar na seta esquerda: foto volta
- [ ] Última foto → seta direita → volta para primeira foto (cíclico)

#### 2.3.2 Thumbnails de Fotos
- [ ] **8 thumbnails de fotos abaixo da imagem principal**
- [ ] Thumbnails pequenas e alinhadas horizontalmente
- [ ] Primeira thumbnail (amendoeiras-08) tem **borda ativa** (destaque)
- [ ] Clicar em qualquer thumbnail: foto principal muda
- [ ] Thumbnail clicada recebe borda ativa
- [ ] Hover em thumbnail: efeito visual (scale ou brilho)

#### 2.3.3 Thumbnails de Vídeos
**⭐ TESTE CRÍTICO**

- [ ] **3 thumbnails de vídeos** após as fotos
- [ ] Cada thumbnail de vídeo tem **ícone play (▶️) centralizado**
- [ ] Ícone play tem:
  - [ ] Cor branca (#fff)
  - [ ] Tamanho grande (30px)
  - [ ] Círculo preto transparente atrás (46px)
  - [ ] Sombra visível
- [ ] Hover em thumbnail de vídeo: efeito visual

#### 2.3.4 Player de Vídeo
- [ ] Clicar na primeira thumbnail de vídeo (▶️)
- [ ] **Imagem principal é substituída por player de vídeo**
- [ ] Vídeo carrega automaticamente
- [ ] **Autoplay funciona** (pode começar muted)
- [ ] **Controles nativos do HTML5 visíveis:**
  - [ ] Botão Play/Pause (▶️/⏸️)
  - [ ] Barra de progresso
  - [ ] Tempo decorrido / Duração total
  - [ ] Controle de volume (🔊)
  - [ ] Botão de tela cheia (⛶)
- [ ] Clicar em Play/Pause funciona
- [ ] Arrastar barra de progresso: vídeo pula para posição
- [ ] Setas esquerda/direita ainda funcionam (navega entre mídias)

#### 2.3.5 Mapa Google Maps
- [ ] Rolar até seção "Endereço"
- [ ] Endereço exibido: "Rua Lopes da Cruz, 136, São Gonçalo - RJ"
- [ ] **Link "Abrir no Google Maps" visível**
- [ ] Clicar no link: **abre Google Maps em NOVA ABA**
- [ ] Google Maps mostra localização correta
- [ ] **Mapa embutido (iframe) visível** na página
- [ ] Mapa carrega com marcador
- [ ] Zoom no mapa funciona (scroll ou botões +/-)
- [ ] Arrastar mapa funciona

### 2.4 Lightbox de Imagens
- [ ] Voltar para galeria de fotos
- [ ] Clicar na imagem principal (não na thumbnail)
- [ ] **Lightbox/modal de zoom abre** (se implementado)
- [ ] Imagem em tamanho grande
- [ ] Fechar lightbox (X ou ESC ou click fora)

### 2.5 Teste com Outros Imóveis
Repetir testes de galeria com:
- [ ] **Porto Novo** (tem mapa Google Maps)
- [ ] **Casa Luxo Maricá** (verificar se prefixo ainda ausente em detalhes)

---

## 👤 PARTE 3: Testes da Área do Cliente

### 3.1 Login de Cliente
- [ ] Fazer logout do corretor (se logado)
- [ ] Clicar em "Área do Cliente" no header
- [ ] Modal de login aparece
- [ ] **2 tabs visíveis:** "Entrar" e "Cadastrar"
- [ ] Tab "Entrar" ativa por padrão
- [ ] Digitar email: `admin@bfmarques.com`
- [ ] Digitar senha: `123456`
- [ ] Texto de ajuda: "Use o mesmo email cadastrado no momento da compra"
- [ ] Clicar em "Entrar"
- [ ] Modal muda para dashboard

### 3.2 Dashboard do Cliente
- [ ] Mensagem de boas-vindas: "Bem-vindo, Admin B F Marques!"
- [ ] Email exibido: "admin@bfmarques.com"
- [ ] Botão "Sair" visível no topo
- [ ] **7 tabs visíveis:**
  - [ ] Meus Imóveis
  - [ ] Documentos
  - [ ] Reparos
  - [ ] Manual (com ícone 📖)
  - [ ] Newsletter (com ícone 📰)
  - [ ] Histórico
  - [ ] Meu Perfil

### 3.3 Tabs do Dashboard
- [ ] Tab "Meus Imóveis" ativa por padrão
- [ ] Texto: "Você ainda não possui imóveis cadastrados."
- [ ] Clicar em tab "Documentos": conteúdo muda
- [ ] Clicar em tab "Reparos": 
  - [ ] Botão "Nova Solicitação de Reparo" visível
  - [ ] Ícone de ferramentas (🔧) no botão
- [ ] Clicar em tab "Manual":
  - [ ] 4 cards rápidos visíveis
  - [ ] "Manual Completo", "Prazos de Garantia", "Dúvidas Frequentes", "Guia de Manutenção"
- [ ] Clicar em tab "Newsletter":
  - [ ] Card "Última Newsletter"
  - [ ] Informações sobre envio trimestral
- [ ] Clicar em tab "Meu Perfil":
  - [ ] Formulário com campos: Nome, CPF, Email, Telefone, Endereço
  - [ ] CPF desabilitado (readonly)

### 3.4 Solicitação de Reparo
- [ ] Clicar em tab "Reparos"
- [ ] Clicar em "Nova Solicitação de Reparo"
- [ ] **Modal de reparo abre**
- [ ] Campos visíveis:
  - [ ] Selecione o Imóvel (dropdown)
  - [ ] Descrição do Problema (textarea)
  - [ ] Localização do Problema (input)
  - [ ] Foto e/ou Vídeo (upload)
  - [ ] Prioridade (select: Normal, Alta, Urgente)
- [ ] Área de upload com ícone de nuvem (☁️)
- [ ] Texto: "Até 1 vídeo curto + 3 ou 4 fotos. Máx: 5 arquivos, total 30MB"
- [ ] Botões "Cancelar" e "Enviar Solicitação"

### 3.5 Logout
- [ ] Clicar em "Sair"
- [ ] Dashboard fecha
- [ ] Volta para tela de login ou fecha modal
- [ ] Verificar se dados não persistem (reabrir modal)

---

## 🎮 PARTE 4: Simulador Interativo

### 4.1 Fluxo Completo
- [ ] Rolar até "Simulador de Financiamento Interativo"
- [ ] Verificar etapa 1 ativa
- [ ] Preencher "Renda mensal": `5000`
- [ ] Clicar em "Avançar"
- [ ] **Jogador se move** na tela
- [ ] Etapa 2 ativa
- [ ] Preencher "Valor do imóvel": `200000`
- [ ] Clicar em "Avançar"
- [ ] **Jogador avança mais**
- [ ] Etapa 3 ativa: "Revisão"
- [ ] Clicar em "Revisar Dados"
- [ ] Verificar dados exibidos
- [ ] Clicar em "Avançar"
- [ ] **Bola se move em direção ao gol**
- [ ] Etapa 4 ativa: "Chuta a bola no gol!"
- [ ] Clicar em "Ver Resultado Final"
- [ ] **Animação de GOL** 🎉
- [ ] Resultado exibido com valores calculados
- [ ] Botão "Reiniciar" aparece
- [ ] Clicar em "Reiniciar": volta para etapa 1

### 4.2 Botão Voltar
- [ ] No meio do simulador, clicar em "Voltar"
- [ ] Etapa anterior é reativada
- [ ] Dados preenchidos ainda visíveis

---

## 🔍 PARTE 5: Filtros de Imóveis

### 5.1 Filtro de Tipo (Visitante)
- [ ] Na grid de imóveis, clicar em "Todos os Tipos"
- [ ] Selecionar "Apartamento"
- [ ] Grid atualiza **SEM reload da página**
- [ ] Apenas apartamentos exibidos
- [ ] Selecionar "Casa"
- [ ] Apenas casas exibidas
- [ ] Voltar para "Todos os Tipos": todos os 8 imóveis voltam

### 5.2 Filtro de Preço (Visitante)
- [ ] Digitar no campo "Preço máximo": `160000`
- [ ] **Filtro aplica automaticamente** (pode ter debounce)
- [ ] Apenas imóveis até R$ 160.000 exibidos
- [ ] Apagar valor: todos os imóveis voltam

### 5.3 Filtro de Status (Corretor Logado)
- [ ] Fazer login como corretor
- [ ] Filtro "Status" agora visível
- [ ] Selecionar "Disponível"
- [ ] Apenas imóveis disponíveis exibidos
- [ ] Badges de status verde nos cards
- [ ] Selecionar "Reservado": apenas reservados (se houver)
- [ ] Selecionar "Vendido": apenas vendidos (se houver)

### 5.4 Filtros Combinados
- [ ] Aplicar: Tipo="Casa" + Preço máximo=170000
- [ ] Apenas casas até R$ 170.000 exibidas
- [ ] Se nenhum imóvel corresponder: mensagem "Nenhum imóvel encontrado"

---

## 📱 PARTE 6: Responsividade (Opcional)

### 6.1 Mobile (< 768px)
- [ ] Redimensionar navegador para 375px (iPhone)
- [ ] Header colapsa (menu hamburger se implementado)
- [ ] Cards empilham verticalmente (1 coluna)
- [ ] Galeria de fotos responsiva
- [ ] Botões acessíveis e clicáveis
- [ ] Texto legível (sem zoom necessário)

### 6.2 Tablet (768px - 1024px)
- [ ] Redimensionar para 768px (iPad)
- [ ] Grid de cards: 2 colunas
- [ ] Header: menu condensado ou hamburger
- [ ] Modal de detalhes ocupa mais espaço

### 6.3 Desktop (> 1024px)
- [ ] Redimensionar para 1920px (Full HD)
- [ ] Grid de cards: 3 colunas
- [ ] Header completo com todos os links
- [ ] Espaçamento adequado

---

## 🌐 PARTE 7: Variantes HTML

### 7.1 index-completo.html
- [ ] Acessar http://localhost:5173/index-completo.html
- [ ] **Verificar regressões:**
  - [ ] Logo em imagem AUSENTE (apenas texto)
  - [ ] Botão "Área do Cliente" AUSENTE
  - [ ] Menu sem Calculadora e MCMV
  - [ ] Hero section com gradient (sem imagem de fundo)
- [ ] **Status:** ⚠️ Versão simplificada, não recomendada

### 7.2 site-final.html
- [ ] Acessar http://localhost:5173/site-final.html
- [ ] Verificar que é uma **página de documentação**
- [ ] Não testar funcionalidades (não é site funcional)
- [ ] **Status:** ℹ️ Apenas documentação interna

---

## 🧪 PARTE 8: Testes de Navegação

### 8.1 Links do Menu
- [ ] Clicar em "Imóveis": rola para seção de imóveis
- [ ] Clicar em "Simulador": rola para simulador
- [ ] Clicar em "Sobre": rola para seção sobre
- [ ] Clicar em "Calculadora dos Sonhos✨": abre calculadora.html
- [ ] Clicar em "MCMV": abre mcmv.html
- [ ] Clicar em "Fale Conosco": abre contato.html

### 8.2 Scroll Suave
- [ ] Todos os scrolls internos são **suaves** (smooth scrolling)
- [ ] Sem saltos bruscos

### 8.3 Header Fixo (Sticky)
- [ ] Rolar a página para baixo
- [ ] Header permanece visível no topo
- [ ] Background do header muda (pode ficar mais opaco)
- [ ] Sombra aparece no header

---

## 🐛 PARTE 9: Testes de Erro

### 9.1 Imagens Quebradas
- [ ] Desconectar internet (ou simular no DevTools)
- [ ] Recarregar página
- [ ] Imagens quebradas mostram **placeholder** (não quebram layout)
- [ ] Atributo `onerror` funciona

### 9.2 Vídeos Não Carregam
- [ ] Abrir detalhes do Amendoeiras
- [ ] Simular erro de rede
- [ ] Clicar em thumbnail de vídeo
- [ ] Player mostra **erro de carregamento** (não trava página)

### 9.3 Login Incorreto
- [ ] Tentar login com email: `teste@teste.com`
- [ ] Senha: `errado`
- [ ] Mensagem de erro: "Email ou senha incorretos"
- [ ] Modal não fecha
- [ ] Campos permanecem preenchidos

### 9.4 Formulários Vazios
- [ ] Tentar enviar formulário de login vazio
- [ ] HTML5 validation aparece: "Preencha este campo"
- [ ] Tentar cadastro sem preencher campos
- [ ] Validações impedem envio

---

## ⚡ PARTE 10: Performance

### 10.1 Tempo de Carregamento
- [ ] Abrir DevTools → Network
- [ ] Recarregar página
- [ ] Tempo total < 3 segundos (ideal)
- [ ] DOMContentLoaded < 1 segundo
- [ ] Recursos críticos carregam primeiro

### 10.2 Lazy Loading
- [ ] Verificar que iframe do mapa tem `loading="lazy"`
- [ ] Mapa só carrega ao rolar até seção de endereço
- [ ] Vídeos têm `preload="metadata"`

### 10.3 Animações Suaves
- [ ] Transições de hover nos botões: suaves (< 300ms)
- [ ] Fade-in dos cards ao rolar: suave
- [ ] Scroll suave: não trava

---

## 📊 Resumo do Checklist

### Estatísticas Esperadas:
- **Total de Testes:** ~150 itens
- **Tempo Estimado:** 30-45 minutos (teste completo)
- **Tempo Mínimo:** 15 minutos (testes críticos apenas)

### Testes Críticos (Prioridade Alta):
1. ✅ Prefixo "À partir de:" em 7/8 cards
2. ✅ Exceção Casa Luxo Maricá (sem prefixo)
3. ✅ Modal de acesso restrito para visitantes
4. ✅ Thumbnails de vídeo com ícone play (▶️)
5. ✅ Player de vídeo funcional
6. ✅ Mapa Google Maps (link + iframe)
7. ✅ Login de corretor e cliente
8. ✅ Galeria com setas funcionais

---

## 📝 Relatório de Bugs

Se encontrar bugs, documente assim:

```
### Bug #X: [Título Descritivo]
**Severidade:** Alta / Média / Baixa
**Passos para Reproduzir:**
1. Acessar página X
2. Clicar em botão Y
3. Observar comportamento Z

**Resultado Esperado:**
[O que deveria acontecer]

**Resultado Obtido:**
[O que aconteceu]

**Screenshot/Vídeo:**
[Anexar se possível]

**Navegador:** Chrome 120 / Firefox 121 / Safari 17
**Sistema:** Windows 11 / macOS 14 / Linux
```

---

**Documento criado por:** Análise Automatizada de Código  
**Última atualização:** 11/02/2026  
**Versão:** 1.0
