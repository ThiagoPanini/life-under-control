import { redirect } from "next/navigation"

// A landing não é superfície própria: o gate manda pra porta (login) ou pro
// Painel conforme a sessão. Este redirect é o destino padrão do logado.
export default function Home() {
  redirect("/painel")
}
