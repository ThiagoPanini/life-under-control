/**
 * Decisão pura (issue #85): qual Pessoa do Lar é a autenticada, pra casca
 * mostrar no rodapé/header. Casa pelo e-mail da sessão do Google; sem sessão
 * (bypass local) cai na primeira do Lar. Com sessão real que não bate com
 * nenhuma Pessoa (e-mail do Lar desatualizado), retorna indefinido — nunca
 * atribui a sessão à Pessoa errada.
 */
export function resolverUsuarioAutenticado<T extends { email: string }>(
  pessoas: T[] | undefined,
  emailLogado: string | null | undefined,
): T | undefined {
  if (!pessoas?.length) return undefined
  if (!emailLogado) return pessoas[0]
  const email = emailLogado.toLowerCase()
  return pessoas.find((pessoa) => pessoa.email.toLowerCase() === email)
}
