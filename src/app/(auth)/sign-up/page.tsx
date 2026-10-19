import type { Metadata } from "next";

import { PageHeader } from "@/components/claro/layout";

import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <>
      <PageHeader
        title="Create your account"
        description="Practise past HSC questions with instant feedback."
      />
      <AuthForm mode="sign-up" />
    </>
  );
}
