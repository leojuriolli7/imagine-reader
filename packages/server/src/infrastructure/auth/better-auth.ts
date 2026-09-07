import { betterAuth } from "better-auth";
import { Effect, Layer, Redacted } from "effect";
import { createTransport } from "nodemailer";
import { Pool } from "pg";
import { Authenticator } from "../../data/ports";
import { AuthenticationError } from "../../domain/errors";
import { AppConfig } from "../config";

export const AuthLive = Layer.effect(
  Authenticator,
  Effect.gen(function* () {
    const config = yield* AppConfig;

    const pool = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new Pool({
            connectionString: config.database.url,
            max: 5,
            connectionTimeoutMillis: 5000,
            statement_timeout: 15000,
            lock_timeout: 5000,
            query_timeout: 20000,
          }),
      ),
      (pool) =>
        Effect.promise(() => pool.end()).pipe(
          Effect.interruptible,
          Effect.timeoutOption("5 seconds"),
          Effect.asVoid,
        ),
    );

    const mail = yield* Effect.acquireRelease(
      Effect.sync(() => createTransport(config.smtpUrl)),
      (mail) => Effect.sync(() => mail.close()),
    );

    const auth = betterAuth({
      baseURL: config.origin,
      secret: Redacted.value(config.authSecret),
      database: pool,
      trustedOrigins: [config.origin],
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: ({ user, url }) =>
          mail
            .sendMail({
              from: config.emailFrom,
              to: user.email,
              subject: "Reset your ImagineReader password",
              text: `Reset your password: ${url}`,
            })
            .then(() => undefined),
      },
      emailVerification: {
        sendVerificationEmail: ({ user, url }) =>
          mail
            .sendMail({
              from: config.emailFrom,
              to: user.email,
              subject: "Verify your ImagineReader email",
              text: `Verify your email: ${url}`,
            })
            .then(() => undefined),
      },
      user: {
        fields: {
          emailVerified: "email_verified",
          createdAt: "created_at",
          updatedAt: "updated_at",
        },
      },
      account: {
        fields: {
          accountId: "account_id",
          providerId: "provider_id",
          userId: "user_id",
          accessToken: "access_token",
          refreshToken: "refresh_token",
          idToken: "id_token",
          accessTokenExpiresAt: "access_token_expires_at",
          refreshTokenExpiresAt: "refresh_token_expires_at",
          createdAt: "created_at",
          updatedAt: "updated_at",
        },
      },
      verification: {
        fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
      },
      session: {
        expiresIn: 604800,
        updateAge: 86400,
        fields: {
          expiresAt: "expires_at",
          createdAt: "created_at",
          updatedAt: "updated_at",
          ipAddress: "ip_address",
          userAgent: "user_agent",
          userId: "user_id",
        },
      },
      rateLimit: { enabled: true },
    });

    return Authenticator.of({
      identify: Effect.fn("Auth.identify")((headers) =>
        Effect.tryPromise({
          try: () => auth.api.getSession({ headers }),
          catch: (cause) => new AuthenticationError({ cause }),
        }).pipe(
          Effect.map((session) =>
            session
              ? { id: session.user.id, name: session.user.name, email: session.user.email }
              : null,
          ),
        ),
      ),
      handler: Effect.fn("Auth.handler")((request) =>
        Effect.tryPromise({
          try: () => auth.handler(request),
          catch: (cause) => new AuthenticationError({ cause }),
        }),
      ),
    });
  }),
);
