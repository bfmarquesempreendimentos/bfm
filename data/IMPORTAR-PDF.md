# Importar Reservas do PDF "PRONTOS A VENDA"

## Como usar

1. Abra o PDF e anote, para cada página com imóvel reservado, o que aparece no rodapé:
   - **CS** (casa/unidade): ex. CS 04, APTO 101, casa 05
   - **Corretor**: nome ou email de quem reservou

2. **Regra importante**: Só inclua corretores **já cadastrados** no sistema.
   - Eduardo (sac1consultoria@gmail.com) está cadastrado.
   - "Click" ou "CS 4 Click" **não está cadastrado** – NÃO adicione essas reservas.

3. Edite o arquivo `data/pdf-prontos-a-venda-import.json` e preencha o array `reservas`:

```json
{
  "reservas": [
    {
      "propertyId": 4,
      "unitCode": "CS 04",
      "corretorEmail": "sac1consultoria@gmail.com",
      "status": "reservado"
    }
  ]
}
```

**IDs dos empreendimentos:**
- 1 = Porto Novo
- 2 = Itaúna  
- 3 = Amendoeiras
- 4 = Laranjal
- 5 = Apolo
- 6 = Coelho
- 7 = Caçador

4. No Admin Panel, vá em **Reservas** e clique em **Importar do PDF**.

5. O sistema vai:
   - Adicionar reservas apenas de corretores cadastrados
   - Atualizar o status das unidades na tabela
   - Ignorar reservas de corretores não cadastrados (ex: Click)
