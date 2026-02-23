# Fluxograma - Solicitação de Reparo

## Visão geral do fluxo

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CLIENTE NA ÁREA DO CLIENTE                            │
│                         (Logado)                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Clica em "Nova Solicitação de Reparo" (aba Reparos)                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  showRepairRequestForm()                                                  │
│  • Abre modal                                                             │
│  • loadClientPropertiesForRepair() → preenche select de imóveis          │
│  • Reseta formulário                                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
         ┌──────────────────────┐         ┌──────────────────────┐
         │ Cliente SEM imóveis  │         │ Cliente COM imóveis   │
         │ • Select desabilitado│         │ • Select preenchido   │
         │ • Alerta amarelo     │         │ • Pode preencher      │
         │   exibido            │         │   formulário         │
         └──────────────────────┘         └──────────────────────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PREENCHIMENTO DO FORMULÁRIO                                              │
│  • Imóvel (select) *                                                       │
│  • Descrição *                                                             │
│  • Localização *                                                           │
│  • Fotos/Vídeo * → handleFileSelect() → validateRepairFiles()             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  VALIDAÇÃO DE ARQUIVOS (handleFileSelect / validateRepairFiles)           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  • Mínimo 3 fotos?  ──Não──► Erro + limpa seleção                │    │
│  │  • Máximo 5 arquivos?  ──Não──► Erro + limpa seleção             │    │
│  │  • Total ≤ 50MB?  ──Não──► Erro + limpa seleção                  │    │
│  │  • Imagens ≤ 10MB cada?  ──Não──► Erro + limpa seleção            │    │
│  │  • Vídeo ≤ 50MB?  ──Não──► Erro + limpa seleção                  │    │
│  │  • Apenas image/* e video/*?  ──Não──► Erro + limpa seleção       │    │
│  │  • Sim em todos  ──► selectedFiles = files, renderFilePreviews()  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Cliente clica "Enviar Solicitação" → submitRepairRequest(event)         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  VALIDAÇÃO PRÉ-ENVIO                                                      │
│  • Logado? ──Não──► "Você precisa estar logado"                          │
│  • Arquivos (3–5, min 3 fotos)? ──Não──► Erro                            │
│  • Imóvel selecionado? ──Não──► "Selecione um imóvel"                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │ OK
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Botão → disabled, texto "Enviando..."                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  UPLOAD DE ANEXOS                                                         │
│  • Firebase Storage (uploadRepairAttachmentsToFirebase) OU                │
│  • IndexedDB (saveAttachment)                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SALVAR SOLICITAÇÃO                                                       │
│  • localStorage (repairRequests)                                           │
│  • Firestore (saveRepairRequestToFirestore) se disponível                 │
│  • addClientHistory                                                       │
│  • sendRepairRequestEmail (se configurado)                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SUCESSO                                                                  │
│  • Mensagem "Solicitação enviada com sucesso!"                            │
│  • closeRepairRequestModal()                                               │
│  • loadClientRepairs() atualiza lista                                      │
│  • Botão volta ao estado normal                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Fluxo de fechamento do modal

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Cliente clica X, Cancelar ou fora do modal                              │
│  → closeRepairRequestModal()                                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌──────────────────────┐
                        │ isRepairFormFilled()? │
                        │ descrição OU         │
                        │ localização OU       │
                        │ selectedFiles > 0    │
                        └──────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │ Sim                           │ Não
                    ▼                               ▼
         ┌──────────────────────┐         ┌──────────────────────┐
         │ confirm("Tem certeza  │         │ Fecha modal direto    │
         │ que deseja sair?")    │         │ selectedFiles = []    │
         └──────────────────────┘         └──────────────────────┘
                    │
        ┌───────────┴───────────┐
        │ Cancelar              │ OK
        ▼                       ▼
  Modal permanece         Fecha modal
  aberto
```

## Regras de negócio (resumo)

| Regra              | Valor    |
|--------------------|----------|
| Mínimo de fotos    | 3        |
| Máximo de arquivos | 5        |
| Tamanho por imagem | 10 MB    |
| Tamanho por vídeo  | 50 MB    |
| Tamanho total      | 50 MB    |
| Tipos aceitos      | image/*, video/mp4, video/webm |
