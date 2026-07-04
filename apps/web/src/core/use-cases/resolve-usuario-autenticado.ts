/**
 * Decisão pura (issue #94): qual Pessoa do Lar é a autenticada, pra casca
 * mostrar nome/avatar e o domínio atribuir autoria. Casa pelo `googleEmail`
 * vinculado (case-insensitive) — nunca pelo e-mail nominal semeado, que é
 * fictício. A allowlist (ADR-0004) já foi checada no `signIn`; aqui só
 * traduzimos a sessão para a Pessoa correta.
 *
 * Regras (ADR-0002: identidade/autoria nunca inferida por posição):
 * - Sessão cujo e-mail casa um `googleEmail` vinculado → aquela Pessoa.
 * - Sem sessão + bypass local (dev) → a primeira Pessoa (opera contra o seed).
 * - Sessão real sem vínculo (produção) → `undefined`: NÃO resolve. Nunca cai
 *   silenciosamente na primeira Pessoa (senão a autoria default sairia errada).
 *   A borda degrada explícito — a casca mostra o fallback e o modal de baixa
 *   deixa "quem pagou" em branco, forçando a escolha manual em vez de adivinhar.
 *
 * Retorna `undefined` de propósito (em vez de lançar): o vínculo real é aplicado
 * por um passo operacional posterior (#96), então existe uma janela pós-deploy em
 * que ninguém está vinculado. Lançar aqui derrubaria toda rota autenticada com um
 * 500 para as duas Pessoas nessa janela; `undefined` mantém o portal de pé e
 * degrada com honestidade.
 */
export function resolverUsuarioAutenticado<T extends { googleEmail: string | null }>(
  pessoas: T[] | undefined,
  emailLogado: string | null | undefined,
  bypassLocal: boolean,
): T | undefined {
  const lar = pessoas ?? []

  if (emailLogado) {
    const email = emailLogado.toLowerCase()
    const vinculada = lar.find((pessoa) => pessoa.googleEmail?.toLowerCase() === email)
    if (vinculada) return vinculada
    // Tolerância só de dev: um e-mail de sessão que não casa ainda opera contra o seed.
    if (bypassLocal) return lar[0]
    // Sessão real sem vínculo (produção): não resolve — jamais a primeira Pessoa.
    return undefined
  }

  if (bypassLocal) return lar[0]
  return undefined
}
