"use client";

import { mutationOptions } from "@tanstack/react-query";
import { authClient } from "./auth-client";

export const authMutations = {
  submit: (mode: "login" | "signup" | "reset") =>
    mutationOptions({
      mutationKey: ["auth", mode],
      mutationFn: (data: FormData) => submitAuth(mode, data),
    }),
  signOut: () =>
    mutationOptions({
      mutationKey: ["auth", "sign-out"],
      mutationFn: async () => {
        const result = await authClient.signOut();

        if (result.error) throw new Error(result.error.message);
      },
    }),
  resetPassword: () =>
    mutationOptions({
      mutationKey: ["auth", "reset-password"],
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
    }),
};

async function submitAuth(mode: "login" | "signup" | "reset", data: FormData) {
  const email = String(data.get("email"));

  const password = String(data.get("password") ?? "");

  const actions = {
    login: () => authClient.signIn.email({ email, password, callbackURL: "/library" }),
    signup: () =>
      authClient.signUp.email({
        email,
        password,
        name: String(data.get("name")),
        callbackURL: "/library",
      }),
    reset: () => authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }),
  };

  const result = await actions[mode]();

  if (result.error) throw new Error(result.error.message);

  return mode === "reset" ? "If this email has an account, a reset link is on its way." : null;
}
