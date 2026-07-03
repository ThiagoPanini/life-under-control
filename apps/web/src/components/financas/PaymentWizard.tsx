"use client"

import { Check, FileText, Pencil, Upload } from "lucide-react"
import { type ReactNode, useEffect, useId, useState } from "react"
import { Button } from "@/components/ds/Button"
import { Field, FieldError, getFieldError, inputClass } from "@/components/ds/FormField"
import { PersonChip } from "@/components/ds/PersonChip"
import type { PaymentFormInicial } from "@/components/financas/payment-form-inicial"
import { type ErroCampo, formatarDataBr } from "@/core/domain/bill"
import { formatBRL, parseCentavos } from "@/core/domain/money"
import type { PessoaComAvatar } from "@/core/use-cases/resolve-avatares"

const PASSOS = ["Competência", "Pagamento", "Autoria", "Comprovante", "Resumo"]
const COPY = [
  ["A que Competência pertence?", "Escolha o período que este Lançamento registra."],
  ["Qual foi o valor real?", "Registre o que foi pago e a data em que aconteceu."],
  ["Quem pagou?", "Autoria é uma nota do fato — o acesso continua simétrico."],
  ["Quer guardar o comprovante?", "Imagens e PDFs são opcionais; você pode anexar mais de um."],
  ["Confirmar o Lançamento", "Revise o fato antes de registrá-lo."],
] as const

const PASSO_DO_CAMPO: Record<string, number> = {
  competencia: 0,
  valor: 1,
  dataPagamento: 1,
  paidBy: 2,
  arquivo: 3,
}

function chaveArquivo(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function PaymentWizard({
  formAction,
  pessoas,
  inicial,
  competenciasComLancamento = [],
  erros = [],
  pending = false,
  arquivos,
  onArquivosChange,
}: {
  formAction: (formData: FormData) => void
  pessoas: PessoaComAvatar[]
  inicial: PaymentFormInicial
  competenciasComLancamento?: string[]
  erros?: ErroCampo[]
  pending?: boolean
  arquivos: File[]
  onArquivosChange: (files: File[]) => void
}) {
  const [passo, setPasso] = useState(0)
  const [valor, setValor] = useState(inicial.valor)
  const [dataPagamento, setDataPagamento] = useState(inicial.dataPagamento)
  const [competencia, setCompetencia] = useState(inicial.competencia)
  const [paidBy, setPaidBy] = useState(inicial.paidBy)
  const formId = useId()
  const avisaCompetencia = competencia !== "" && competenciasComLancamento.includes(competencia)
  const pessoa = pessoas.find((item) => item.id === paidBy)
  const centavos = parseCentavos(valor)

  useEffect(() => {
    if (erros.length === 0) return
    setPasso(Math.min(...erros.map((erro) => PASSO_DO_CAMPO[erro.campo] ?? 0)))
  }, [erros])

  const erroDe = (campo: string) => getFieldError(erros, campo)

  function adicionarArquivos(lista: FileList | null) {
    if (!lista) return
    const porChave = new Map(arquivos.map((file) => [chaveArquivo(file), file]))
    for (const file of lista) porChave.set(chaveArquivo(file), file)
    onArquivosChange([...porChave.values()])
  }

  return (
    <form action={formAction} className="flex flex-col gap-7" aria-busy={pending}>
      <ol className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
        {PASSOS.map((titulo, indice) => (
          <li
            key={titulo}
            aria-current={passo === indice ? "step" : undefined}
            className={`flex items-center gap-1 ${passo === indice ? "text-luc-accent" : indice < passo ? "text-luc-success" : "text-luc-text-3"}`}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[9px] ${passo === indice ? "border-luc-accent bg-luc-accent-12" : indice < passo ? "border-luc-success/30 bg-luc-success/10" : "border-luc-border bg-luc-surface-2"}`}
            >
              {indice < passo ? <Check aria-hidden size={10} /> : indice + 1}
            </span>
            <span className="hidden sm:inline">{titulo}</span>
            {indice < PASSOS.length - 1 && <span className="mx-0.5 text-luc-faint">/</span>}
          </li>
        ))}
      </ol>

      <div>
        <h2 className="text-[15px] font-bold text-luc-text">{COPY[passo][0]}</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-luc-muted">{COPY[passo][1]}</p>
        <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-luc-faint">
          passo {passo + 1} de {PASSOS.length}
        </p>
      </div>

      <fieldset hidden={passo !== 0} className="flex flex-col gap-4 border-0 p-0">
        <legend className="sr-only">Competência</legend>
        <Field label="Competência" htmlFor={`${formId}-competencia`} error={erroDe("competencia")}>
          <input
            id={`${formId}-competencia`}
            name="competencia"
            type="month"
            value={competencia}
            onChange={(event) => setCompetencia(event.target.value)}
            className={inputClass}
            aria-invalid={Boolean(erroDe("competencia"))}
          />
          {avisaCompetencia && (
            <div
              role="status"
              className="rounded-luc-md border border-luc-warn/25 bg-luc-warn/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-luc-warn"
            >
              Já existe um Lançamento nesta Competência — pode registrar mesmo assim.
            </div>
          )}
        </Field>
      </fieldset>

      <fieldset hidden={passo !== 1} className="grid grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only">Valor real e data de pagamento</legend>
        <Field label="Valor real" htmlFor={`${formId}-valor`} error={erroDe("valor")}>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[12px] text-luc-muted">
              R$
            </span>
            <input
              id={`${formId}-valor`}
              name="valor"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={valor}
              onChange={(event) => setValor(event.target.value)}
              className={`${inputClass} pl-10 font-mono text-right`}
              aria-invalid={Boolean(erroDe("valor"))}
            />
          </div>
        </Field>
        <Field label="Data de pagamento" htmlFor={`${formId}-data`} error={erroDe("dataPagamento")}>
          <input
            id={`${formId}-data`}
            name="dataPagamento"
            type="date"
            value={dataPagamento}
            onChange={(event) => setDataPagamento(event.target.value)}
            className={`${inputClass} font-mono`}
            aria-invalid={Boolean(erroDe("dataPagamento"))}
          />
        </Field>
      </fieldset>

      <fieldset hidden={passo !== 2} className="flex flex-col gap-2 border-0 p-0">
        <legend className="sr-only">Quem pagou</legend>
        <input type="hidden" name="paidBy" value={paidBy} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pessoas.map((item) => {
            const ativo = item.id === paidBy
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => setPaidBy(item.id)}
                className={`flex min-h-16 items-center gap-3 rounded-luc-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent ${ativo ? "border-luc-accent bg-luc-accent-06" : "border-luc-border bg-luc-surface-2 hover:border-luc-border-strong"}`}
              >
                <PersonChip pessoa={item} />
                <span>
                  <strong className="block text-[12.5px] text-luc-text">{item.nome}</strong>
                  <span className="text-[10.5px] text-luc-muted">
                    Pessoa que efetuou o pagamento
                  </span>
                </span>
                {ativo && <Check aria-hidden size={15} className="ml-auto text-luc-accent" />}
              </button>
            )
          })}
        </div>
        {erroDe("paidBy") && <FieldError>{erroDe("paidBy")}</FieldError>}
      </fieldset>

      <fieldset hidden={passo !== 3} className="flex flex-col gap-3 border-0 p-0">
        <legend className="sr-only">Comprovantes</legend>
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-luc-lg border border-luc-border border-dashed bg-luc-surface-2 px-5 py-4 text-center transition-colors hover:border-luc-border-strong focus-within:ring-2 focus-within:ring-luc-accent">
          <Upload aria-hidden size={20} className="text-luc-accent" />
          <strong className="mt-2 text-[12.5px] text-luc-text-2">Escolher imagens ou PDFs</strong>
          <span className="mt-1 text-[10.5px] text-luc-muted">
            Opcional e múltiplo · até 25 MB por arquivo
          </span>
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="sr-only"
            onChange={(event) => adicionarArquivos(event.target.files)}
          />
        </label>
        {arquivos.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {arquivos.map((file) => (
              <li
                key={chaveArquivo(file)}
                className="flex items-center gap-2 rounded-luc-md border border-luc-row-line bg-luc-surface-1 px-3 py-2"
              >
                <FileText aria-hidden size={14} className="shrink-0 text-luc-text-3" />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-luc-text-2">
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onArquivosChange(
                      arquivos.filter((item) => chaveArquivo(item) !== chaveArquivo(file)),
                    )
                  }
                  className="text-[10.5px] text-luc-text-3 hover:text-luc-warn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset hidden={passo !== 4} className="flex flex-col gap-2.5 border-0 p-0">
        <legend className="sr-only">Resumo</legend>
        <Resumo titulo="Competência" onEditar={() => setPasso(0)}>
          <span className="font-mono text-[13px] text-luc-text">
            {competencia || "Não informada"}
          </span>
          {avisaCompetencia && (
            <span className="text-[10.5px] text-luc-warn">já possui Lançamento</span>
          )}
        </Resumo>
        <Resumo titulo="Pagamento" onEditar={() => setPasso(1)}>
          <span className="font-mono text-[13px] text-luc-text">
            {centavos == null ? "Valor inválido" : formatBRL(centavos)}
          </span>
          <span className="font-mono text-[10.5px] text-luc-muted">
            {dataPagamento ? formatarDataBr(dataPagamento) : "Sem data"}
          </span>
        </Resumo>
        <Resumo titulo="Quem pagou" onEditar={() => setPasso(2)}>
          <span className="text-[13px] text-luc-text">{pessoa?.nome ?? "Não informado"}</span>
        </Resumo>
        <Resumo titulo="Comprovantes" onEditar={() => setPasso(3)}>
          <span className="text-[13px] text-luc-text">
            {arquivos.length === 0
              ? "Nenhum anexo"
              : `${arquivos.length} ${arquivos.length === 1 ? "arquivo" : "arquivos"}`}
          </span>
          <span className="text-[10.5px] text-luc-muted">Você poderá anexar outros depois.</span>
        </Resumo>
      </fieldset>

      <div className="flex items-center justify-between gap-3 border-luc-border border-t pt-5">
        <Button
          variant="secondary"
          type="button"
          onClick={() => setPasso((atual) => Math.max(0, atual - 1))}
          disabled={passo === 0 || pending}
          className={passo === 0 ? "invisible" : ""}
        >
          ← Voltar
        </Button>
        {passo < PASSOS.length - 1 ? (
          <Button variant="primary" type="button" onClick={() => setPasso((atual) => atual + 1)}>
            Continuar →
          </Button>
        ) : (
          <Button variant="primary" type="submit" disabled={pending}>
            {pending ? "Registrando…" : "Confirmar e registrar"}
          </Button>
        )}
      </div>
    </form>
  )
}

function Resumo({
  titulo,
  onEditar,
  children,
}: {
  titulo: string
  onEditar: () => void
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-luc-md border border-luc-border bg-luc-surface-2 p-3.5">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-luc-faint">
          {titulo}
        </span>
        <div className="mt-1 flex flex-col gap-0.5">{children}</div>
      </div>
      <button
        type="button"
        onClick={onEditar}
        className="flex h-8 items-center gap-1 rounded-luc-sm px-2 text-[10.5px] text-luc-accent hover:bg-luc-accent-06 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent"
      >
        <Pencil aria-hidden size={12} /> Editar
      </button>
    </div>
  )
}
