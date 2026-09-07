import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { ThemeMenu } from "@/components/theme-menu";

export default function Login() {
  return (
    <main className="min-h-screen bg-muted/30">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7">
        <Brand />
        <ThemeMenu />
      </header>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2">
        <section className="space-y-6">
          <h1 className="max-w-lg font-serif text-5xl leading-tight md:text-6xl">
            Let the world unfold
            <br />
            <span className="italic text-primary/70">as you read.</span>
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
            Bring a book. Find your place. Thoughtful illustrations arrive, bringing its moments to
            life.
          </p>
        </section>
        <AuthForm />
      </div>
    </main>
  );
}
