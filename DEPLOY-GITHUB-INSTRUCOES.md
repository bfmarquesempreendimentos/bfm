# 🚀 Como colocar o site no ar via GitHub Pages

## ✅ O que já foi feito

- [x] Repositório Git inicializado
- [x] Arquivos commitados (167 arquivos)
- [x] Remote configurado: `https://github.com/marambaiaimovel/bf-marques-empreendimentos.git`
- [x] `.gitignore` criado (node_modules, .DS_Store ignorados)

---

## 📋 Passos que você precisa fazer

### 1. Criar o repositório no GitHub

Uma janela do navegador deve ter aberto em **github.com/new** com o nome `bf-marques-empreendimentos` já preenchido.

- Clique em **"Create repository"** (não marque "Add README" nem .gitignore)
- Se a janela não abriu, acesse: https://github.com/new?name=bf-marques-empreendimentos

---

### 2. Autenticar no GitHub (uma vez)

O GitHub não aceita mais senha. Escolha **uma** opção:

#### Opção A – Token de acesso (mais simples)

1. Acesse: https://github.com/settings/tokens
2. Clique em **"Generate new token (classic)"**
3. Dê um nome (ex: "deploy-bf-marques")
4. Marque o escopo **`repo`**
5. Clique em **"Generate token"**
6. **Copie o token** (você não verá de novo)
7. Quando fizer o push, use o token no lugar da senha

#### Opção B – GitHub CLI (para o futuro)

```bash
brew install gh
gh auth login
```

---

### 3. Enviar o código para o GitHub

No Terminal, dentro da pasta do projeto:

```bash
cd "/Users/brunomarques/Downloads/Projetos/Exibicao e gerencia de Vendas"
git push -u origin main
```

Quando pedir:
- **Username:** marambaiaimovel (ou seu usuário do GitHub)
- **Password:** cole o **token** que você criou (não a senha da conta)

---

### 4. Ativar o GitHub Pages

1. Acesse: https://github.com/marambaiaimovel/bf-marques-empreendimentos/settings/pages  
   (ou: repositório → Settings → Pages)

2. Em **"Build and deployment"**:
   - **Source:** Deploy from a branch
   - **Branch:** main
   - **Folder:** / (root)
   - Clique em **Save**

3. Aguarde 1–2 minutos.

4. Seu site estará em:
   ```
   https://marambaiaimovel.github.io/bf-marques-empreendimentos/
   ```

---

## 🔄 Atualizações futuras

Sempre que alterar o site e quiser publicar:

```bash
cd "/Users/brunomarques/Downloads/Projetos/Exibicao e gerencia de Vendas"
git add .
git commit -m "Descrição da alteração"
git push
```

O site será atualizado em poucos minutos.

---

## ❓ Problemas comuns

**"remote: Invalid username or token"**  
→ Use o token em vez da senha, ou crie um novo token.

**" repository not found"**  
→ Crie o repositório no GitHub antes do push.

**Site em branco ou 404**  
→ Confira se o GitHub Pages está ativado em Settings → Pages e se a branch é `main`.
