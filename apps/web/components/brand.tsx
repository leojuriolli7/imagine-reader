import { BookOpen } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link
      href="/library"
      className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <BookOpen className="size-5" />
      </span>
      ImagineReader
      <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
        / a little more wonder
      </span>
    </Link>
  );
}
