"use server"

import { signOut } from "@/auth"

/** Encerra a sessão e volta pra porta (login). */
export async function logout() {
  await signOut({ redirectTo: "/login" })
}
