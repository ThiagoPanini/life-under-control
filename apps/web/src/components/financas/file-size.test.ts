import { describe, expect, it } from "vitest"
import { formatarTamanhoArquivo } from "./file-size"

describe("formatarTamanhoArquivo", () => {
  it("test_bytes_ate_1kb_mostra_em_B", () => {
    // given um arquivo minúsculo
    // when formata
    // then bytes crus, sem casa decimal
    expect(formatarTamanhoArquivo(512)).toBe("512 B")
  })

  it("test_kb_arredonda_sem_decimal", () => {
    expect(formatarTamanhoArquivo(340 * 1024)).toBe("340 KB")
    expect(formatarTamanhoArquivo(1500)).toBe("1 KB")
  })

  it("test_mb_uma_casa_com_virgula", () => {
    // then vírgula pt-BR, uma casa — como o protótipo Final (fmtTam)
    expect(formatarTamanhoArquivo(1.2 * 1048576)).toBe("1,2 MB")
  })
})
