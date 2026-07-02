"use client"

import Image from "next/image"
import type { CSSProperties } from "react"
import { useEffect, useState } from "react"

/**
 * O badge visual de uma Pessoa (#51): a foto do Google (quadrado-arredondado,
 * nunca círculo) quando há `avatarUrl`, com skeleton pulsante enquanto carrega;
 * cai no fallback inicial+cor quando não há foto (login falhou ou nunca
 * espelhou). Compartilhado por `PersonChip` e `ShellPersonBadge` — mesma
 * geometria em todo contexto (header, rodapé da sidebar, chips de autoria).
 */
export function PersonAvatar({
  avatarUrl,
  inicial,
  nome,
  size,
  colors,
  className = "",
  decorative = false,
}: {
  avatarUrl?: string | null
  inicial: string
  nome: string
  /** Lado do quadrado, em px (19–26 conforme o contexto). */
  size: number
  colors: CSSProperties
  /** Classes de raio (`rounded-luc-sm`/`rounded-[8px]`) + layout do chamador. */
  className?: string
  /** O nome já aparece como texto visível ao lado (ex.: PersonChip com `showName`) — o badge não deve anunciar o nome de novo pro leitor de tela. */
  decorative?: boolean
}) {
  const [carregada, setCarregada] = useState(false)
  const [falhou, setFalhou] = useState(false)

  // Nova URL (re-assinada a cada render server-side, ou Pessoa trocou) — os
  // estados de carregamento são por-imagem, não por-instância do componente.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset intencional só quando a URL muda
  useEffect(() => {
    setCarregada(false)
    setFalhou(false)
  }, [avatarUrl])

  if (!avatarUrl || falhou) {
    const fallbackClassName = `inline-flex shrink-0 items-center justify-center font-bold ${className}`
    const fallbackStyle = { width: size, height: size, fontSize: Math.round(size * 0.4), ...colors }

    if (decorative) {
      return (
        <span aria-hidden title={nome} className={fallbackClassName} style={fallbackStyle}>
          {inicial}
        </span>
      )
    }

    return (
      <span
        role="img"
        aria-label={nome}
        title={nome}
        className={fallbackClassName}
        style={fallbackStyle}
      >
        <span aria-hidden>{inicial}</span>
      </span>
    )
  }

  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      title={nome}
    >
      {!carregada && (
        <span aria-hidden className="absolute inset-0 animate-pulse bg-luc-surface-3" />
      )}
      <Image
        src={avatarUrl}
        alt={decorative ? "" : nome}
        width={size}
        height={size}
        className="h-full w-full object-cover"
        onLoad={() => setCarregada(true)}
        onError={() => setFalhou(true)}
      />
    </span>
  )
}
