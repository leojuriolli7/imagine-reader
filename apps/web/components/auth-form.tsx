"use client";

import { useMutation } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authMutations } from "@/lib/auth-options";

export function AuthForm() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");

  const mutation = useMutation({
    ...authMutations.submit(mode),
    onSuccess: (notice) => {
      if (!notice) {
        router.push("/library");

        router.refresh();
      }
    },
  });

  const busy = mutation.isPending;

  const message = mutation.error?.message ?? mutation.data;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    mutation.mutate(new FormData(event.currentTarget));
  }

  return (
    <Card className="w-full max-w-md shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{labels[mode].title}</CardTitle>
        <CardDescription>Your books. A world of imagination.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          {mode === "signup" && (
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                placeholder="Type a name..."
                id="name"
                name="name"
                autoComplete="name"
                required
                maxLength={100}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              placeholder="Type an email..."
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </Field>
          {mode !== "reset" && (
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                placeholder="Type a password..."
                id="password"
                name="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={mode === "signup" ? 12 : 1}
                maxLength={128}
              />
              {mode === "signup" && (
                <FieldDescription>Use at least 12 characters.</FieldDescription>
              )}
            </Field>
          )}
          {message && <output className="text-sm text-destructive">{message}</output>}
          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? "Just a moment…" : labels[mode].submit}
          </Button>
        </form>
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <Button
            variant="link"
            onClick={() => {
              setMode(mode === "signup" ? "login" : "signup");

              mutation.reset();
            }}
          >
            {mode === "signup" ? "Already have an account?" : "Create an account"}
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setMode(mode === "reset" ? "login" : "reset");

              mutation.reset();
            }}
          >
            {mode === "reset" ? "Back to sign in" : "Forgot password?"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const labels = {
  login: { title: "Welcome back", submit: "Sign in" },
  signup: { title: "Begin your next chapter", submit: "Create account" },
  reset: { title: "Reset your password", submit: "Send reset link" },
};
