# Fluxograma Completo - Área do Cliente

Documento de referência: fluxo integral da Área do Cliente, incluindo solicitação de reparos, emails de confirmação, visitas e armazenamento para comprovação jurídica.

---

## 1. Visão Geral - Área do Cliente

```
                                    ┌─────────────────────────────────────┐
                                    │     client-area.html                 │
                                    │     ÁREA DO CLIENTE                  │
                                    └─────────────────────────────────────┘
                                                    │
                        ┌───────────────────────────┼───────────────────────────┐
                        │                           │                           │
                        ▼                           ▼                           ▼
              ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
              │  TAB: Entrar     │       │  TAB: Cadastrar   │       │  Esqueci Senha    │
              │  loginClient()   │       │  registerClient() │       │  showClientForgot │
              └──────────────────┘       └──────────────────┘       └──────────────────┘
                        │                           │                           │
                        │    ┌──────────────────────┘                           │
                        │    │  • Valida CPF na base de vendas                   │
                        │    │  • Firebase Auth OU localStorage (clients)         │
                        │    │  • Carrega properties do cliente                   │
                        └────┴───────────────────────────────────────────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │  DASHBOARD       │
                                    │  showClientDash  │
                                    └──────────────────┘
                                              │
     ┌──────────┬──────────┬─────────┬──────┴──────┬──────────┬──────────┐
     ▼          ▼          ▼          ▼             ▼          ▼          ▼
┌─────────┐ ┌─────────┐ ┌───────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌───────┐
│ Imóveis │ │Documentos│ │Reparos│ │ Manual │ │Newsletter│ │Histórico│ │Perfil │
│loadClient│ │loadClient│ │load   │ │showClient│ │showClient│ │load    │ │load   │
│Props    │ │Docs     │ │Repairs│ │Manual  │ │Newsletter│ │History │ │Profile│
└─────────┘ └─────────┘ └───────┘ └────────┘ └──────────┘ └────────┘ └───────┘
```

---

## 2. Fluxo de Login e Cadastro

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  LOGIN (Firebase ou localStorage)                                                  │
│  • Valida email/senha                                                             │
│  • Admin override: brunoferreiramarques@gmail.com                                 │
│  • Firebase: getClientProfileByUID → getPropertySalesByEmail                      │
│  • Local: clients + hasPropertySale + getPropertiesByCPF                          │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│  CADASTRO                                                                         │
│  • Valida CPF (11 dígitos)                                                        │
│  • CPF/Email deve existir em vendas (hasPropertySale ou getPropertySalesByEmail)   │
│  • Firebase Auth: createUserWithEmailAndPassword                                  │
│  • Firestore: saveClientProfile (clients/{uid})                                   │
│  • Email notificação → empresa: "Novo Cliente Cadastrado"                         │
│  • addClientHistory                                                               │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│  ESQUECI MINHA SENHA                                                              │
│  • Firebase: sendPasswordResetEmail                                               │
│  • Local: savePasswordResetToken + sendEmail com link reset-password.html         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Fluxo Completo - Solicitação de Reparo

### 3.1 Abertura da Solicitação

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  CLIENTE → Aba Reparos → "Nova Solicitação de Reparo" → showRepairRequestForm()  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  • Modal abre | loadClientPropertiesForRepair() | Reseta formulário              │
│  • Se sem imóveis: alerta amarelo "Entre em contato para cadastrar seu imóvel"   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PREENCHIMENTO: imóvel, descrição, localização, fotos (mín 3, máx 5), prioridade │
└─────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  submitRepairRequest()                                                            │
│  • Valida: logado, 3–5 arquivos, min 3 fotos, imóvel                             │
│  • Upload anexos: Firebase Storage OU IndexedDB                                  │
│  • Cria objeto repairRequest (id, clientId, clientUid, propertyId, status…)     │
│  • Salva: localStorage.repairRequests + Firestore.repairRequests                 │
│  • addClientHistory                                                               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Emails ao Longo do Ciclo do Reparo

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│  CICLO DE VIDA DO REPARO + EMAILS                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

  STATUS: pendente          STATUS: em_analise        STATUS: em_andamento       STATUS: concluído
       │                           │                         │                        │
       │  [1] ABERTURA             │  [2] VISITA             │  [3] TÉRMINO           │
       │                           │  (quando evoluir)        │                        │
       ▼                           ▼                         ▼                        ▼
┌──────────────┐           ┌──────────────┐           ┌──────────────┐         ┌──────────────┐
│ EMAIL 1      │           │ EMAIL 2      │           │ EMAIL 3      │         │              │
│ CONFIRMAÇÃO  │           │ VISITA       │           │ TÉRMINO      │         │ Reparo       │
│ ABERTURA     │           │ AGENDADA     │           │ CONCLUÍDO    │         │ finalizado   │
├──────────────┤           ├──────────────┤           ├──────────────┤         └──────────────┘
│ IMPLEMENTADO │           │ A IMPLEMENTAR │           │ A IMPLEMENTAR │
│ ✓            │           │              │           │              │
│              │           │ Admin altera │           │ Admin altera │
│ sendRepair   │           │ status para  │           │ status para  │
│ RequestEmail │           │ em_andamento │           │ concluido     │
│              │           │ + data visita│           │               │
│ → Empresa    │           │              │           │ → Cliente:    │
│ → Cliente    │           │ → Cliente:   │           │ "Reparo      │
│              │           │ "Visita      │           │ concluído.   │
│ "Solicitação │           │ agendada para│           │ Confira no   │
│ recebida.    │           │ DD/MM. Nossa │           │ imóvel."     │
│ Protocolo #X"│           │ equipe irá   │           │              │
│              │           │ ao imóvel."  │           │ → Empresa:   │
└──────────────┘           └──────────────┘           │ notificação  │
                                                       └──────────────┘
```

**Resumo dos emails:**

| Etapa | Momento | Destinatários | Implementado |
|-------|---------|---------------|--------------|
| Abertura | Ao criar solicitação | Empresa + Cliente | ✓ Sim |
| Visita | Ao mudar para em_andamento ou agendar visita | Cliente | A implementar |
| Término | Ao mudar para concluído | Cliente + Empresa | A implementar |

---

## 4. Armazenamento para Comprovação Jurídica

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  DADOS ARMAZENADOS – TRAÇABILIDADE E COMPROVAÇÃO                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────┬───────────────────────────────────────────────────┐
│  FONTE                      │  CONTEÚDO                                         │
├────────────────────────────┬┴───────────────────────────────────────────────────┤
│  localStorage              │                                                    │
│  • repairRequests          │  Todas as solicitações (id, cliente, imóvel,      │
│                            │  descrição, localização, anexos, status, datas)     │
│  • clients                 │  Cadastro de clientes (CPF, email, propriedades)   │
│  • emailHistory            │  Emails enviados (to, subject, body, sentAt)       │
│  • propertySales           │  Vendas (para vincular cliente ao imóvel)          │
├────────────────────────────┼────────────────────────────────────────────────────┤
│  Firestore                 │                                                    │
│  • repairRequests          │  Mesmo payload do localStorage (backup nuvem)      │
│  • clients                 │  Perfil do cliente (Firebase Auth uid)             │
│  • propertySales           │  Vendas vinculadas ao email do cliente            │
│  • emailQueue              │  Fila de emails (para envio via Functions)          │
├────────────────────────────┼────────────────────────────────────────────────────┤
│  Firebase Storage          │                                                    │
│  • repair-attachments/     │  Fotos e vídeos da solicitação (URLs públicas)     │
├────────────────────────────┼────────────────────────────────────────────────────┤
│  IndexedDB                 │                                                    │
│  • repair_attachments      │  Fallback local quando Storage indisponível        │
└────────────────────────────┴────────────────────────────────────────────────────┘

RECOMENDAÇÕES PARA COMPROVAÇÃO JURÍDICA:
• Manter backup periódico de repairRequests e emailHistory
• Firestore mantém histórico com timestamp (createdAt, updatedAt)
• Anexos (fotos/vídeos) ficam em Storage com URL estável
• Cada alteração de status pode registrar data e autor em responses[]
• Backup do painel admin exporta: clientes, imóveis, reservas, reparos, emails
```

---

## 5. Fluxo de Status do Reparo (Admin → Emails)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  EVOLUÇÃO DO STATUS (idealmente pelo Admin)                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

  pendente ──► em_analise ──► em_andamento ──► concluído
                    │                │
                    │                │  [Data visita] ──► Email visita ao cliente
                    │                │
                    └────────────────┴──► [Data conclusão] ──► Email término ao cliente
```

**Ações sugeridas para o Admin:**
- Atualizar status (pendente → em_analise → em_andamento → concluído)
- Inserir data de visita ao mudar para em_andamento
- Inserir observação ao marcar como concluído
- Disparar emails automaticamente nessas mudanças

---

## 6. Resumo - Área do Cliente

| Módulo | Funcionalidade | Status |
|--------|----------------|--------|
| Login | Firebase + localStorage | ✓ Implementado |
| Cadastro | CPF em vendas + Firebase Auth | ✓ Implementado |
| Esqueci senha | Firebase + email | ✓ Implementado |
| Meus Imóveis | Lista de propriedades do cliente | ✓ Implementado |
| Documentos | Lista de documentos | ✓ Implementado |
| Reparos | Criar, listar, ver detalhes | ✓ Implementado |
| Manual | Manual do cliente | ✓ Implementado |
| Newsletter | Newsletter trimestral | ✓ Implementado |
| Histórico | Histórico de relacionamento | ✓ Implementado |
| Perfil | Editar dados | ✓ Implementado |
| Email abertura reparo | Empresa + Cliente | ✓ Implementado |
| Email visita reparo | Cliente (ao agendar/visitar) | ✓ Implementado |
| Email término reparo | Cliente + Empresa | ✓ Implementado |
| Armazenamento jurídico | localStorage + Firestore + emailAuditLog | ✓ Implementado |
| Backup/Export admin | clientes, imóveis, reservas, reparos, emails | ✓ Disponível |

---

## 7. Próximos Passos (Sugestões)

1. **Admin – gestão de reparos**
   - Tela para listar/editar reparos e alterar status.

2. **Emails automáticos por status**
   - Ao mudar para `em_andamento`: enviar email de confirmação de visita ao cliente.
   - Ao mudar para `concluído`: enviar email de término ao cliente e notificar a empresa.

3. **Reforço de comprovação jurídica**
   - Registrar em `responses[]` cada alteração de status (data, usuário, motivo).
   - Garantir que `emailHistory` também seja salvo no Firestore para auditoria.
