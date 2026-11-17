import { connection } from "next/server"
import { getAppSettings } from "@/lib/app-settings"

export async function GET() {
  await connection()
  const settings = await getAppSettings()
  return Response.json(settings, {
    headers: { "Cache-Control": "no-store" },
  })
}
