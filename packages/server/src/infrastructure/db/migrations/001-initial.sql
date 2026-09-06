CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
CREATE TABLE IF NOT EXISTS "books" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"book_id" text NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"priority" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"token" text,
	"lease_until" timestamp,
	"available_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_key_unique" UNIQUE("key")
);
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text;
CREATE INDEX IF NOT EXISTS "account_user_idx" ON "account" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "books_owner_idx" ON "books" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "jobs_poll_idx" ON "jobs" USING btree ("status","available_at","priority");
CREATE INDEX IF NOT EXISTS "jobs_book_idx" ON "jobs" USING btree ("book_id");
CREATE INDEX IF NOT EXISTS "session_user_idx" ON "session" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" USING btree ("identifier");
