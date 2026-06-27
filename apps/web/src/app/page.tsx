import { Logo } from "@/components/brand/Logo"

export default function Home() {
  return (
    <main
      className="relative flex min-h-dvh flex-col items-center justify-center px-6 text-center"
      style={{
        background:
          "radial-gradient(100% 55% at 82% -8%, rgba(76,196,230,.07), transparent 60%), var(--luc-bg)",
      }}
    >
      <div className="flex flex-col items-center gap-6">
        <Logo size={56} />
        <div className="flex flex-col items-center gap-2">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.18em] text-luc-accent">
            Cockpit do Lar
          </p>
          <h1 className="text-4xl font-extrabold tracking-[-0.035em] text-luc-text sm:text-5xl">
            Life Under Control
          </h1>
          <p className="max-w-md leading-relaxed text-luc-text-2">
            A vida adulta do Lar num só lugar. Em construção, fatia por fatia.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-luc-md border border-luc-border bg-luc-surface-2 px-3 py-1.5 font-mono text-[11.5px] text-luc-text-3">
          <span className="h-2 w-2 rounded-full bg-luc-success" />
          carcaça viva · S0
        </span>
      </div>
    </main>
  )
}
