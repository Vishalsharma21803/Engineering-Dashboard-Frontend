import { useLayoutEffect, useRef, useState } from "react";
import { AlertDialog } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** The question in full: what will happen, and what is kept. */
  description: string;
  confirmLabel: string;
  /** Shown on the confirm button while the change runs. */
  pendingLabel?: string;
  /** Deletes or stops something: the confirm button is red. */
  destructive?: boolean;
  isPending?: boolean;
  /** Why the last attempt failed; the dialog stays open so it can be tried again. */
  error?: string | null;
  onConfirm: () => void;
  /** Cancel, Escape: false. Ignored while the change runs. */
  onOpenChange: (open: boolean) => void;
}

/**
 * Asks before a change that cannot be taken back (in place of window.confirm). Focus starts
 * on Cancel; only Cancel or Escape close it, never a click outside. The caller closes it
 * when the change succeeds and passes `error` when it fails. On close the focus goes back
 * to whatever opened it (it has no Trigger, so Radix cannot do that itself).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  destructive = false,
  isPending = false,
  error = null,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  // Keeps the text on screen while the dialog animates closed (the caller may already have cleared it).
  const [lastShown, setLastShown] = useState({ title, description, confirmLabel });
  if (open && (lastShown.title !== title || lastShown.description !== description || lastShown.confirmLabel !== confirmLabel)) {
    setLastShown({ title, description, confirmLabel });
  }
  const shown = open ? { title, description, confirmLabel } : lastShown;

  // Taken before Radix moves the focus into the dialog (its focus runs in a later, passive effect).
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) {
      opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    }
  }, [open]);

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!isPending) {
          onOpenChange(next);
        }
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-backdrop/50 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          onEscapeKeyDown={(event) => {
            if (isPending) {
              event.preventDefault();
            }
          }}
          onCloseAutoFocus={(event) => {
            const target = opener.current;
            opener.current = null;

            // Gone (e.g. the row it was on was deleted): Radix's default applies.
            if (target?.isConnected) {
              event.preventDefault();
              target.focus();
            }
          }}
          className="fixed top-[50%] left-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-xl border border-slate-200 bg-surface p-6 text-slate-950 shadow-2xl outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-md"
        >
          <AlertDialog.Title className="text-lg font-semibold tracking-tight">{shown.title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm leading-6 text-slate-600">{shown.description}</AlertDialog.Description>

          {error ? (
            <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={isPending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            {/* Not AlertDialog.Action: that would close the dialog before the change is known to have worked. */}
            <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner className="size-4" />
                  {pendingLabel ?? `${shown.confirmLabel}…`}
                </>
              ) : (
                shown.confirmLabel
              )}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
