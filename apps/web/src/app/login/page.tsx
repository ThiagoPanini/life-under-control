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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-luc-bg p-6">
      <div
        aria-hidden
        className="absolute inset-0 scale-[1.08] bg-cover bg-[position:center_26%]"
        style={{
          backgroundImage: "url(/login-background.png)",
          filter: "blur(5px) brightness(0.5) saturate(1.12)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 75% at 50% -8%, rgba(76,196,230,.15), transparent 55%), linear-gradient(180deg, rgba(10,12,15,.74) 0%, rgba(10,12,15,.56) 30%, rgba(10,12,15,.72) 58%, rgba(10,12,15,.94) 100%)",
        }}
      />

      <section className="relative z-10 w-full max-w-[392px]">
        <div className="flex items-center justify-center gap-[11px]">
          <Logo size={34} decorative />
          <div className="text-left">
            <h1 className="text-[17px] font-bold tracking-[-0.01em]">Life Under Control</h1>
            <div className="text-[11px] font-semibold tracking-[0.16em] text-luc-text-3">
              L · U · C
            </div>
          </div>
        </div>
        <p className="mt-[18px] text-center text-[13.5px] text-luc-text-2">
          O cockpit da vida do Lar — toda métrica à vista.
        </p>

        <div className="mt-[26px] rounded-luc-xl border border-luc-border bg-luc-surface-2 p-6">
          {negado && (
            <p className="mb-4 rounded-luc-md border border-luc-warn/20 bg-luc-warn/10 px-3 py-2 text-sm text-luc-warn">
              Sem acesso — esta conta não faz parte do Lar.
            </p>
          )}
          {falhou && (
            <p className="mb-4 rounded-luc-md border border-luc-warn/20 bg-luc-warn/10 px-3 py-2 text-sm text-luc-warn">
              Não foi possível entrar. Tente novamente.
            </p>
          )}

          <form
            action={async () => {
              "use server"
              await signIn("google", { redirectTo: "/painel" })
            }}
          >
            <button
              type="submit"
              className="inline-flex min-h-[46px] w-full touch-manipulation items-center justify-center gap-2.5 rounded-[11px] bg-[#f4f5f7] p-[13px] text-[14.5px] font-semibold text-[#1a1d22] transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-luc-bg"
            >
              <GoogleMark />
              Entrar com Google
            </button>
          </form>

          <div className="mt-[18px] flex items-center justify-center gap-2">
            <LoginPersonBadge person="thiago">T</LoginPersonBadge>
            <LoginPersonBadge person="jakeline">J</LoginPersonBadge>
            <span className="ml-1 text-xs text-luc-text-3">Thiago e Jakeline</span>
          </div>
        </div>

        <p className="mt-4 text-center text-[11.5px] leading-[1.55] text-luc-faint">
          Acesso restrito a duas Pessoas, sem cadastro.
          <br />
          Quem entra é autenticado; os dois veem tudo igual.
        </p>
      </section>
    </main>
  )
}

function LoginPersonBadge({
  person,
  children,
}: {
  person: "thiago" | "jakeline"
  children: string
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-luc-sm text-[11px] font-bold ${
        person === "thiago"
          ? "bg-luc-thiago-bg text-luc-thiago-fg"
          : "bg-luc-jakeline-bg text-luc-jakeline-fg"
      }`}
    >
      {children}
    </span>
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
