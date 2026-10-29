import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { Credential } from "../types/credential.types";
import { getCredentialDisplayName } from "../utils/credential-display";

interface CredentialDeleteDialogProps {
  credential: Credential | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CredentialDeleteDialog({
  credential,
  isPending,
  onClose,
  onConfirm,
}: CredentialDeleteDialogProps) {
  // Keeps the name on screen while the dialog animates closed.
  const [lastShown, setLastShown] = useState(credential);
  if (credential && credential !== lastShown) {
    setLastShown(credential);
  }
  const shown = credential ?? lastShown;

  const displayName = shown
    ? getCredentialDisplayName(shown)
    : "this credential";

  return (
    <Dialog
      open={credential !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        // As before: only Escape or Cancel close it, never a click on the backdrop.
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) {
            event.preventDefault();
          }
        }}
        className="block max-w-md rounded-xl border-slate-200 bg-surface p-6 text-slate-950 shadow-2xl sm:max-w-md"
      >
        <DialogTitle className="text-xl font-semibold tracking-tight">
          Delete credential?
        </DialogTitle>

        <DialogDescription className="mt-3 text-sm leading-6 text-slate-600">
          This permanently deletes{" "}
          <span className="font-semibold text-slate-950">
            {displayName}
          </span>{" "}
          and its encrypted PAT. This cannot be undone.
        </DialogDescription>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isPending}
            autoFocus
          >
            Cancel
          </Button>

          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Spinner className="size-4" />
                Deleting...
              </>
            ) : (
              "Delete credential"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
