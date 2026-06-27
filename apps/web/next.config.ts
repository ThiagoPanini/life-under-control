import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Saída autossuficiente para a imagem Docker (deploy GHCR → Coolify).
  output: "standalone",
  // O traçado de arquivos parte da raiz do monorepo, não de apps/web.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
}

export default nextConfig
