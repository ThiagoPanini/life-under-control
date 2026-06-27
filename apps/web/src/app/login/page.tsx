import { signIn } from "@/auth"
import { Logo } from "@/components/brand/Logo"

// A porta é dinâmica (lê o erro pós-OAuth da query).
export const dynamic = "force-dynamic"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { error } = await searchParams
  const codigo = Array.isArray(error) ? error[0] : error
  // Auth.js emite `AccessDenied` quando o callback signIn nega (allowlist). Os
  // demais códigos (Configuration, OAuthCallback…) são falha técnica, não "fora
  // do Lar" — não acusar uma conta legítima de não pertencer.
  const negado = codigo === "AccessDenied"
  const falhou = Boolean(codigo) && !negado

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-x-hidden overflow-y-auto pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))]">
      {/* Montagem do casal, desfocada (tratamento do sistema de design). */}
      <div
        aria-hidden
        className="fixed inset-0 scale-105 bg-cover bg-[position:60%_center] sm:bg-center"
        style={{
          backgroundImage: "url(/login-background.webp)",
          filter: "blur(8px) brightness(0.5)",
        }}
      />
      {/* Véu radial ciano + gradiente, pra firmar o contraste do card. */}
      <div
        aria-hidden
        className="fixed inset-0"
        style={{
          background:
            "radial-gradient(90% 60% at 82% -10%, var(--luc-accent-16), transparent 60%), linear-gradient(180deg, color-mix(in srgb, var(--luc-bg) 55%, transparent), color-mix(in srgb, var(--luc-bg) 88%, transparent))",
        }}
      />

      <section className="relative z-10 my-auto flex w-full max-w-sm flex-col items-center gap-6 rounded-luc-xl border border-luc-border bg-luc-surface-1/88 px-5 py-8 text-center shadow-2xl backdrop-blur-md sm:gap-7 sm:px-8 sm:py-10">
        <Logo size={48} />
        <div className="flex flex-col items-center gap-2">
          <p className="font-mono text-[11px] text-luc-accent uppercase tracking-[0.18em]">
            Cockpit do Lar
          </p>
          <h1 className="font-extrabold text-2xl text-luc-text tracking-[-0.03em]">
            Life Under Control
          </h1>
          <p className="text-luc-text-2 text-sm leading-relaxed">
            Acesso restrito ao Lar. Entre com a conta Google do casal.
          </p>
        </div>

        {negado && (
          <p className="w-full rounded-luc-md border border-luc-border bg-luc-surface-2 px-3 py-2 text-luc-warn text-sm">
            Sem acesso — esta conta não faz parte do Lar.
          </p>
        )}
        {falhou && (
          <p className="w-full rounded-luc-md border border-luc-border bg-luc-surface-2 px-3 py-2 text-luc-warn text-sm">
            Não foi possível entrar. Tente novamente.
          </p>
        )}

        <form
          className="w-full"
          action={async () => {
            "use server"
            await signIn("google", { redirectTo: "/painel" })
          }}
        >
          <button
            type="submit"
            className="inline-flex min-h-12 w-full touch-manipulation items-center justify-center gap-3 rounded-luc-md bg-luc-text px-4 py-2.5 font-medium text-luc-bg text-sm transition-opacity active:opacity-80 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg"
          >
            <GoogleMark />
            Entrar com Google
          </button>
        </form>
      </section>
    </main>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <title>Google</title>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.59-5.05-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.71A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.99-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  )
}
