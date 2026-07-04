"use client"

import { CalendarRange } from "lucide-react"
import { useState } from "react"
import { SectionHeading } from "@/components/ds/SectionHeading"
import { descreverMesPorExtenso, mesAno } from "@/core/domain/bill"
import { formatBRL } from "@/core/domain/money"
import type {
  CelulaMapa,
  EstadoCelula,
  LinhaMapa,
  MapaDoAno as Mapa,
} from "@/core/use-cases/derive-mapa-ano"
import { BillIcon } from "./BillIcon"

/**
 * Aparência e vocabulário de cada estado de célula — **nunca só cor**: cada uma
 * carrega um glifo (forma) e um rótulo por extenso, para leitura sem depender de
 * cor (acessibilidade, como a Análise Histórica). `acima`/`abaixo` comparam o fato
 * à média da própria Conta (±5%); `vencida`/`por-vir` são ocorrências sem fato;
 * `fora-vigencia`/`sem-ocorrencia` são ausências honestas, jamais "não pago".
 */
const META: Record<EstadoCelula, { rotulo: string; glifo: string; cor: string; tint: string }> = {
  acima: { rotulo: "acima da média", glifo: "▲", cor: "text-luc-warn", tint: "bg-luc-warn/15" },
  "na-media": {
    rotulo: "na média",
    glifo: "●",
    cor: "text-luc-accent-bright",
    tint: "bg-luc-accent-12",
  },
  abaixo: {
    rotulo: "abaixo da média",
    glifo: "▼",
    cor: "text-luc-success",
    tint: "bg-luc-success/15",
  },
  vencida: { rotulo: "vencida", glifo: "!", cor: "text-luc-danger", tint: "bg-luc-danger/15" },
  "por-vir": { rotulo: "por vir", glifo: "○", cor: "text-luc-text-3", tint: "bg-luc-surface-3" },
  "sem-ocorrencia": { rotulo: "sem ocorrência", glifo: "·", cor: "text-luc-faint", tint: "" },
  "fora-vigencia": { rotulo: "fora da vigência", glifo: "", cor: "text-luc-faint", tint: "" },
}

/** A dica da barra de detalhe quando nenhuma célula está ativa. */
const DICA =
  "Passe o cursor ou navegue pelas células para ver Conta, Competência, estado, valor e desvio."

/** Ordem da legenda — os estados na sequência em que fazem sentido explicar. */
const LEGENDA: EstadoCelula[] = [
  "abaixo",
  "na-media",
  "acima",
  "por-vir",
  "vencida",
  "sem-ocorrencia",
  "fora-vigencia",
]

/** Desvio com sinal por extenso (`+R$ 20,00` / `−R$ 12,00`); vazio quando não calculável. */
function descreverDesvio(desvio: number | null): string | null {
  if (desvio == null) return null
  const sinal = desvio >= 0 ? "+" : "−"
  return `${sinal}${formatBRL(Math.abs(desvio))}`
}

/** A frase acessível de uma célula: Conta · Competência · estado · valor · desvio (quando cabem). */
function descreverCelula(nome: string, cel: CelulaMapa): string {
  const partes = [nome, descreverMesPorExtenso(cel.competencia), META[cel.estado].rotulo]
  if (cel.valor != null) partes.push(formatBRL(cel.valor))
  const desvio = descreverDesvio(cel.desvio)
  if (desvio != null) partes.push(`desvio ${desvio}`)
  return partes.join(" · ")
}

const ICONE = (
  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-luc-md bg-luc-accent-12 text-luc-accent-bright">
    <CalendarRange aria-hidden size={15} />
  </span>
)

/**
 * Mapa do Ano (issue #102): a matriz Conta × Competência das doze Competências até
 * a atual, distinguindo valor realizado, expectativa, recorrência e **vigência**.
 * Cada Conta é uma linha; cada mês, uma célula derivada pelo use-case `derivarMapaAno`
 * (nada é recalculado aqui — ADR-0010). Contas encerradas aparecem enquanto a
 * vigência intercepta a janela. No celular a matriz rola na horizontal com a coluna
 * da Conta fixa (legível). O detalhe da célula ativa aparece numa barra **fora** do
 * container de scroll — assim nenhum tooltip flutuante é cortado pelo overflow.
 */
export function MapaDoAno({ mapa }: { mapa: Mapa }) {
  const [focado, setFocado] = useState<string | null>(null)
  const [emHover, setEmHover] = useState<string | null>(null)
  const ativo = focado ?? emHover

  return (
    <section aria-labelledby="mapa-ano-heading" className="flex flex-col gap-[18px]">
      <div aria-hidden className="border-luc-border border-t" />
      <SectionHeading id="mapa-ano-heading" title="Mapa do Ano" variant="destaque" icon={ICONE} />
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-luc-text-3">
          Conta × Competência
        </span>
        <span className="text-xs text-luc-muted">
          Cada Conta ao longo dos últimos 12 meses, comparada à própria média (±5%). Vigência,
          recorrência e fatos, sem confundir ausência com atraso.
        </span>
      </div>

      {mapa.estado === "sem-contas" ? (
        <div className="rounded-luc-lg border border-luc-border bg-luc-surface-2 px-4 pt-[15px] pb-[13px]">
          <p className="text-xs text-luc-text-3">
            Nenhuma Conta com vigência nos últimos 12 meses ainda.
          </p>
        </div>
      ) : (
        <Matriz mapa={mapa} ativo={ativo} setFocado={setFocado} setEmHover={setEmHover} />
      )}
    </section>
  )
}

function Matriz({
  mapa,
  ativo,
  setFocado,
  setEmHover,
}: {
  mapa: Extract<Mapa, { estado: "com-contas" }>
  ativo: string | null
  setFocado: (v: string | null) => void
  setEmHover: (v: string | null) => void
}) {
  // A frase da célula ativa (Conta · Competência · estado · valor · desvio), lida
  // fora do scroll. `ativo` é `billId|competencia` — indexa direto a linha e a
  // célula (sem achatar a matriz inteira a cada render). Nada ativo → uma dica.
  let detalhe = DICA
  if (ativo) {
    const [billId, competencia] = ativo.split("|")
    const linha = mapa.linhas.find((l) => l.billId === billId)
    const cel = linha?.celulas.find((c) => c.competencia === competencia)
    if (linha && cel) detalhe = descreverCelula(linha.nome, cel)
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="status"
        aria-live="polite"
        className="min-h-[34px] rounded-luc-md border border-luc-border bg-luc-surface-2 px-3 py-2 text-xs text-luc-text-2"
      >
        {detalhe}
      </div>

      {/* Container do scroll horizontal (celular): a coluna da Conta fica fixa e legível. */}
      <div className="overflow-x-auto rounded-luc-lg border border-luc-border bg-luc-surface-2">
        <table className="w-full border-separate border-spacing-0 text-left">
          <caption className="sr-only">
            Mapa do Ano: cada Conta por Competência, com estado, valor e desvio da média.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-luc-surface-2 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.11em] text-luc-text-3"
              >
                Conta
              </th>
              {mapa.competencias.map((competencia) => (
                <th
                  key={competencia}
                  scope="col"
                  className="whitespace-nowrap px-2 py-2 text-center font-mono text-[10px] font-medium text-luc-faint"
                >
                  {mesAno(competencia)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mapa.linhas.map((linha) => (
              <LinhaMatriz
                key={linha.billId}
                linha={linha}
                ativo={ativo}
                setFocado={setFocado}
                setEmHover={setEmHover}
              />
            ))}
          </tbody>
        </table>
      </div>

      <Legenda />
    </div>
  )
}

function LinhaMatriz({
  linha,
  ativo,
  setFocado,
  setEmHover,
}: {
  linha: LinhaMapa
  ativo: string | null
  setFocado: (v: string | null) => void
  setEmHover: (v: string | null) => void
}) {
  return (
    <tr className="border-luc-border border-t">
      <th
        scope="row"
        className="sticky left-0 z-10 border-luc-border border-t bg-luc-surface-2 px-3 py-2"
      >
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-luc-md bg-luc-surface-3 text-luc-text-2">
            <BillIcon name={linha.icon} size={15} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5">
              <span className="max-w-[140px] truncate text-[13px] font-medium text-luc-text">
                {linha.nome}
              </span>
              {linha.estado === "encerrada" && (
                <span className="shrink-0 rounded-full bg-luc-surface-3 px-1.5 py-px text-[9px] uppercase tracking-[0.08em] text-luc-faint">
                  encerrada
                </span>
              )}
            </span>
            <span className="font-mono text-[10px] text-luc-faint">
              {/* Ausência de média dita por extenso (histórico insuficiente) — nunca um zero. */}
              {linha.media == null ? "sem média" : `média ${formatBRL(linha.media)}`}
            </span>
          </span>
        </span>
      </th>
      {linha.celulas.map((cel) => (
        <CelulaMatriz
          key={cel.competencia}
          nome={linha.nome}
          billId={linha.billId}
          cel={cel}
          ativo={ativo}
          setFocado={setFocado}
          setEmHover={setEmHover}
        />
      ))}
    </tr>
  )
}

function CelulaMatriz({
  nome,
  billId,
  cel,
  ativo,
  setFocado,
  setEmHover,
}: {
  nome: string
  billId: string
  cel: CelulaMapa
  ativo: string | null
  setFocado: (v: string | null) => void
  setEmHover: (v: string | null) => void
}) {
  const chave = `${billId}|${cel.competencia}`
  const meta = META[cel.estado]
  const estaAtivo = ativo === chave
  return (
    <td className="border-luc-border border-t px-1 py-1 text-center align-middle">
      <button
        type="button"
        data-testid="mapa-celula"
        data-estado={cel.estado}
        aria-label={descreverCelula(nome, cel)}
        onMouseEnter={() => setEmHover(chave)}
        onMouseLeave={() => setEmHover(null)}
        onFocus={() => setFocado(chave)}
        onBlur={() => setFocado(null)}
        className={`flex h-9 w-full min-w-[40px] items-center justify-center rounded-luc-md text-[13px] leading-none outline-none transition-shadow ${meta.tint} ${meta.cor} ${estaAtivo ? "ring-2 ring-luc-accent" : ""}`}
      >
        <span aria-hidden>{meta.glifo}</span>
      </button>
    </td>
  )
}

/** A legenda dos estados — forma + palavra, para ler sem depender de cor. */
function Legenda() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {LEGENDA.map((estado) => {
        const meta = META[estado]
        return (
          <li key={estado} className="flex items-center gap-1.5 text-[10.5px] text-luc-faint">
            <span
              aria-hidden
              className={`flex h-4 w-4 items-center justify-center rounded-[4px] text-[11px] ${meta.tint} ${meta.cor}`}
            >
              {meta.glifo}
            </span>
            <span>{meta.rotulo}</span>
          </li>
        )
      })}
    </ul>
  )
}
