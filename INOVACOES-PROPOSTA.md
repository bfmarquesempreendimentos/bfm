# Inovações Propostas – B F Marques

## Origem das ideias

Este documento consolida funcionalidades e conceitos do sistema **BF Marques Gestão Inteligente v01** (Flutter, abandonado) para implementação no site atual **Exibição e Gerência de Vendas** (HTML/JS + Firebase).

Ambos os sistemas são da mesma empresa: **B F Marques Empreendimentos** – construtora e venda de imóveis próprios.

---

## 1. O que o sistema antigo (Flutter) tinha

### 1.1 Módulos principais

| Módulo | Descrição |
|--------|-----------|
| **Imóveis** | CRUD, unidades, galeria, status (disponível/reservado/vendido) |
| **Corretores** | Cadastro, aprovação, portal de imóveis, reservas |
| **Portal Cliente** | Meus imóveis, **boletos**, chamados, perfil |
| **Chamados/Pós-venda** | Abertura, **thread de comentários**, **responsável**, **custo**, **tipo** |
| **Financeiro** | Lançamentos, centros de custo, balanço, DRE, fluxo de caixa |
| **Jurídico** | Processos, prazos, modelos de documentos |
| **Frota** | Veículos, abastecimentos, manutenções |
| **Aluguel** | Contratos, pagamentos, recibos |
| **Controle de Ponto** | Check-in/out com selfie e geolocalização |
| **Obras e Tarefas** | Obras, tarefas por obra |
| **Importação em massa** | 7 empreendimentos, 109 unidades via JSON |

### 1.2 Automações (Cloud Functions)

- **verificarAlertasDiarios** – 08:00
- **fechamentoSemanalFolha** – sexta 17:00
- **gerarReceitasAluguel** – dia 01, 07:00
- **verificarFaltaCheckIn** – 09:15
- **verificarPrazosJuridicos** – 09:00

### 1.3 Conceitos úteis

- **Timeline do imóvel** – Eventos: chamado_aberto, chamado_concluido, reservado, vendido
- **LinkService** – Vinculação entre entidades e timeline
- **FCM (Push)** – Notificações em tempo real
- **Procfy** – Integração financeira
- **Modelos de documentos** – Templates com placeholders para contratos

---

## 2. O que o site atual já tem (e deve manter)

| Funcionalidade | Status |
|----------------|--------|
| Site institucional público | ✓ |
| MCMV / Calculadora FGTS | ✓ |
| Formulário de contato | ✓ |
| Chatbot WhatsApp | ✓ |
| Reserva de imóveis (corretores) | ✓ |
| Área do Cliente | ✓ |
| Reparos/Chamados | ✓ (com emails) |
| Manual do cliente | ✓ |
| Newsletter trimestral | ✓ |
| Módulo de Aluguéis | ✓ (parcial) |

---

## 3. Inovações para implementar (priorizadas)

### 3.1 Prioridade alta (curto prazo)

| # | Inovação | Descrição | Esforço |
|---|----------|-----------|---------|
| 1 | **Boletos na Área do Cliente** | Lista de boletos/parcelas do financiamento, status (pendente/pago), vencimento, comprovante | Médio |
| 2 | **Thread de comentários nos reparos** | Comentários com autor, texto e data (como no Flutter) | Baixo |
| 3 | **Tipo do reparo** | Campo: manutenção, reclamação, sugestão, geral | Baixo |
| 4 | **Responsável no reparo** | Atribuir técnico/responsável (select no admin) | Baixo |
| 5 | **Custo do reparo** | custoEstimado, custoTotal para controle | Baixo |

### 3.2 Prioridade média

| # | Inovação | Descrição | Esforço |
|---|----------|-----------|---------|
| 6 | **Timeline do imóvel** | Histórico de eventos (chamado aberto, concluído, reserva, venda) | Médio |
| 7 | **Push notifications (FCM)** | Notificações em tempo real para cliente e equipe | Alto |
| 8 | **Export PDF/Excel de reparos** | Relatório por reparo ou período | Médio |
| 9 | **Dashboard com métricas** | Gráficos: chamados abertos, vendas por mês, unidades disponíveis | Médio |

### 3.3 Prioridade baixa (longo prazo)

| # | Inovação | Descrição |
|---|----------|-----------|
| 10 | **Modelos de documentos** | Templates para contratos, distratos, recibos |
| 11 | **Integração Procfy** | Importação de transações financeiras |
| 12 | **Módulo Financeiro** | Centros de custo, lançamentos, balanço |
| 13 | **Módulo Jurídico** | Processos, prazos |
| 14 | **Frota** | Veículos, manutenções |
| 15 | **Controle de Ponto** | Check-in com geolocalização |

---

## 4. Detalhamento técnico das inovações prioritárias

### 4.1 Boletos na Área do Cliente

**Estrutura sugerida (Firestore):**
```
boletos/{boletoId}
  - clienteId
  - imovelId / vendaId
  - valor
  - vencimento
  - status: pendente | pago | vencido
  - pagamentoEm (se pago)
  - comprovanteUrl (opcional)
```

**UI:** Nova aba ou seção em `client-area.html` → "Meus Boletos"

---

### 4.2 Thread de comentários nos reparos

**Estrutura atual:** `repairRequests` com `responses[]` (automáticas)

**Estrutura sugerida:** Adicionar `comentarios[]`:
```javascript
{
  id: string,
  texto: string,
  autorId: string,
  autorNome: string,
  dataCriacao: timestamp
}
```

**UI:** Formulário para adicionar comentário + exibição em thread na área do cliente e no admin.

---

### 4.3 Tipo do reparo

**Campo:** `tipo`: `'geral' | 'manutencao' | 'reclamacao' | 'sugestao'`

**UI:** Select no formulário de abertura de reparo.

---

### 4.4 Responsável no reparo

**Campos:** `responsavelId`, `responsavelNome`

**UI:** Select no admin (lista de técnicos/colaboradores ou texto livre).

---

### 4.5 Custo do reparo

**Campos:** `custoEstimado`, `custoTotal`

**UI:** Campos numéricos no admin ao editar reparo.

---

### 4.6 Timeline do imóvel

**Estrutura (Firestore):**
```
imoveis/{imovelId}/timeline/{eventoId}
  - tipo: chamado_aberto | chamado_concluido | reservado | vendido
  - byUid, byEmail
  - data
  - nota
  - refs (chamadoId, etc.)
```

**UI:** Seção "Histórico" na área do cliente e no detalhe do imóvel no admin.

---

## 5. Roadmap sugerido

| Fase | Itens | Prazo estimado |
|------|-------|----------------|
| **Fase 1** | Tipo, responsável, custo do reparo | 1–2 dias |
| **Fase 2** | Thread de comentários | 2–3 dias |
| **Fase 3** | Boletos na área do cliente | 3–5 dias |
| **Fase 4** | Timeline do imóvel | 2–3 dias |
| **Fase 5** | Dashboard com métricas | 3–5 dias |
| **Fase 6** | Export PDF/Excel | 2–3 dias |

---

## 6. Checklist de aprovação

Marque o que deseja implementar:

- [ ] Boletos na Área do Cliente
- [ ] Thread de comentários nos reparos
- [ ] Tipo do reparo (manutenção, reclamação, sugestão)
- [ ] Responsável no reparo
- [ ] Custo do reparo
- [ ] Timeline do imóvel
- [ ] Dashboard com métricas
- [ ] Export PDF/Excel de reparos
- [ ] Push notifications (FCM)
- [ ] Outro: _____________

---

*Documento gerado a partir da análise do sistema BF Marques Gestão Inteligente v01 e do comparativo com o site atual.*
