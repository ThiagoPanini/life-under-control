"use client"

import { CalendarRange } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
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

/** Ordem da legenda — os estados na sequência em que fazem sentido explicar. As
 * ausências honestas (`sem-ocorrencia`/`fora-vigencia`) ficam fora da legenda: são
 * autoexplicativas na matriz e diluiriam os estados que pedem leitura. */
const LEGENDA: EstadoCelula[] = ["abaixo", "na-media", "acima", "por-vir", "vencida"]

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

/** Célula ativa (hover/foco): a chave `billId|competencia` e o **elemento** que a
 * ancora — guardamos o nó (não um retângulo congelado) para reler a posição a cada
 * scroll/resize, senão o tooltip `fixed` fica preso em coordenadas velhas. */
type Alvo = { chave: string; el: HTMLElement }

/**
 * Mapa do Ano (issue #102): a matriz Conta × Competência das doze Competências até
 * a atual, distinguindo valor realizado, expectativa, recorrência e **vigência**.
 * Cada Conta é uma linha; cada mês, uma célula derivada pelo use-case `derivarMapaAno`
 * (nada é recalculado aqui — ADR-0010). Contas encerradas existem no derivado enquanto
 * a vigência intercepta a janela, mas o **toggle** filtra a exibição (default: só ativas).
 * No celular a matriz rola na horizontal com a coluna da Conta fixa (legível). O detalhe
 * da célula ativa aparece num **tooltip `position: fixed`** — assim escapa o `overflow`
 * do container de scroll sem ser cortado.
 */
export function MapaDoAno({ mapa }: { mapa: Mapa }) {
  // Foco (teclado) e hover ficam separados para o mouse não apagar o foco do teclado;
  // `focado` vence. Mas o hover **zera o foco** (`onMouseEnter`) para o cursor assumir —
  // senão um clique fixa o foco e trava o tooltip na célula clicada.
  const [focado, setFocado] = useState<Alvo | null>(null)
  const [emHover, setEmHover] = useState<Alvo | null>(null)
  const alvo = focado ?? emHover
  // Default: só Contas ativas. O toggle revela também as encerradas cuja vigência
  // intercepta a janela (elas já existem no derivado — aqui só entram/saem da vista).
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false)

  const linhas = mapa.estado === "com-contas" ? mapa.linhas : []
  const temEncerradas = linhas.some((l) => l.estado === "encerrada")
  const linhasVisiveis = mostrarEncerradas ? linhas : linhas.filter((l) => l.estado === "ativa")

  // Trocar o filtro pode esconder a linha do alvo — some com o tooltip para ele não
  // ficar flutuando sobre um nó desmontado (rect zerado) nem descrever linha invisível.
  function alternarEncerradas(v: boolean) {
    setMostrarEncerradas(v)
    setFocado(null)
    setEmHover(null)
  }

  // Resolve o alvo **só entre as linhas visíveis**: se o toggle esconde a linha, o
  // tooltip cai fora (null) em vez de descrever uma Conta que não está na tela.
  const detalhe = alvoParaDetalhe(linhasVisiveis, alvo)

  return (
    <section aria-labelledby="mapa-ano-heading" className="flex flex-col gap-3">
      <div aria-hidden className="border-luc-border border-t" />
      {/* O switch fica na mesma linha do título (via `actions`) e só aparece quando
          há Contas encerradas para revelar — senão seria um controle no-op. */}
      <SectionHeading
        id="mapa-ano-heading"
        title="Mapa do Ano"
        variant="destaque"
        icon={ICONE}
        actions={
          temEncerradas ? (
            <SwitchEncerradas mostrarEncerradas={mostrarEncerradas} onChange={alternarEncerradas} />
          ) : undefined
        }
      />
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-luc-text-3">
          Conta × Competência
        </span>
        <span className="text-xs text-luc-muted">
          Cada Conta ao longo dos últimos 12 meses, comparada à própria média (±5%).
        </span>
      </div>

      {mapa.estado === "sem-contas" ? (
        <div className="rounded-luc-lg border border-luc-border bg-luc-surface-2 px-4 pt-[15px] pb-[13px]">
          <p className="text-xs text-luc-text-3">
            Nenhuma Conta com vigência nos últimos 12 meses ainda.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Legenda />
          {linhasVisiveis.length === 0 ? (
            <div className="rounded-luc-lg border border-luc-border bg-luc-surface-2 px-4 pt-[15px] pb-[13px]">
              <p className="text-xs text-luc-text-3">
                Nenhuma Conta ativa nos últimos 12 meses. Inclua as encerradas para ver o histórico.
              </p>
            </div>
          ) : (
            <Matriz
              competencias={mapa.estado === "com-contas" ? mapa.competencias : []}
              linhas={linhasVisiveis}
              alvo={alvo}
              setFocado={setFocado}
              setEmHover={setEmHover}
            />
          )}
        </div>
      )}

      {detalhe && alvo && (
        <Tooltip key={alvo.chave} el={alvo.el} nome={detalhe.nome} cel={detalhe.cel} />
      )}
    </section>
  )
}

/** Resolve o alvo ativo (`billId|competencia`) para a linha e a célula que o tooltip descreve. */
function alvoParaDetalhe(
  linhas: LinhaMapa[],
  alvo: Alvo | null,
): { nome: string; cel: CelulaMapa } | null {
  if (!alvo) return null
  const [billId, competencia] = alvo.chave.split("|")
  const linha = linhas.find((l) => l.billId === billId)
  const cel = linha?.celulas.find((c) => c.competencia === competencia)
  if (!linha || !cel) return null
  return { nome: linha.nome, cel }
}

/** Interruptor liga/desliga para incluir as Contas encerradas na matriz (off por
 * padrão). Um `role="switch"` de verdade — o rótulo visível é o nome acessível. */
function SwitchEncerradas({
  mostrarEncerradas,
  onChange,
}: {
  mostrarEncerradas: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mostrarEncerradas}
      onClick={() => onChange(!mostrarEncerradas)}
      className="group flex items-center gap-2 outline-none"
    >
      <span className="text-[11px] font-medium text-luc-text-3 transition-colors group-hover:text-luc-text-2">
        Incluir encerradas
      </span>
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
          mostrarEncerradas
            ? "border-luc-accent bg-luc-accent"
            : "border-luc-border bg-luc-surface-3"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-luc-text shadow-sm transition-transform ${
            mostrarEncerradas ? "translate-x-[18px]" : "translate-x-[2px]"
          }`}
        />
      </span>
    </button>
  )
}

function Matriz({
  competencias,
  linhas,
  alvo,
  setFocado,
  setEmHover,
}: {
  competencias: string[]
  linhas: LinhaMapa[]
  alvo: Alvo | null
  setFocado: (v: Alvo | null) => void
  setEmHover: (v: Alvo | null) => void
}) {
  return (
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
            {competencias.map((competencia) => (
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
          {linhas.map((linha) => (
            <LinhaMatriz
              key={linha.billId}
              linha={linha}
              alvo={alvo}
              setFocado={setFocado}
              setEmHover={setEmHover}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LinhaMatriz({
  linha,
  alvo,
  setFocado,
  setEmHover,
}: {
  linha: LinhaMapa
  alvo: Alvo | null
  setFocado: (v: Alvo | null) => void
  setEmHover: (v: Alvo | null) => void
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
          alvo={alvo}
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
  alvo,
  setFocado,
  setEmHover,
}: {
  nome: string
  billId: string
  cel: CelulaMapa
  alvo: Alvo | null
  setFocado: (v: Alvo | null) => void
  setEmHover: (v: Alvo | null) => void
}) {
  const chave = `${billId}|${cel.competencia}`
  const meta = META[cel.estado]
  const estaAtivo = alvo?.chave === chave
  return (
    <td className="border-luc-border border-t px-1 py-1 text-center align-middle">
      <button
        type="button"
        data-testid="mapa-celula"
        data-estado={cel.estado}
        aria-label={descreverCelula(nome, cel)}
        onMouseEnter={(e) => {
          // Hover assume: zera o foco para um clique anterior não travar o tooltip.
          setFocado(null)
          setEmHover({ chave, el: e.currentTarget })
        }}
        onMouseLeave={() => setEmHover(null)}
        onFocus={(e) => setFocado({ chave, el: e.currentTarget })}
        onBlur={() => setFocado(null)}
        className={`flex h-9 w-full min-w-[40px] items-center justify-center rounded-luc-md text-[13px] leading-none outline-none transition-shadow ${meta.tint} ${meta.cor} ${estaAtivo ? "ring-2 ring-luc-accent" : ""}`}
      >
        <span aria-hidden>{meta.glifo}</span>
      </button>
    </td>
  )
}

/**
 * Tooltip flutuante da célula ativa — mesma linguagem visual da tooltip do gráfico
 * "Total Pago por Mês" (superfície elevada + borda forte + sombra). `position: fixed`
 * ancorado ao **elemento** da célula, então escapa o `overflow` do scroll da matriz
 * sem recorte. Relê a posição do nó a cada `scroll`/`resize` (capturando também o
 * scroll do container interno) e **clampa ao viewport** — vira para baixo quando não
 * cabe acima e nunca sai pelas bordas. Não recebe ponteiro para não roubar o hover.
 */
function Tooltip({ el, nome, cel }: { el: HTMLElement; nome: string; cel: CelulaMapa }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; abaixo: boolean } | null>(null)

  useLayoutEffect(() => {
    const posicionar = () => {
      const celula = el.getBoundingClientRect()
      const largura = ref.current?.offsetWidth ?? 0
      const altura = ref.current?.offsetHeight ?? 0
      const margem = 8
      const centro = Math.min(
        window.innerWidth - margem - largura / 2,
        Math.max(margem + largura / 2, celula.left + celula.width / 2),
      )
      const cabeAcima = celula.top - altura - margem >= 0
      setPos({
        left: centro,
        top: cabeAcima ? celula.top - margem : celula.bottom + margem,
        abaixo: !cabeAcima,
      })
    }
    posicionar()
    // `true` = fase de captura, para pegar o scroll do container interno da matriz também.
    window.addEventListener("scroll", posicionar, true)
    window.addEventListener("resize", posicionar)
    return () => {
      window.removeEventListener("scroll", posicionar, true)
      window.removeEventListener("resize", posicionar)
    }
  }, [el])

  const meta = META[cel.estado]
  const desvio = descreverDesvio(cel.desvio)
  return (
    <div
      ref={ref}
      role="tooltip"
      style={{
        position: "fixed",
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        transform: pos?.abaixo ? "translate(-50%, 0)" : "translate(-50%, -100%)",
        // Fica oculto no primeiro paint (antes de medir e posicionar) — sem salto visível.
        visibility: pos ? "visible" : "hidden",
      }}
      className="pointer-events-none z-50 whitespace-nowrap rounded-luc-md border border-luc-border-strong bg-luc-surface-3 px-2.5 py-[7px] shadow-[0_12px_30px_rgba(0,0,0,.45)]"
    >
      <div className="text-[11px] font-bold text-luc-text">{nome}</div>
      <div className="mt-px text-[10px] text-luc-text-3">
        {descreverMesPorExtenso(cel.competencia)}
      </div>
      <div className={`mt-1 flex items-center gap-1 text-[11px] ${meta.cor}`}>
        {meta.glifo && <span aria-hidden>{meta.glifo}</span>}
        <span>{meta.rotulo}</span>
      </div>
      {cel.valor != null && (
        <div className="mt-0.5 font-mono text-[13px] font-semibold text-luc-text">
          {formatBRL(cel.valor)}
        </div>
      )}
      {desvio != null && <div className="text-[10px] text-luc-muted">desvio {desvio}</div>}
    </div>
  )
}

/** A legenda dos estados — forma + palavra, para ler sem depender de cor. */
function Legenda() {
  return (
    <ul className="flex flex-wrap justify-end gap-x-4 gap-y-1.5">
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
