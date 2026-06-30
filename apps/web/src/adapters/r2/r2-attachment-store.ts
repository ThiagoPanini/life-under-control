import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type { AttachmentStore } from "@/core/ports/attachment-store"

/**
 * Adapter R2 do `AttachmentStore` (ADR-0008) — fino, sobre o S3-SDK (R2 é
 * S3-compatível). Assina URLs de PUT (upload direto do navegador) e de GET
 * (resgate), e apaga objetos; os bytes nunca passam pelo app. A config vem do
 * ambiente (como o `getDb`: falha alto e cedo se faltar). Não há teste de
 * integração contra o R2 real no CI — a assinatura é pura (sem rede) e é o que se
 * cobre; o caminho real se valida em produção.
 */

/** Janela curta das URLs assinadas (5 min) — basta para subir/abrir, expira logo. */
const EXPIRA_SEGUNDOS = 5 * 60

const globalForR2 = globalThis as unknown as { __lucR2?: S3Client }

/** Lê uma variável de ambiente obrigatória; ausente, falha alto e cedo. */
function lerEnv(nome: string): string {
  const v = process.env[nome]
  if (!v) throw new Error(`${nome} não definido`)
  return v
}

/**
 * Config do `S3Client` para o R2 — fonte única, partilhada por produção e teste.
 * Endpoint é a conta R2; credencial é o par Access Key do R2 (não o token
 * Cloudflare); `region: "auto"` é o que o R2 espera.
 *
 * O par `*ChecksumCalculation/Validation: "WHEN_REQUIRED"` é crítico: o aws-sdk
 * (>=3.729) passou a calcular checksums por padrão (`WHEN_SUPPORTED`), o que faz a
 * URL assinada de PUT exigir headers de checksum que o `fetch` cru do navegador
 * não envia — o R2 rejeitaria a assinatura e **todo upload falharia**.
 */
export function r2ClientConfig(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
): S3ClientConfig {
  return {
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  }
}

/**
 * Cliente S3 do R2, singleton (cacheado no globalThis para sobreviver ao
 * hot-reload do dev). Falha alto e cedo se a credencial faltar.
 */
export function getR2Client(): S3Client {
  if (!globalForR2.__lucR2) {
    globalForR2.__lucR2 = new S3Client(
      r2ClientConfig(
        lerEnv("R2_ACCOUNT_ID"),
        lerEnv("R2_ACCESS_KEY_ID"),
        lerEnv("R2_SECRET_ACCESS_KEY"),
      ),
    )
  }
  return globalForR2.__lucR2
}

/**
 * Constrói o `AttachmentStore` sobre o R2. `client` e `bucket` são injetáveis
 * para o teste fino (assinar com credencial sintética, sem rede).
 */
export function r2AttachmentStore(
  client: S3Client = getR2Client(),
  bucket: string = lerEnv("R2_BUCKET"),
): AttachmentStore {
  return {
    async urlDeUpload(chave: string, tipoMime: string): Promise<string> {
      // ContentType fixa a assinatura: o navegador precisa subir com o mesmo tipo.
      const cmd = new PutObjectCommand({ Bucket: bucket, Key: chave, ContentType: tipoMime })
      return getSignedUrl(client, cmd, { expiresIn: EXPIRA_SEGUNDOS })
    },
    async enviar(chave: string, conteudo: Uint8Array, tipoMime: string): Promise<void> {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: chave, Body: conteudo, ContentType: tipoMime }),
      )
    },
    async urlDeLeitura(chave: string): Promise<string> {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: chave })
      return getSignedUrl(client, cmd, { expiresIn: EXPIRA_SEGUNDOS })
    },
    async metadados(chave: string) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: chave }))
        return { tamanhoBytes: Number(r.ContentLength ?? 0), tipoMime: r.ContentType ?? "" }
      } catch (e) {
        // Objeto ausente (o upload nunca chegou) → null; outros erros propagam.
        if (e instanceof Error && (e.name === "NotFound" || e.name === "NoSuchKey")) return null
        throw e
      }
    },
    async remover(chave: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: chave }))
    },
  }
}
