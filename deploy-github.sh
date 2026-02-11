#!/bin/bash
# Script para publicar o site no GitHub Pages
# Execute: chmod +x deploy-github.sh && ./deploy-github.sh

set -e
REPO_NAME="bf-marques-empreendimentos"
REPO_URL="https://github.com"

echo "🚀 Publicando BF Marques no GitHub Pages"
echo ""

# Detectar usuário GitHub
GITHUB_USER=$(git config --global user.name 2>/dev/null | tr ' ' '-' | tr '[:upper:]' '[:lower:]' || true)
if [ -z "$GITHUB_USER" ]; then
  echo "Digite seu usuário do GitHub (ex: brunomarques):"
  read -r GITHUB_USER
fi

REMOTE="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
echo "Repositório: $REMOTE"
echo ""

# Verificar se remote já existe
if git remote get-url origin 2>/dev/null; then
  echo "Remote 'origin' já configurado. Atualizando..."
  git remote set-url origin "$REMOTE"
else
  git remote add origin "$REMOTE"
fi

echo ""
echo "📤 Enviando código para o GitHub..."
git push -u origin main 2>/dev/null || git push -u origin master 2>/dev/null || git push -u origin main

echo ""
echo "✅ Código enviado!"
echo ""
echo "📋 Próximo passo - Ativar GitHub Pages:"
echo "   1. Acesse: $REPO_URL/${GITHUB_USER}/${REPO_NAME}/settings/pages"
echo "   2. Em 'Source', escolha: Deploy from a branch"
echo "   3. Branch: main (ou master) | Pasta: / (root)"
echo "   4. Clique em Save"
echo ""
echo "   Após 1-2 minutos, seu site estará em:"
echo "   https://${GITHUB_USER}.github.io/${REPO_NAME}/"
echo ""
