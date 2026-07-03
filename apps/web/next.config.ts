import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Saída autossuficiente para a imagem Docker (deploy GHCR → Coolify).
  output: "standalone",
  // O traçado de arquivos parte da raiz do monorepo, não de apps/web.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  // Flag não-secreta, embutida para a borda Edge. O `NODE_ENV=production`
  // continua tornando o bypass impossível mesmo se houver configuração errada.
  env: { LUC_LOCAL_AUTH_BYPASS: process.env.LUC_LOCAL_AUTH_BYPASS ?? "false" },
  images: {
    // Avatares espelhados no R2 (#51) — hostname coringa: não depende da conta
    // (R2_ACCOUNT_ID) estar disponível no build, só no runtime (ADR-0008).
    remotePatterns: [{ protocol: "https", hostname: "*.r2.cloudflarestorage.com" }],
  },
}

export default nextConfig
