"use client"

import { useEffect, useState } from "react"
import { BillIcon } from "@/components/financas/BillIcon"

/**
 * Tile de identidade de uma Conta (borda — #50): o logo, quando presente,
 * substitui o ícone Lucide dentro do **mesmo tile neutro** (fundo branco
 * translúcido) — o tile nunca ganha ciano, com ou sem logo; ciano é reservado
 * pra ação/leitura. Skeleton enquanto a imagem remota carrega; se a URL
 * assinada expirar ou o objeto falhar (`onError`), cai no ícone Lucide em vez
 * de travar no skeleton pra sempre.
 */
export function BillLogoTile({
  icon,
  logoUrl,
  size = 40,
  iconSize = 20,
}: {
  icon: string
  logoUrl: string | null
  size?: number
  iconSize?: number
}) {
  const [carregado, setCarregado] = useState(false)
  const [falhou, setFalhou] = useState(false)

  // Nova `logoUrl` (troca de logo, ou `router.refresh()` com um logo novo) —
  // o estado de carga da imagem anterior não se aplica mais ao objeto novo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `logoUrl` é o gatilho do reset, não é lido no corpo.
  useEffect(() => {
    setCarregado(false)
    setFalhou(false)
  }, [logoUrl])

  const mostrarLogo = Boolean(logoUrl) && !falhou

  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[11px] border border-luc-border bg-white/[0.06] text-luc-text-3"
      style={{ width: size, height: size }}
    >
      {mostrarLogo ? (
        <>
          {!carregado && (
            <span className="absolute inset-0 animate-pulse bg-luc-surface-3" aria-hidden />
          )}
          {/* biome-ignore lint/performance/noImgElement: chave assinada troca a cada render; sem domínio fixo pro next/image */}
          <img
            src={logoUrl as string}
            alt=""
            onLoad={() => setCarregado(true)}
            onError={() => setFalhou(true)}
            className={`h-full w-full object-cover transition-opacity duration-150 ${
              carregado ? "opacity-100" : "opacity-0"
            }`}
          />
        </>
      ) : (
        <BillIcon name={icon} size={iconSize} />
      )}
    </span>
  )
}
