# ADR 0013 — Extração de comprovante por LLM vision atrás de port (Claude no Bedrock)

- **Status:** Accepted
- **Data:** 2026-07-06
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0012](0012-whatsapp-borda-meta-cloud-api.md) (a borda que consome o extrator), [ADR-0003](0003-nucleo-dominio-multi-borda.md) (ports no núcleo, adapters na borda), [ADR-0008](0008-anexos-object-storage-r2.md) (onde o comprovante vive), backfill #24/#124 (que consagrou o shape do recibo extraído), CONTEXT.md invariante #6 (dinheiro exato)

## Contexto

A ingestão de comprovante pelo WhatsApp (ADR-0012) precisa extrair, de uma imagem ou PDF, os dados que hoje uma Pessoa digita: valor, data de pagamento, favorecido, vencimento impresso. O backfill provou que **vision de LLM extrai bem esses documentos brasileiros** (Nubank, Itaú, boletos — layouts heterogêneos), mas o passe de visão foi trabalho externo de sessão: **não deixou código de runtime**. Esta é a primeira dependência de LLM no caminho de execução do app — merece registro do porquê e da fronteira.

## Decisão

**Port `ReceiptExtractor` no núcleo**: `(conteudo: Uint8Array, tipoMime) → ReciboExtraido` com o shape consagrado no backfill — `valorCentavos`, `dataPagamento`, `favorecido`, `vencimentoImpresso`, `mesReferenciaImpresso` (todos nuláveis quando ilegíveis; "ilegível" nunca vira palpite). O núcleo **valida** o retorno (centavos inteiros > 0, datas ISO) — não confia no adapter.

**Adapter Bedrock com Claude**: `AnthropicBedrockMantle` (`@anthropic-ai/bedrock-sdk`), modelo `anthropic.claude-opus-4-8`, região us-east-1, **structured output** com schema do shape acima — o JSON sai validado pela API, sem parsing frágil de texto livre. Imagem e PDF entram nativos (blocos `image`/`document`).

**O LLM extrai, não decide.** Matching de Conta, inferência de Competência e a criação do fato ficam no núcleo determinístico + confirmação humana (ADR-0012). O modelo lê o documento; quem lança é a Pessoa.

## Justificativa

- **Vision semântica é o caminho provado** para esses documentos: o backfill validou a abordagem e o vocabulário de saída contra 190 comprovantes reais; o port só transporta esse contrato para o runtime.
- **Structured output elimina a classe de bug de parsing** — o schema é imposto na API, e a validação do núcleo é a segunda linha (invariante #6: dinheiro é exato).
- **O port confina o lock-in**: trocar de provider (Bedrock → API Anthropic direta ou outro) é reescrever um adapter de ~100 linhas; prompt e schema são compartilháveis.
- **Bedrock por vouchers e familiaridade**: o operador tem créditos AWS "à vontade" — custo zero de bolso. O argumento é conveniência, não economia: na API direta o mesmo volume (~30 comprovantes/mês) custaria menos de US$ 1/mês.

## Consequências

- **Positivas:** o extrator nasce testável (fake do port nos use-cases, sem rede); uma segunda borda de ingestão futura (e-mail, upload em lote no portal) reusa o mesmo port; o shape único mantém backfill e runtime falando a mesma língua.
- **Negativas / aceito:** credenciais AWS + habilitação do modelo no console são atos do operador (caso 3 da autonomia); a extração depende de serviço externo — indisponibilidade do Bedrock degrada a ingestão para "tente de novo mais tarde" (o evento fica gravado; nada se perde); saída de LLM é não-determinística por natureza — mitigada por schema + validação + confirmação humana.

## Opções rejeitadas

- **AWS Textract + parser determinístico.** OCR cru exigiria um parser por layout de banco, quebrando em silêncio a cada mudança de layout — regride o que o backfill já provou com extração semântica.
- **API Anthropic direta como primeiro adapter.** Mesma superfície de SDK e uma única API key — é o **fallback documentado** se a burocracia do Bedrock travar; preterida só pelos vouchers.
- **Digitação manual assistida (sem extração).** Nega o valor da feature — o clímax é o comprovante virar proposta pronta.

## Gatilhos de reabertura

- Bedrock indisponível ou burocracia de acesso travando a fase 1 — ativa o adapter da API direta (mesmo prompt/schema).
- Qualidade de extração insuficiente na prática (campos errados recorrentes) — revisita modelo, prompt ou pré-processamento da imagem.
- Nova borda de ingestão com documento de natureza diferente (extrato, fatura multi-página) — reavalia se o shape `ReciboExtraido` cobre ou se nasce um segundo port.
