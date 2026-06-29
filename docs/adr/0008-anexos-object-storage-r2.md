# ADR 0008 — Comprovantes (Anexos) em object storage S3-compatível (Cloudflare R2), via port

- **Status:** Accepted
- **Data:** 2026-06-28
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0003](0003-nucleo-dominio-multi-borda.md) (o acesso ao arquivo é um port no núcleo), [ADR-0007](0007-autonomia-total-do-agente.md) (cláusula de dado irreplicável; provisão de credencial), [CONTEXT.md](../../CONTEXT.md) (Anexo)

## Contexto

A primeira Área ativa (Finanças/Pagamentos) precisa guardar **comprovantes** de pagamento — o Anexo do CONTEXT.md. Hoje o dono salva os comprovantes localmente na máquina; o LUC vem justamente substituir isso, trazendo o arquivo pra dentro do portal ("tudo nasce de um ato no portal e vive no banco").

Comprovante é **dado irreplicável do casal** ([ADR-0007](0007-autonomia-total-do-agente.md)): um histórico de anos que não se reproduz a partir do repo. Onde guardar os *bytes* é a decisão — distinta dos metadados, que vão no Postgres com o resto. As famílias de opção: object storage gerido (Cloudflare R2, AWS S3), disco da própria VM (volume Coolify, MinIO self-hosted) ou nuvem pessoal (Google Drive, OneDrive).

## Decisão

**Os bytes dos Anexos vivem em object storage S3-compatível — Cloudflare R2.** Os *metadados* (nome, tipo, tamanho, chave no bucket, quem subiu, quando) vivem no Postgres, junto do Lançamento. O núcleo nunca fala com o R2 direto: um port **`AttachmentStore`** (subir, gerar URL assinada, apagar) isola o domínio do provedor, conforme o núcleo-multi-borda do [ADR-0003](0003-nucleo-dominio-multi-borda.md); o adapter concreto envolve o R2.

O upload é por **URL assinada** — o navegador sobe o arquivo direto pro R2, sem os bytes trafegarem pelo app. Anexo é **opcional e múltiplo** por item (um Lançamento pode ter zero, ou um boleto + um comprovante; às vezes nenhum, num pagamento em dinheiro); o v1 anexa só no Lançamento, e o modelo deixa espaço pra anexar numa Conta (um contrato) depois.

## Justificativa

- **Já estamos no Cloudflare.** DNS e proxy do LUC já vivem lá; R2 é um fornecedor a menos do que puxar uma conta AWS só pros arquivos. R2 é S3-compatível — o SDK e o modelo mental de "bucket" continuam valendo.
- **Durabilidade gerida respeita a cláusula de dado.** O [ADR-0007](0007-autonomia-total-do-agente.md) trata o dado do casal como insubstituível. Object storage gerido e replicado protege o comprovante melhor que o disco de uma VM única — ponto único de falha, sem redundância, com backup virando responsabilidade nossa.
- **Egress zero.** Comprovante é arquivo que se reabre direto (consultar um pagamento antigo); no S3 da AWS cada download custa, no R2 não.
- **O port mantém o núcleo testável e a troca barata.** Use-cases testam com um `AttachmentStore` fake (sem rede); trocar de provedor é trocar o adapter, não mexer no domínio.
- **Cabe folgado no free tier.** 10 GB ≈ milhares de comprovantes, anos do histórico.

## Consequências

- **Positivas:** o dado irreplicável vive durável, fora do ponto único da VM; o núcleo é agnóstico de provedor; o upload direto não passa bytes pelo app (mais leve, menos timeout).
- **Negativas / aceito:** mais um serviço externo e uma credencial a provisionar; a lógica de URL assinada (expiração, escopo) é complexidade a manter; lifecycle e backup do bucket precisam de configuração explícita.
- **Provisão pode tocar o operador.** Criar o bucket e emitir a credencial R2 depende do escopo do token Cloudflare; se a máquina não puder gerá-la, cai no caso 3 do [ADR-0007](0007-autonomia-total-do-agente.md) (segredo de terceiro) — passo de execução, não muda esta decisão.

## Opções rejeitadas

- **Volume na VM / MinIO self-hosted.** Mantém tudo on-host, mas é ponto único sem redundância — arrisca exatamente o dado que o [ADR-0007](0007-autonomia-total-do-agente.md) manda proteger; backup e durabilidade viram trabalho nosso. Não compensa pra dado irreplicável.
- **AWS S3.** É o S3 "canônico" e funcionaria, mas adiciona um fornecedor (conta AWS, IAM) e cobra egress. R2 entrega a mesma API S3 sem esses dois custos.
- **Google Drive / OneDrive.** Desalinha com "tudo vive no portal/banco": espalha o dado numa conta pessoal de terceiro, encarece o render inline (proxy/OAuth) e é "operar" uma integração externa. É o hábito atual (salvar fora) que o LUC vem substituir — não o destino do dado.

## Gatilhos de reabertura

- Volume ou custo do R2 saírem do free tier a ponto de mudar a conta da decisão.
- Surgir exigência de manter tudo on-prem (o que reabriria MinIO, aí com backup).
