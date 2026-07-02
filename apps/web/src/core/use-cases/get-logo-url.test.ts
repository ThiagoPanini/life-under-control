import { describe, expect, it } from "vitest"
import { fakeAttachmentStore } from "./attachment-store.fake"
import { getLogoUrl } from "./get-logo-url"

describe("getLogoUrl (Seam 1)", () => {
  it("test_sem_logo_key_devolve_null_sem_assinar_nada", async () => {
    const store = fakeAttachmentStore()
    expect(await getLogoUrl(store, null)).toBeNull()
  })

  it("test_com_logo_key_assina_a_url_de_leitura", async () => {
    const store = fakeAttachmentStore()
    const url = await getLogoUrl(store, "finance/bills/h-1/bill-1/up-1")
    expect(url).toContain(encodeURIComponent("finance/bills/h-1/bill-1/up-1"))
  })
})
