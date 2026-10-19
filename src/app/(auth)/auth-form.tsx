"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button, Input } from "@/components/claro/controls";

import { type AuthState, signIn, signUp } from "./actions";

export function AuthForm({
  mode,
  next = "/",
}: {
  mode: "sign-in" | "sign-up";
  next?: string;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "sign-in" ? signIn : signUp,
    {},
  );
  const signingUp = mode === "sign-up";
  return (
    <form action={action} className="flex flex-col gap-4">
      {!signingUp && <input type="hidden" name="next" value={next} />}
      {signingUp && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <Input
            name="full_name"
            autoComplete="name"
            required
            className="h-10"
          />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-10"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Password
        <Input
          name="password"
          type="password"
          minLength={8}
          autoComplete={signingUp ? "new-password" : "current-password"}
          required
          className="h-10"
        />
      </label>
      <p
        aria-live="polite"
        className={
          state.error
            ? "bg-destructive-soft text-destructive border-destructive/20 rounded-lg border px-3 py-2 text-[13px]"
            : state.message
              ? "bg-success-soft text-success-text rounded-lg px-3 py-2 text-[13px]"
              : "sr-only"
        }
      >
        {state.error ?? state.message}
      </p>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        {signingUp ? "Already have an account? " : "New to Claro? "}
        <Link
          href={signingUp ? "/sign-in" : "/sign-up"}
          className="text-foreground font-medium underline underline-offset-4"
        >
          {signingUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
