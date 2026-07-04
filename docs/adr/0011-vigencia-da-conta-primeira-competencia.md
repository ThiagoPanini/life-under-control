# ADR 0011 — Vigência da Conta: primeira Competência canônica e backfill aditivo

- **Status:** Accepted
- **Data:** 2026-07-04
- **Decisores:** Thiago Panini (solo)
- **Relacionado:** [ADR-0005](0005-primitivos-descritivos-spine-especializacao.md) (a Conta é o Gerador especializado de Finanças; o campo é da especialização, não de um spine universal), [ADR-0007](0007-autonomia-total-do-agente.md) (migração **aditiva**, cláusula de dado), [ADR-0003](0003-nucleo-dominio-multi-borda.md) (a vigência é derivada no núcleo, a UI só a consome), CONTEXT.md invariante #5 (a Conta projeta o "quando"), issue [#102](https://github.com/ThiagoPanini/life-under-control/issues/102) (parent [#92](https://github.com/ThiagoPanini/life-under-control/issues/92))

## Contexto

O Mapa do Ano (#102) mostra cada Conta ao longo de doze Competências — a mesma janela da Análise Histórica. Sem saber **quando cada Conta passou a existir**, todo mês anterior à sua criação apareceria como "não pago": um falso atraso. A Conta guarda a *regra* (Recorrência + vencimento esperado) e, desde #99, a Competência de encerramento — mas não tinha um marco de **início**. Faltava a fronteira inferior da vigência.

O dado é irreplicável: em produção já há Contas com histórico de Lançamentos (o backfill #24). Adicionar um campo obrigatório sem quebrar esse dado exige uma migração que **derive** o início de cada Conta a partir do que já existe, não que o exija do operador Conta a Conta.

## Decisão

**A Conta ganha uma `primeiraCompetencia` canônica (`YYYY-MM`)** — o marco onde sua vigência começa. É validada no domínio (`ehCompetenciaValida`, movida para `bill.ts` como módulo-base) e no banco (`bills_primeira_competencia_check`). A partir dela:

- **Vigência = [`primeiraCompetencia` .. fim]**, onde `fim` é a Competência do encerramento (`mesDe(encerradaEm)`) ou aberta enquanto a Conta é ativa. Meses **antes** do início ou **depois** do fim são `fora-vigencia` — nunca "não pago". A vigência é **derivada** (não uma coluna por célula): o núcleo a computa em `derivarMapaAno`.
- **Contas encerradas aparecem** no Mapa enquanto sua vigência **intercepta** a janela de doze meses, mesmo fora do panorama vigente.
- **Backfill aditivo em 3 fases** (migração 0008), para não quebrar Conta já existente (ADR-0007): (1) adiciona a coluna *nullable*; (2) preenche pela **menor Competência de Lançamento** da Conta; (3) para a Conta **sem histórico**, usa a **Competência corrente** da migração; só então (4) torna o campo `NOT NULL` e amarra o check.
- **Conta nova** (criada pelo wizard) nasce com `primeiraCompetencia` = **Competência corrente** — não há histórico ainda; a borda a injeta pelo `Clock`. **Editar** a regra (comum ou rápida) **preserva** a primeira Competência: reajustar a Conta nunca move o início da vigência (invariante #4).

Dentro da vigência, célula sem ocorrência da Recorrência é `sem-ocorrencia`; ocorrência sem fato é `por-vir`/`vencida` (Clock/Calendar + vencimento); ocorrência com fato soma os splits e se compara à **média da própria Conta** (só fatos válidos, lacuna ≠ zero) com tolerância de **±5%**.

## Justificativa

- **A menor Competência de Lançamento é o melhor sinal disponível** do início real de uma Conta com histórico — deriva de fato persistido (invariante #3), sem pedir ao operador que date retroativamente cada Conta.
- **A Competência corrente é um piso seguro** para Conta sem histórico: nada antes de "agora" é reivindicado como vigência, então nenhum mês anterior vira falso atraso.
- **Aditiva por construção** (nullable → backfill → NOT NULL): roda uma vez contra o dado de produção sem down-migration destrutiva (ADR-0007, cláusula de dado). O `drizzle-kit generate` emitiria um `ADD COLUMN ... NOT NULL` que quebraria numa tabela populada — por isso a migração é escrita à mão.
- **Vigência derivada, não materializada:** manter a fronteira como campo único (`primeiraCompetencia` + `encerradaEm`) e derivar cada célula preserva "persistir fatos, derivar interpretações" — mudar o encerramento recomputa o Mapa sem reescrever nada.

## Consequências

- **Positivas:** o Mapa distingue honestamente "fora da vigência" de "não pago"; Contas encerradas continuam legíveis no período em que existiram; o backfill roda seguro em produção.
- **Negativas / aceito:** a primeira Competência backfillada é uma **heurística** — se a Conta real começou antes do Lançamento mais antigo registrado, o início fica otimista (mais recente que o verdadeiro). É corrigível editando o dado, mas não há hoje uma UI para ajustar a primeira Competência (o wizard não a expõe: nasce da Competência corrente e é preservada na edição).
- A migração 0008 é testada em Postgres (Seam 2) nos quatro cenários — Conta ativa/encerrada × com/sem histórico — com guarda de cobertura que falha no CI se o banco estiver indisponível (sem falso-verde).

## Opções rejeitadas

- **Exigir a primeira Competência do operador na migração.** Preciso, mas inviável: obrigaria datar retroativamente cada Conta já existente antes de liberar a feature — atrito que o backfill heurístico evita sem perder o essencial.
- **Derivar a vigência só dos Lançamentos, sem campo persistido.** Falha para Conta sem histórico (nenhuma fronteira) e para o mês corrente de uma Conta nova (viraria vazio, não "recém-criada"). O campo dá um marco estável independente de haver fato.
- **Materializar o estado de cada célula (uma linha por Conta×mês).** Contraria o invariante #3 (derivar, não persistir interpretação) e exigiria reescrita a cada encerramento/reativação — o Mapa é derivação pura sobre a mesma leitura de Contas e Lançamentos.

## Gatilhos de reabertura

- Surgir necessidade de o operador **corrigir** a primeira Competência de uma Conta (Conta que começou antes do Lançamento mais antigo) — pede uma UI de ajuste e uma política de revalidação da vigência.
- A janela de doze meses deixar de casar com a Análise Histórica (ex.: Mapa multi-ano), o que reabre a definição de "janela" compartilhada.
