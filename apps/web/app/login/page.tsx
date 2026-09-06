import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";

export default function Login() {
  return (
    <main className="min-h-screen bg-muted/30">
      <header className="mx-auto max-w-7xl px-6 py-7">
        <Brand />
      </header>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2">
        <section className="space-y-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Stories, seen a little differently
          </p>
          <h1 className="max-w-lg font-serif text-5xl leading-tight md:text-6xl">
            Let the world unfold
            <br />
            <span className="italic text-primary/70">as you read.</span>
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
            Bring a book. Find your place. Thoughtful illustrations arrive along the way, bringing
            its moments to life.
          </p>
          <div className="flex gap-6 pt-4 text-sm text-muted-foreground">
            <span>01 · Bring your PDF</span>
            <span>02 · Start reading</span>
          </div>
        </section>
        <AuthForm />
      </div>
    </main>
  );
}
