# Testes - Solicitação de Reparo

## Executar testes automatizados

### Testes Node (validação de arquivos)
```bash
node tests/run-repair-tests.js
```
Valida as regras: mín 3 fotos, máx 5 arquivos, tamanhos, tipos.

### Testes no navegador (fluxo completo)
1. Inicie o servidor: `python3 -m http.server 8081`
2. Acesse: `http://localhost:8081/tests/test-repair-solicitacao.html`
3. Os testes rodam automaticamente ao carregar a página

---

## Regras implementadas
- **Mínimo 3 fotos** obrigatórias
- **Máximo 5 arquivos** no total (fotos + vídeo)
- Suporte a vídeo (opcional)
- Imagens: até 10MB cada
- Vídeo: até 50MB
- Total: até 50MB

---

## Cenários de teste

### 1. Menos de 3 fotos (deve falhar)
- [ ] Selecionar apenas 2 fotos → mensagem: "É obrigatório enviar no mínimo 3 fotos"
- [ ] Selecionar 1 foto + 1 vídeo → deve falhar (só 1 foto)
- [ ] Selecionar 3 vídeos sem fotos → deve falhar (0 fotos)

### 2. Mínimo válido (deve passar)
- [ ] Selecionar exatamente 3 fotos
- [ ] Verificar hint: "3 foto(s), 0 vídeo(s) • 3/5 arquivos" em verde
- [ ] Preencher formulário e enviar → sucesso

### 3. Máximo de arquivos (deve passar)
- [ ] Selecionar 4 fotos + 1 vídeo (5 arquivos no total)
- [ ] Verificar hint em verde
- [ ] Enviar → sucesso

### 4. Mais de 5 arquivos (deve falhar)
- [ ] Selecionar 6 arquivos (ex: 6 fotos ou 4 fotos + 2 vídeos)
- [ ] Mensagem: "Máximo de 5 arquivos. Você selecionou 6."

### 5. Tamanhos (deve falhar se exceder)
- [ ] Imagem > 10MB → "Uma das imagens ultrapassa 10MB"
- [ ] Vídeo > 50MB → "O vídeo ultrapassa 50MB"
- [ ] Total > 50MB → "O total ultrapassa 50MB"

### 6. Tipo inválido (deve falhar)
- [ ] Selecionar PDF ou outro arquivo não imagem/vídeo
- [ ] Mensagem: "Aceito apenas fotos (JPG, PNG, etc.) e vídeos (MP4, etc.)."

### 7. Fluxo na Área do Cliente
- [ ] Acessar `client-area.html`
- [ ] Fazer login (ex: admin ou cliente com imóvel)
- [ ] Ir na aba "Reparos"
- [ ] Clicar em "Nova Solicitação de Reparo"
- [ ] Modal abre, select de imóvel preenchido (se cliente tem imóveis)
- [ ] Selecionar 3+ fotos, preencher descrição e localização
- [ ] Enviar → sucesso
- [ ] Lista de reparos atualiza com a nova solicitação

### 8. Remover arquivos
- [ ] Selecionar 4 fotos
- [ ] Clicar "Remover Tudo" → preview some, hint limpa
- [ ] Selecionar novamente 3 fotos → funciona normalmente

---

## Como executar

1. Abra o projeto em um servidor (ex: `python3 -m http.server 8080`)
2. Acesse `http://localhost:8080/client-area.html`
3. Faça login e siga os cenários acima
