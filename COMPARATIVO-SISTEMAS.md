# Comparativo: Exibição e Gerência de Vendas vs BF Marques Gestão Inteligente (Backup)

## Contexto

| Aspecto | Sistema atual (Exibição e Gerência) | Sistema backup (Gestão Inteligente) |
|---------|-------------------------------------|-------------------------------------|
| **Tecnologia** | HTML + JavaScript (site estático) | Flutter (app multiplataforma) |
| **Plataformas** | Web | Android, iOS, Web, macOS, Windows |
| **Backend** | Firebase (Auth, Firestore, Storage) + localStorage | Firebase (Auth, Firestore, Storage, FCM) |
| **Propósito** | Site institucional + Área do Cliente + Admin | ERP/Gestão completa da empresa |

---

## 1. O que o sistema ATUAL tem (e o backup pode não ter ou ter diferente)

| Funcionalidade | Atual | Backup |
|----------------|-------|--------|
| Site institucional (público) | ✓ Páginas HTML, imóveis, simulador, MCMV, calculadora, contato | ✗ App requer login |
| MCMV / Calculadora FGTS | ✓ mcmv.html, calculadora.html | ✗ Não encontrado |
| Formulário de contato público | ✓ | ✗ |
| Chatbot/WhatsApp Leads | ✓ whatsapp-leads.js | ✗ |
| Reserva de imóveis (corretores) | ✓ | ✓ (portal corretores) |
| Vendas (registro de vendas) | ✓ property-sales | ✓ |
| Área do Cliente (web) | ✓ client-area.html | ✓ (portal cliente Flutter) |
| Manual do cliente | ✓ | ✗ |
| Newsletter trimestral | ✓ | ✗ |
| Integração email (queue Firestore) | ✓ | ✓ (FCM push) |

---

## 2. O que o BACKUP tem (e falta no sistema atual)

### 2.1 Portal do Cliente

| Recurso | Backup (Gestão Inteligente) | Atual (Exibição) |
|---------|-----------------------------|------------------|
| **Boletos** | ✓ Meus Boletos, detalhes, pagamento, comprovante | ✗ Não existe |
| **Chamados com comentários** | ✓ Thread de comentários por chamado | Parcial (responses[] mas sem thread interativa) |
| **Classificação de chamado** | ✓ tipo: geral, manutenção, reclamação, sugestão | ✗ Apenas prioridade (normal, alta, urgente) |
| **Responsável atribuído** | ✓ responsavelId, responsavelNome | ✗ Não existe |
| **Classificação reparo aprovado** | ✓ Cria despesa automática ao aprovar | ✗ Não existe |
| **Custo do reparo** | ✓ custoTotal, custoEstimado | ✗ Não existe |
| **Timeline do imóvel** | ✓ Eventos no imóvel (chamado_aberto, chamado_concluido) | ✗ Não existe |
| **Stream/listener em tempo real** | ✓ Firestore StreamBuilder | Parcial (recarrega manual) |

### 2.2 Pós-venda / Chamados (Cloud Functions)

| Recurso | Backup | Atual |
|---------|--------|-------|
| **Push ao criar chamado** | ✓ FCM para operação e administração | ✗ Apenas email |
| **Push ao finalizar** | ✓ FCM para o cliente | ✗ Apenas email |
| **Criação automática de despesa** | ✓ Ao finalizar com custo ou reparo aprovado | ✗ Não existe |
| **Registro em timeline** | ✓ imoveis/{id}/timeline | ✗ Não existe |

### 2.3 Módulos que NÃO existem no sistema atual

| Módulo | Descrição no Backup |
|--------|---------------------|
| **Financeiro** | Lançamentos, centros de custo, balanço, relatório |
| **Jurídico** | Processos, prazos, modelos de documentos |
| **Frota** | Veículos, abastecimentos, manutenções |
| **Compras** | Lista, aprovação, lançamentos |
| **Aluguel** | Contratos de aluguel, pagamentos, recibos |
| **Obras e Tarefas** | Obras, tarefas por obra |
| **Controle de Ponto** | Ponto de colaboradores |
| **Equipe/Colaboradores** | Cadastro, folha de pagamento |
| **Importação em massa** | JSON de empreendimentos (7 empreendimentos, 109 unidades) |
| **Jobs agendados** | verificarAlertasDiarios, fechamentoSemanalFolha, gerarReceitasAluguel, etc. |
| **Dashboard com métricas** | Chamados abertos, vendas, gráficos por mês |
| **PDF de chamado** | Geração de PDF com timeline |
| **Excel de chamados** | Exportação relatório |
| **Utilitários centralizados** | ErrorHandler, LoadingHelper, PermissionHelper, ValidationHelper |

---

## 3. Comparativo direto: Chamados/Reparos

| Aspecto | Backup (Chamado) | Atual (Reparo) |
|---------|------------------|----------------|
| Collection Firestore | `chamados` | `repairRequests` |
| Status | aberto, em_andamento, resolvido, fechado | pendente, em_analise, em_andamento, concluido, cancelado |
| Prioridade | 1-4 (numérico) | normal, alta, urgente |
| Comentários | Lista de Comentario (autor, texto, data) | responses[] (type, message, date) |
| Anexos | fotosUrls, videosUrls, anexos | attachments (Storage/IndexedDB) |
| Responsável | responsavelId, responsavelNome | ✗ |
| Tipo | geral, manutenção, reclamação, sugestão | ✗ |
| Classificação | reparo_aprovado → despesa | ✗ |
| Custo | custoTotal, custoEstimado | ✗ |
| Timeline imóvel | ✓ | ✗ |
| FCM/Push | ✓ | ✗ |
| Emails | ✗ (usa push) | ✓ Abertura, visita, término |

---

## 4. Sugestões de melhorias (com base no backup)

### 4.1 Prioridade alta (mais próximas do fluxo atual)

1. **Boletos na Área do Cliente**  
   Permitir que o cliente veja parcelas/boletos do financiamento. O backup tem `boleto_service`, `meus_boletos_page`, `detalhes_boleto_page`.  
   → **Falta:** listar boletos por cliente, status (pendente/pago), vencimento.

2. **Thread de comentários no reparo**  
   Comentários como no backup (autor, texto, data) em vez de apenas responses automáticas.  
   → **Falta:** formulário para admin/cliente adicionar comentário e exibir como thread.

3. **Classificação/tipo do reparo**  
   Tipo: manutenção, reclamação, sugestão (como no backup).  
   → **Falta:** campo `tipo` no formulário de reparo.

4. **Responsável no reparo**  
   Atribuir técnico/responsável ao reparo.  
   → **Falta:** campo responsavelId/responsavelNome e select no admin.

5. **Custo do reparo**  
   Registrar custo estimado e real para controle financeiro.  
   → **Falta:** custoEstimado, custoTotal no reparo e possivelmente lançamento em despesa.

### 4.2 Prioridade média

6. **Timeline do imóvel**  
   Histórico de eventos (abertura de chamado, conclusão, etc.) no imóvel.  
   → **Falta:** collection/documento de timeline e UI para visualizar.

7. **Push notifications (FCM)**  
   Notificações em tempo real para cliente e equipe.  
   → **Falta:** Firebase Cloud Messaging e handlers no front.

8. **Export PDF/Excel do reparo**  
   Relatório em PDF ou planilha por reparo.  
   → **Falta:** geração de PDF/Excel no admin.

### 4.3 Prioridade baixa (ERP completo)

9. **Módulo Financeiro** – Centros de custo, lançamentos, balanço  
10. **Módulo Jurídico** – Processos, prazos, modelos  
11. **Frota** – Veículos, manutenções  
12. **Compras** – Aprovação e lançamentos  
13. **Obras e Tarefas**  
14. **Controle de Ponto**  
15. **Jobs agendados** – Alertas, folha, receitas  

Esses itens exigem mudanças de escopo e arquitetura do sistema atual.

---

## 5. Resumo executivo

| Categoria | Situação |
|-----------|----------|
| **O que o atual faz bem** | Site público, MCMV, área do cliente, reparos com emails, manual, newsletter |
| **Principais lacunas** | Boletos, comentários em thread, tipo/responsável/custo do reparo |
| **Diferencial do backup** | ERP completo (financeiro, jurídico, frota, obras, ponto, etc.) |
| **Arquitetura** | Atual: web estático. Backup: app Flutter com backend Firebase mais complexo |

---

## 6. Próximos passos sugeridos

Para evoluir o sistema atual em direção ao backup, recomenda-se:

1. **Implementar boletos** – Integração com sistema de cobrança ou estrutura mínima (valor, vencimento, status).
2. **Enriquecer reparos** – Tipo, responsável, custo e thread de comentários.
3. **Definir escopo** – Decidir se financeiro, jurídico, frota etc. devem entrar no escopo ou permanecer fora.
4. **Manter foco em web** – O backup é Flutter; o atual é web. Migrar seria outro projeto. As ideias do backup podem ser adaptadas em HTML/JS.

---

*Documento gerado para aprovação de alterações. Marque abaixo o que deseja implementar.*

### [ ] Aprovar alterações

- [ ] Boletos na Área do Cliente  
- [ ] Thread de comentários nos reparos  
- [ ] Tipo do reparo (manutenção, reclamação, sugestão)  
- [ ] Responsável no reparo  
- [ ] Custo do reparo  
- [ ] Outro: _____________
