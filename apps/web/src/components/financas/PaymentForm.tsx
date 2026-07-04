"use client"

import { FileText, Paperclip, Receipt, X } from "lucide-react"
import { useId, useState } from "react"
import { Button } from "@/components/ds/Button"
import { DatePicker } from "@/components/ds/DatePicker"
import {
  compactLabelClass,
  Field,
  FieldError,
  getFieldError,
  inputClass,
} from "@/components/ds/FormField"
import { PersonAvatar } from "@/components/ds/PersonAvatar"
import { PersonChip, personKey } from "@/components/ds/PersonChip"
import { formatarTamanhoArquivo } from "@/components/financas/file-size"
import type { PaymentFormInicial } from "@/components/financas/payment-form-inicial"
import type { ErroCampo } from "@/core/domain/bill"
import type { PessoaComAvatar } from "@/core/use-cases/resolve-avatares"

/** Dois arquivos homônimos de tamanhos diferentes são anexos distintos — a chave junta os dois. */
function chaveArquivo(file: File): string {
  return `${file.name}:${file.size}`
}

/**
 * Formulário de baixa de Lançamento (borda fina — Seam 3). Coleta valor, data de
 * pagamento, Competência e quem pagou, e submete ao server action. Serve a baixa
 * e a edição: o mesmo formulário, mudando só os valores iniciais e os rótulos. A
 * validação-fonte mora no núcleo (`validarDadosPayment`); aqui só há lógica de
 * borda — campos controlados (sobrevivem ao auto-reset do `<form action>` quando
 * o action devolve erro), exibição dos erros e o **aviso** (não-travante) quando
 * a competência escolhida já tem Lançamento. Apresentacional e injetável: recebe
 * `formAction`/`erros`/`pending`, então o teste o exercita sem o action real.
 */

export function PaymentForm({
  formAction,
  pessoas,
  inicial,
  competenciasComLancamento = [],
  erros = [],
  pending = false,
  submitLabel = "Registrar pagamento",
  submittingLabel = "Registrando…",
  onCancelar,
  competenciaOculta = false,
  notaValor,
  arquivos = [],
  onArquivosChange,
}: {
  formAction: (formData: FormData) => void
  pessoas: PessoaComAvatar[]
  inicial: PaymentFormInicial
  /** Competências da Conta que já têm Lançamento — base do aviso de duplicidade. */
  competenciasComLancamento?: string[]
  erros?: ErroCampo[]
  pending?: boolean
  submitLabel?: string
  submittingLabel?: string
  onCancelar?: () => void
  /** Modal compacto (Final): a competência vem fixa do bloco — submete como hidden, sem campo. */
  competenciaOculta?: boolean
  /** Nota faint sob o valor (ex.: a estimativa pelo histórico — o valor exato nasce no Lançamento). */
  notaValor?: string
  /** Comprovantes opcionais (modal compacto): presença de `onArquivosChange` liga o picker. */
  arquivos?: File[]
  onArquivosChange?: (files: File[]) => void
}) {
  const [valor, setValor] = useState(inicial.valor)
  const [dataPagamento, setDataPagamento] = useState(inicial.dataPagamento)
  const [competencia, setCompetencia] = useState(inicial.competencia)
  const [paidBy, setPaidBy] = useState(inicial.paidBy)
  // Confirmação em dois tempos da competência duplicada (Seam 3, #63): o 1º
  // clique arma, sem submeter; só "Confirmar" registra, "Cancelar" desarma.
  const [confirmando, setConfirmando] = useState(false)
  const formId = useId()

  const erroDe = (campo: string) => getFieldError(erros, campo)

  // Aviso (não trava): já existe um Lançamento naquela competência?
  const avisaCompetencia = competencia !== "" && competenciasComLancamento.includes(competencia)

  function mudarCompetencia(novaCompetencia: string) {
    setCompetencia(novaCompetencia)
    setConfirmando(false)
  }

  function adicionarArquivos(lista: FileList | null) {
    if (!lista || !onArquivosChange) return
    const porChave = new Map(arquivos.map((file) => [chaveArquivo(file), file]))
    for (const file of lista) porChave.set(chaveArquivo(file), file)
    onArquivosChange([...porChave.values()])
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" aria-busy={pending}>
      <Field
        label={competenciaOculta ? "Valor pago" : "Valor"}
        labelClassName={competenciaOculta ? compactLabelClass : undefined}
        htmlFor={`${formId}-valor`}
        error={erroDe("valor")}
      >
        {competenciaOculta ? (
          <div
            className={`flex min-h-[38px] items-center gap-2 rounded-[9px] border bg-white/[0.03] px-3 transition-[border-color,box-shadow] focus-within:border-luc-accent focus-within:ring-2 focus-within:ring-luc-accent ${
              erroDe("valor") ? "border-luc-warn" : "border-luc-border-strong"
            }`}
          >
            <span className="shrink-0 font-mono text-[13px] text-luc-muted">R$</span>
            <input
              id={`${formId}-valor`}
              name="valor"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent font-mono text-[14px] text-luc-text outline-none placeholder:text-luc-faint"
              aria-invalid={Boolean(erroDe("valor"))}
              aria-describedby={erroDe("valor") ? `${formId}-valor-error` : undefined}
            />
          </div>
        ) : (
          <input
            id={`${formId}-valor`}
            name="valor"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(erroDe("valor"))}
            aria-describedby={erroDe("valor") ? `${formId}-valor-error` : undefined}
          />
        )}
        {notaValor && <p className="text-[10.5px] text-luc-faint leading-snug">{notaValor}</p>}
      </Field>

      {competenciaOculta ? (
        <>
          <input type="hidden" name="competencia" value={competencia} />
          {avisaCompetencia && (
            <p role="status" className="text-luc-warn text-sm leading-snug">
              Já existe um Lançamento nesta competência — confirme para registrar mesmo assim.
            </p>
          )}
        </>
      ) : (
        <Field label="Competência" htmlFor={`${formId}-competencia`} error={erroDe("competencia")}>
          <input
            id={`${formId}-competencia`}
            name="competencia"
            type="month"
            value={competencia}
            onChange={(e) => mudarCompetencia(e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(erroDe("competencia"))}
            aria-describedby={erroDe("competencia") ? `${formId}-competencia-error` : undefined}
          />
          {avisaCompetencia && (
            <p role="status" className="text-luc-warn text-sm leading-snug">
              Já existe um Lançamento nesta competência — confirme para registrar mesmo assim.
            </p>
          )}
        </Field>
      )}

      <Field
        label={competenciaOculta ? "Data do pagamento" : "Data de pagamento"}
        labelClassName={competenciaOculta ? compactLabelClass : undefined}
        htmlFor={`${formId}-data`}
        error={erroDe("dataPagamento")}
      >
        <DatePicker
          id={`${formId}-data`}
          name="dataPagamento"
          value={dataPagamento}
          onChange={setDataPagamento}
          invalid={Boolean(erroDe("dataPagamento"))}
          describedBy={erroDe("dataPagamento") ? `${formId}-data-error` : undefined}
          compact={competenciaOculta}
        />
      </Field>

      {(() => {
        const paidByErro = erroDe("paidBy")
        const erroId = paidByErro ? `${formId}-paidBy-error` : undefined
        return (
          // Grupo de chips-toggle, não um único controle — `<fieldset>`/`<legend>`
          // (não `<label htmlFor>`, que só serve um controle focável) mantém o
          // rótulo e o erro associados a cada botão do grupo.
          <fieldset
            className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
            aria-invalid={Boolean(paidByErro)}
            aria-describedby={erroId}
          >
            <legend
              className={`p-0 ${competenciaOculta ? compactLabelClass : "text-[11.5px] font-semibold text-luc-text-3"}`}
            >
              {competenciaOculta ? "Pago por" : "Quem pagou"}
            </legend>
            <input type="hidden" name="paidBy" value={paidBy} />
            <div className={competenciaOculta ? "flex gap-2" : "flex flex-wrap gap-2"}>
              {pessoas.map((p) => {
                const pressionado = paidBy === p.id
                const key = personKey(p)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={pressionado}
                    onClick={() => setPaidBy(p.id)}
                    className={
                      competenciaOculta
                        ? // Segmento do protótipo Final: 38px, raio 9, avatar 22px + nome;
                          // selecionado veste accent 45% na borda e accent-06 no fundo.
                          `flex min-h-[38px] flex-1 items-center justify-center gap-2 rounded-[9px] border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-luc-accent ${
                            pressionado
                              ? "border-luc-accent/45 bg-luc-accent-06"
                              : "border-luc-border bg-transparent hover:border-luc-border-strong"
                          }`
                        : `rounded-luc-lg outline-none transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg ${
                            pressionado ? "ring-2 ring-luc-accent" : "opacity-60 hover:opacity-100"
                          }`
                    }
                  >
                    {competenciaOculta ? (
                      <>
                        <PersonAvatar
                          avatarUrl={p.avatarUrl}
                          inicial={p.inicial}
                          nome={p.nome}
                          size={22}
                          colors={{
                            color: `var(--luc-${key}-fg)`,
                            backgroundColor: `var(--luc-${key}-bg)`,
                          }}
                          className="rounded-luc-sm"
                          decorative
                        />
                        <span className="text-[12.5px] font-semibold text-luc-text">{p.nome}</span>
                      </>
                    ) : (
                      <PersonChip pessoa={p} />
                    )}
                  </button>
                )
              })}
            </div>
            {paidByErro && <FieldError id={erroId}>{paidByErro}</FieldError>}
          </fieldset>
        )
      })()}

      {onArquivosChange && (
        <div className="flex flex-col gap-1.5">
          <span className={compactLabelClass}>
            Comprovantes{" "}
            <span className="font-semibold normal-case tracking-normal text-luc-faint">
              · opcional
            </span>
          </span>
          {arquivos.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {arquivos.map((file) => {
                const pdf = /pdf$/i.test(file.type)
                const IconeArquivo = pdf ? FileText : Receipt
                return (
                  <li
                    key={chaveArquivo(file)}
                    className="flex items-center gap-2.5 rounded-[9px] border border-luc-accent/[0.32] bg-luc-accent-06 px-[11px] py-[9px]"
                  >
                    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-luc-accent-12 text-luc-accent-bright">
                      <IconeArquivo aria-hidden size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-luc-text">
                        {file.name}
                      </span>
                      <span className="block font-mono text-[10px] text-luc-muted">
                        {formatarTamanhoArquivo(file.size)}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover ${file.name}`}
                      onClick={() =>
                        onArquivosChange(
                          arquivos.filter((item) => chaveArquivo(item) !== chaveArquivo(file)),
                        )
                      }
                      className="flex shrink-0 rounded-[7px] p-1 text-luc-text-3 transition-colors hover:text-luc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
                    >
                      <X aria-hidden size={15} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <label className="flex cursor-pointer items-center gap-[9px] rounded-[9px] border border-luc-border-strong border-dashed bg-white/[0.02] px-3 py-[11px] transition-colors hover:border-luc-accent/45 hover:bg-white/[0.04] focus-within:ring-2 focus-within:ring-luc-accent">
            <Paperclip aria-hidden size={15} className="shrink-0 text-luc-text-3" />
            <span className="min-w-0 flex-1 text-[12.5px] text-luc-text-2">
              Anexar comprovantes <span className="text-luc-faint">· imagem ou PDF</span>
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="sr-only"
              onChange={(event) => adicionarArquivos(event.target.files)}
            />
          </label>
        </div>
      )}

      {/* Rodapé: no compacto, Cancelar estreito + primário de largura cheia (Final);
          nas demais vestes, o par alinhado à direita de sempre. */}
      <div
        className={
          competenciaOculta
            ? "flex items-center gap-[9px] pt-0.5"
            : "flex items-center justify-end gap-3 pt-1"
        }
      >
        {onCancelar && (
          <Button variant="secondary" type="button" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        {avisaCompetencia && !confirmando && (
          <Button
            variant="primary"
            type="button"
            onClick={() => setConfirmando(true)}
            className={competenciaOculta ? "flex-1" : undefined}
          >
            {submitLabel}
          </Button>
        )}
        {avisaCompetencia && confirmando && (
          <>
            {/* "Voltar" (desarma a confirmação), nunca "Cancelar" — evitar dois
                botões com o mesmo nome acessível quando `onCancelar` (edição)
                também está presente e faz uma coisa bem diferente (sai do form). */}
            <Button variant="secondary" type="button" onClick={() => setConfirmando(false)}>
              Voltar
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={pending}
              className={competenciaOculta ? "flex-1" : undefined}
            >
              {pending ? submittingLabel : "Confirmar"}
            </Button>
          </>
        )}
        {!avisaCompetencia && (
          <Button
            variant="primary"
            type="submit"
            disabled={pending}
            className={competenciaOculta ? "flex-1" : undefined}
          >
            {pending ? submittingLabel : submitLabel}
          </Button>
        )}
      </div>
    </form>
  )
}
