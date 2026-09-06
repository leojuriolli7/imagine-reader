"use client";

import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import Link from "next/link";
import { type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export default function ResetPassword() {
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const token = new URLSearchParams(window.location.search).get("token");

      if (!token) throw new Error("Missing reset token. Request a new link.");

      const result = await authClient.resetPassword({
        token,
        newPassword: String(data.get("password")),
      });

      if (result.error) throw new Error(result.error.message);

      return "Password reset. You can now sign in.";
    },
  });

  const message = mutation.error?.message ?? mutation.data;

  const busy = mutation.isPending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    mutation.mutate(new FormData(event.currentTarget));
  };

  return (
    <main className="mx-auto max-w-md space-y-6 px-6 py-24">
      <h1 className="font-serif text-3xl">A fresh start.</h1>
      <form onSubmit={submit} className="space-y-5">
        <Field>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </Field>
        <Button type="submit" disabled={busy}>
          Reset password
        </Button>
      </form>
      <output>{message}</output>
      <Link href="/login" className="underline">
        Back to sign in
      </Link>
    </main>
  );
}
