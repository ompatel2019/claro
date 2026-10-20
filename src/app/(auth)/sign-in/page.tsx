import { safeLocalPath } from "@/lib/safe-local-path";
import type { Metadata } from "next";

import { PageHeader } from "@/components/claro/layout";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <>
      <PageHeader
        title="Welcome back"
        description="Pick up where you left off."
      />
      <AuthForm mode="sign-in" next={safeLocalPath(next)} />
    </>
  );
}
