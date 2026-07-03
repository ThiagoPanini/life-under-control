import { AREAS, type Area } from "./areas"
import { SUBJECTS, type Subject } from "./subjects"

/**
 * Modelo de navegação da sidebar (issue #46, ADR-0009) — derivação pura sobre
 * os catálogos AREAS+SUBJECTS. Zero DOM, zero React: a borda (AppShell) só lê.
 */

export type NavSubject = {
  slug: string
  nome: string
  icon: string
  href: string
  ativa: boolean
}

export type NavArea = {
  slug: string
  nome: string
  icon: string
  href: string
  estado: Area["estado"]
  expandivel: boolean
  ativa: boolean
  inerte: boolean
  assuntos: NavSubject[]
}

/** A rota está dentro de uma Área (a própria ou uma sub-rota como /nova)? */
export function naArea(pathname: string, slug: string): boolean {
  return pathname === `/areas/${slug}` || pathname.startsWith(`/areas/${slug}/`)
}

/** Modelo de navegação da sidebar: uma NavArea por Área, com seus NavSubject aninhados. */
export function buildNavModel(
  pathname: string,
  areas: Area[] = AREAS,
  subjects: Subject[] = SUBJECTS,
): NavArea[] {
  return areas.map((area) => {
    const assuntosVisiveis = subjects.filter(
      (subject) => subject.areaSlug === area.slug && subject.estado !== "em-breve",
    )
    const expandivel = assuntosVisiveis.length > 0

    return {
      slug: area.slug,
      nome: area.nome,
      icon: area.icon,
      href: `/areas/${area.slug}`,
      estado: area.estado,
      expandivel,
      ativa: naArea(pathname, area.slug),
      inerte: !expandivel,
      assuntos: assuntosVisiveis.map((subject) => {
        const href = `/areas/${area.slug}/${subject.slug}`
        return {
          slug: subject.slug,
          nome: subject.nome,
          icon: subject.icon,
          href,
          ativa: pathname === href || pathname.startsWith(`${href}/`),
        }
      }),
    }
  })
}

/**
 * O Assunto ativo único da Área, se houver exatamente um — decide o redirect
 * condicional da raiz (ADR-0009, emenda D1): 1 ativo redireciona, 2+ vira mini-Painel.
 */
export function assuntoUnicoAtivo(
  areaSlug: string,
  subjects: Subject[] = SUBJECTS,
): Subject | null {
  const ativos = subjects.filter(
    (subject) => subject.areaSlug === areaSlug && subject.estado === "ativa",
  )
  return ativos.length === 1 ? ativos[0] : null
}
