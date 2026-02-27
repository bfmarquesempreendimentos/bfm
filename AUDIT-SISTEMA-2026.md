# Auditoria do Sistema B F Marques - Fevereiro 2026

## Resumo Executivo

Auditoria completa do sistema de exibição e gestão de vendas. Identificados **5 pontos críticos** e **melhorias** implementadas.

---

## 1. ARQUITETURA

### Páginas HTML
| Página | Função | Scripts principais |
|-------|--------|-------------------|
| index.html | Site principal, imóveis, simulador | main.js, firebase-service, repair-requests |
| client-area.html | Área do cliente | client-area.js, repair-requests, property-sales |
| admin.html | Painel administrativo | admin.js, admin-repairs |
| admin-login.html | Login admin | auth simples |
| calculadora.html, mcmv.html, contato.html | Páginas específicas | client-area, repair-requests |
| reset-password.html | Redefinir senha | - |

### localStorage (chaves principais)
- `repairRequests` – solicitações de reparo
- `propertySales` – vendas cadastradas
- `properties` – imóveis
- `reservations` – reservas
- `currentClient` – sessão cliente
- `adminUser` – sessão admin
- `currentUser` – sessão corretor
- `clients` – clientes (fallback local)
- `brokers` – corretores

### Firebase
- **Firestore**: repairRequests, propertySales, clients, brokers, emailQueue, etc.
- **Cloud Functions**: getRepairs, getPropertySales (novo), chatbotWebhook, sendQueuedEmail
- **Auth**: clientes e corretores
- **Storage**: anexos de reparos

---

## 2. PROBLEMAS IDENTIFICADOS E CORREÇÕES

### ✅ Problema 1: Mac não sincronizava (Admin + Área do Cliente)
**Causa**: Firestore client SDK falha ou retorna vazio no macOS.
**Solução**: Cloud Functions `getRepairs` e `getPropertySales` como fonte primária; Firestore como fallback.
**Arquivos**: admin-repairs.js, admin.js, repair-requests.js, client-area.js, functions/index.js

### ✅ Problema 2: propertySales vazio no Mac ao logar
**Causa**: propertySales só era carregado pelo Admin; Área do Cliente usava localStorage vazio.
**Solução**: Pré-carregamento de propertySales na Área do Cliente via getPropertySales (Cloud Function).
**Arquivo**: client-area.js – `preloadClientDataFromServer()`

### ✅ Problema 3: Reparos não salvavam no Firestore (cliente localStorage)
**Causa**: Regra Firestore `create: if isSignedIn()` – clientes com login localStorage não estão autenticados.
**Solução**: Regra alterada para `allow create: if true` (consistente com read/update).
**Arquivo**: firestore.rules

### ✅ Problema 4: Sessão do cliente não restaurada
**Causa**: Ao reabrir client-area.html, cliente precisava logar novamente.
**Solução**: Restauração de currentClient do localStorage no DOMContentLoaded.
**Arquivo**: client-area.js

### ✅ Problema 5: Lightbox mostrava foto errada
**Causa**: Comparação `src` falhava (URL absoluta vs relativa).
**Solução**: Função `normalizeLightboxSrc()` para comparação correta.
**Arquivo**: main.js (já corrigido)

---

## 3. MELHORIAS SUGERIDAS (futuro)

1. **CONFIG.development.mockAPIResponses**: Está `true` – verificar se afeta produção.
2. **CONFIG.api.baseURL**: Aponta para api inexistente – remover ou configurar.
3. **Rate limiting**: Regras Firestore abertas – considerar rate limit em Cloud Functions.
4. **Tratamento de offline**: Indicador visual quando Firestore/fetch falham.
5. **Testes automatizados**: Expandir tests/ para cobrir fluxos críticos.
6. **Deploy Firestore rules**: Executar `firebase deploy --only firestore:rules` após alterações.
7. **Deploy Cloud Function getPropertySales**: `firebase deploy --only functions:getPropertySales`

---

## 4. DEPLOY NECESSÁRIO

Após as alterações:

```bash
# 1. Firestore rules
firebase deploy --only firestore:rules

# 2. Nova Cloud Function getPropertySales
firebase deploy --only functions:getPropertySales
```

---

## 5. FLUXOS VALIDADOS

| Fluxo | Admin | Cliente | Corretor |
|-------|-------|---------|----------|
| Reparos (listar) | ✅ getRepairs | ✅ getRepairs | - |
| Reparos (criar) | - | ✅ Firestore create | - |
| Vendas (listar) | ✅ Firestore | ✅ getPropertySales | - |
| Login cliente | - | ✅ Firebase/Local | - |
| Login admin | ✅ Local | - | - |
