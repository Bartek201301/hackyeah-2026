"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

const iconButton =
  "inline-flex size-10 items-center justify-center rounded-control text-fg hover:bg-surface-muted " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg";

/**
 * Phone menu: the sidebar in a native modal <dialog>. showModal() traps focus, Esc closes it and
 * the browser returns focus to the menu button. A backdrop click or following a link closes it.
 */
export function MobileNav({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);

  function closeOnBackdropOrLink(event: MouseEvent<HTMLDialogElement>) {
    const target = event.target as Element;
    if (target === event.currentTarget || target.closest("a")) event.currentTarget.close();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className={iconButton}
      >
        <Menu className="size-5" aria-hidden />
      </button>
      <dialog
        ref={dialog}
        aria-label="Menu"
        onClick={closeOnBackdropOrLink}
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-r border-border bg-bg p-0 text-fg backdrop:bg-fg/30"
      >
        <div className="relative h-full">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => dialog.current?.close()}
            className={`${iconButton} absolute top-3 right-3 z-10`}
          >
            <X className="size-5" aria-hidden />
          </button>
          {children}
        </div>
      </dialog>
    </>
  );
}
