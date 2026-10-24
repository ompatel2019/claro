import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { engineRedirect } from "../accuracy/tabs";

/** The Engine page is now part of Marking quality; old URLs redirect. */
export default async function EnginePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  redirect(engineRedirect(await searchParams));
}
