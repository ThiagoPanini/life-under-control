/**
 * Port de download de uma imagem externa (ADR-0003). Baixa a `picture` do
 * perfil Google no login — a borda injeta a função real (`fetch`); os testes
 * usam uma função fake. `null` quando o download falhar: nunca lança, quem
 * chama decide o que fazer (mirrorAvatar deixa `avatarKey` nulo).
 */
export type ImageFetcher = (url: string) => Promise<{ bytes: Uint8Array; tipoMime: string } | null>
