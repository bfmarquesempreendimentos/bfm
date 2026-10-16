# 🏗️ Guia de Instalação - Sistema de Vendas de Imóveis

## 📋 Pré-requisitos

- Navegador web moderno (Chrome, Firefox, Safari, Edge)
- Editor de código (VS Code recomendado)
- Conhecimentos básicos de HTML, CSS e JavaScript (para personalização)

## 🚀 Instalação Rápida

### 1. Download dos Arquivos
Faça o download de todos os arquivos do projeto e extraia em uma pasta de sua escolha.

### 2. Estrutura de Arquivos
Certifique-se de que a estrutura está assim:
```
projeto/
├── index.html
├── admin.html
├── admin-login.html
├── config.js
├── README.md
├── INSTALACAO.md
├── styles/
│   ├── main.css
│   └── admin.css
├── js/
│   ├── main.js
│   ├── auth.js
│   ├── properties.js
│   ├── reservations.js
│   └── admin.js
├── assets/
│   ├── images/
│   └── videos/
└── data/
    └── sample-properties.json
```

### 3. Configuração Inicial

#### Personalizar Informações da Empresa
Edite o arquivo `config.js`:
```javascript
company: {
    name: 'SUA CONSTRUTORA',
    email: 'contato@suaconstrutora.com',
    phone: '(11) 99999-9999',
    address: 'Seu endereço completo',
    website: 'www.suaconstrutora.com.br'
}
```

#### Adicionar Imóveis
1. Coloque as fotos dos imóveis na pasta `assets/images/`
2. Coloque os vídeos na pasta `assets/videos/`
3. Edite os dados em `js/main.js` na função `loadProperties()`

### 4. Primeiro Acesso

#### Site Principal
- Abra o arquivo `index.html` em seu navegador
- Teste a navegação e filtros

#### Painel Administrativo
- Acesse `admin-login.html`
- Use o e-mail autorizado e a senha cadastrada no **Firebase Authentication**.
- Nunca grave senhas reais neste repositório.

## 🔧 Configurações Avançadas

### Personalizar Cores e Visual

#### Cores Principais (em `styles/main.css`)
```css
:root {
    --primary-color: #3498db;      /* Azul principal */
    --secondary-color: #2980b9;    /* Azul escuro */
    --success-color: #27ae60;      /* Verde sucesso */
    --warning-color: #f39c12;      /* Amarelo aviso */
    --danger-color: #e74c3c;       /* Vermelho erro */
}
```

#### Logo e Marca
1. Substitua o ícone em `index.html`:
```html
<h1><i class="fas fa-building"></i> SUA CONSTRUTORA</h1>
```

2. Adicione sua logo:
```html
<h1><img src="assets/images/logo.png" alt="Logo"> SUA CONSTRUTORA</h1>
```

### Configurar Sistema de Reservas

#### Alterar Tempo de Reserva
No arquivo `config.js`:
```javascript
reservations: {
    defaultDurationHours: 48, // Altere para o tempo desejado
    maxReservationsPerBroker: 5,
    // ...
}
```

#### Personalizar Validações
No arquivo `js/reservations.js`, função `isValidCPF()` para alterar validação de CPF.

### Adicionar Imóveis

#### Formato dos Dados
```javascript
{
    id: 1,
    title: "Título do Imóvel",
    type: "apartamento", // apartamento, casa, cobertura
    location: "Cidade, Estado",
    price: 850000,
    bedrooms: 3,
    bathrooms: 2,
    area: 120,
    parking: 2,
    status: "disponivel", // disponivel, reservado, vendido
    images: [
        "assets/images/imovel1-foto1.jpg",
        "assets/images/imovel1-foto2.jpg"
    ],
    videos: ["assets/videos/imovel1-tour.mp4"],
    description: "Descrição detalhada...",
    features: ["Piscina", "Academia", "Portaria 24h"]
}
```

## 🖼️ Adicionando Imagens e Vídeos

### Imagens
1. **Formato**: JPG, PNG, WEBP
2. **Tamanho**: Máximo 5MB cada
3. **Resolução recomendada**: 1920x1080px
4. **Nomenclatura**: `imovel1-foto1.jpg`, `imovel1-foto2.jpg`

### Vídeos
1. **Formato**: MP4, WEBM
2. **Tamanho**: Máximo 50MB cada
3. **Resolução recomendada**: 1920x1080px ou 1280x720px
4. **Nomenclatura**: `imovel1-tour.mp4`

### Otimização de Imagens
Para melhor performance, otimize as imagens:
- Use ferramentas como TinyPNG ou Squoosh
- Mantenha qualidade entre 80-90%
- Considere usar WebP para navegadores modernos

## 👥 Gerenciamento de Usuários

### Corretores
- Cadastro através do site principal
- Aprovação pelo administrador
- Acesso ao sistema de reservas

### Administradores
- Acesso completo ao sistema
- Gerenciamento de imóveis e corretores
- Relatórios e estatísticas

### Alterar Credenciais de Admin
No arquivo `admin-login.html`, linha 87:
```javascript
if (email === 'SEU_EMAIL' && password === 'SUA_SENHA') {
    // ...
}
```

## 🌐 Hospedagem

### Hospedagem Gratuita
- **GitHub Pages**: Ideal para sites estáticos
- **Netlify**: Deploy automático e HTTPS gratuito
- **Vercel**: Ótima performance e fácil deploy

### Hospedagem Paga
- **Hostinger**: Custo-benefício
- **SiteGround**: Boa performance
- **AWS S3**: Para sites estáticos

### Passos para Deploy
1. Faça upload de todos os arquivos
2. Configure o domínio
3. Teste todas as funcionalidades
4. Configure HTTPS (recomendado)

## 📱 Teste em Dispositivos

### Desktop
- Chrome, Firefox, Safari, Edge
- Resolução mínima: 1024x768px

### Mobile
- iOS Safari, Chrome Mobile
- Android Chrome, Samsung Browser
- Teste em diferentes tamanhos de tela

### Tablets
- iPad Safari, Chrome
- Android tablets
- Modo paisagem e retrato

## 🔍 SEO e Performance

### Meta Tags
Personalize em `index.html`:
```html
<meta name="description" content="Sua descrição">
<meta name="keywords" content="suas, palavras, chave">
<meta property="og:title" content="Seu Título">
<meta property="og:description" content="Sua descrição">
<meta property="og:image" content="assets/images/og-image.jpg">
```

### Performance
- Otimize imagens e vídeos
- Minimize CSS e JavaScript (para produção)
- Use CDN para bibliotecas externas
- Configure cache no servidor

## 🛠️ Manutenção

### Backup Regular
- Faça backup de todos os arquivos
- Exporte dados do localStorage
- Salve configurações personalizadas

### Atualizações
- Monitore performance
- Atualize bibliotecas externas
- Teste em novos navegadores

### Monitoramento
- Configure Google Analytics
- Monitore erros no console
- Acompanhe métricas de uso

## ❓ Solução de Problemas

### Imagens não carregam
- Verifique os caminhos dos arquivos
- Confirme que as imagens estão na pasta correta
- Teste diferentes formatos de imagem

### JavaScript não funciona
- Abra o console do navegador (F12)
- Verifique erros de JavaScript
- Confirme que todos os arquivos JS estão carregando

### Reservas não funcionam
- Verifique se localStorage está habilitado
- Teste em modo anônimo/privado
- Confirme as validações de CPF

### Site não responsivo
- Teste a meta tag viewport
- Verifique CSS media queries
- Teste em diferentes dispositivos

## 📞 Suporte

Para suporte técnico:
1. Verifique este guia primeiro
2. Consulte o arquivo README.md
3. Teste em diferentes navegadores
4. Documente o problema com screenshots

---

**Boa sorte com seu novo sistema de vendas de imóveis!** 🎉

