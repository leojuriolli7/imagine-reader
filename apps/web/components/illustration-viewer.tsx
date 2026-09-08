"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import Image from "next/image";

export function IllustrationViewer({ src }: { src: string }) {
  return (
    <Dialog>
      <DialogTrigger
        aria-label="Open illustration fullscreen"
        className="animate-[illustration-appear_350ms_ease-out_both] block w-full cursor-zoom-in overflow-hidden rounded-xl border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Image
          width={1024}
          height={1024}
          unoptimized
          src={src}
          alt="Illustration of the current scene in your book"
          className="h-auto w-full object-contain min-[1440px]:max-h-[calc(100dvh-3rem)]"
        />
      </DialogTrigger>
      <DialogContent className="h-dvh w-screen max-w-none gap-0 rounded-none p-4 pt-16 sm:max-w-none">
        <DialogTitle className="sr-only">Scene illustration</DialogTitle>
        <DialogDescription className="sr-only">
          Full-size illustration of the current scene. Press Escape to close.
        </DialogDescription>
        <div className="relative h-full min-h-0 w-full">
          <Image
            fill
            unoptimized
            sizes="100vw"
            src={src}
            alt="Illustration of the current scene in your book"
            className="object-contain"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
