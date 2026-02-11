# Sistema de Vendas de Imóveis - Construtora Premium

Um sistema completo para gestão e vendas de imóveis desenvolvido especificamente para construtoras.

## 🏗️ Características Principais

### Para Clientes
- **Galeria de Imóveis**: Visualização completa com fotos e vídeos
- **Busca e Filtros**: Filtros por tipo, preço, localização e características
- **Detalhes Completos**: Informações detalhadas de cada imóvel
- **Design Responsivo**: Funciona perfeitamente em todos os dispositivos

### Para Corretores
- **Sistema de Autenticação**: Login seguro com cadastro e aprovação
- **Sistema de Reservas**: Reserva de imóveis por até 48 horas
- **Gestão de Clientes**: Cadastro completo de informações do cliente
- **Validação de CPF**: Validação automática de documentos

### Para Administradores
- **Painel Completo**: Dashboard com estatísticas e métricas
- **Gestão de Imóveis**: Adicionar, editar e excluir propriedades
- **Gestão de Corretores**: Aprovação e gerenciamento de corretores
- **Relatórios**: Exportação de dados e relatórios detalhados
- **Configurações**: Personalização do sistema

## 🚀 Funcionalidades Técnicas

### Sistema de Reservas
- **Tempo Limitado**: Reservas com expiração automática em 48 horas
- **Notificações**: Alertas de reservas expirando
- **Histórico Completo**: Rastreamento de todas as reservas

### Autenticação e Segurança
- **Múltiplos Níveis**: Cliente, Corretor e Administrador
- **Validação de Dados**: CPF, email e telefone
- **Sessões Seguras**: Controle de acesso baseado em localStorage

### Interface Moderna
- **Design Responsivo**: Mobile-first approach
- **Animações Suaves**: Transições e efeitos visuais
- **UX Otimizada**: Interface intuitiva e fácil de usar

## 📁 Estrutura do Projeto

```
/
├── index.html              # Página principal
├── admin.html              # Painel administrativo
├── admin-login.html        # Login administrativo
├── styles/
│   ├── main.css           # Estilos principais
│   └── admin.css          # Estilos do painel admin
├── js/
│   ├── main.js            # Funcionalidades principais
│   ├── auth.js            # Sistema de autenticação
│   ├── properties.js      # Gestão de imóveis
│   ├── reservations.js    # Sistema de reservas
│   └── admin.js           # Painel administrativo
└── assets/
    ├── images/            # Imagens dos imóveis
    └── videos/            # Vídeos promocionais
```

## 🛠️ Como Usar

### 1. Configuração Inicial

1. Faça o download de todos os arquivos
2. Coloque as imagens dos seus imóveis na pasta `assets/images/`
3. Adicione vídeos promocionais na pasta `assets/videos/`
4. Abra o `index.html` em um navegador

### 2. Acesso Administrativo

- **URL**: `admin-login.html`
- **Email**: `admin@construtorapremium.com`
- **Senha**: `admin123`

### 3. Cadastro de Corretores

Os corretores podem se cadastrar através da área "Área do Corretor" no site principal. O administrador precisa aprovar novos cadastros.

### 4. Personalização

#### Dados da Empresa
Edite as informações da empresa em:
- `index.html` (seção de contato)
- `js/main.js` (dados de exemplo)

#### Imóveis de Exemplo
Os imóveis de exemplo estão definidos em `js/main.js`. Substitua pelos seus dados reais.

## 📋 Funcionalidades Detalhadas

### Sistema de Reservas
- ✅ Reserva por 48 horas
- ✅ Expiração automática
- ✅ Validação de CPF
- ✅ Histórico completo
- ✅ Notificações de expiração

### Gestão de Imóveis
- ✅ CRUD completo (Criar, Ler, Atualizar, Deletar)
- ✅ Upload de múltiplas imagens
- ✅ Suporte a vídeos
- ✅ Características personalizáveis
- ✅ Filtros avançados

### Relatórios e Exportação
- ✅ Exportação para CSV
- ✅ Estatísticas em tempo real
- ✅ Relatórios de vendas
- ✅ Performance dos corretores

### Responsividade
- ✅ Mobile-first design
- ✅ Tablets e desktops
- ✅ Navegação otimizada
- ✅ Formulários adaptativos

## 🎨 Personalização Visual

### Cores Principais
- **Azul Principal**: `#3498db`
- **Azul Escuro**: `#2980b9`
- **Verde Sucesso**: `#27ae60`
- **Amarelo Aviso**: `#f39c12`
- **Vermelho Erro**: `#e74c3c`

### Fontes
- **Principal**: Inter (Google Fonts)
- **Ícones**: Font Awesome 6

## 📱 Compatibilidade

- ✅ Chrome, Firefox, Safari, Edge
- ✅ iOS Safari, Chrome Mobile
- ✅ Android Chrome, Samsung Browser
- ✅ Tablets e iPads

## 🔧 Configurações Avançadas

### Tempo de Reserva
Altere em `js/reservations.js`:
```javascript
// Linha 45: 2 dias = 2 * 24 * 60 * 60 * 1000
expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
```

### Validações
Customize validações em `js/auth.js` e `js/reservations.js`

### Dados de Exemplo
Modifique os imóveis de exemplo em `js/main.js` na função `loadProperties()`

## 📞 Suporte

Para dúvidas ou personalizações, entre em contato através do sistema de contato no site.

## 🔄 Atualizações Futuras

- [ ] Integração com APIs de pagamento
- [ ] Sistema de chat em tempo real
- [ ] Notificações por email
- [ ] App mobile nativo
- [ ] Integração com CRM

---

**Desenvolvido para Construtoras que buscam excelência em vendas digitais** 🏆

