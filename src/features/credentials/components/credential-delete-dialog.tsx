import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (credential && !dialog.open) {
      dialog.showModal();
    }

    if (!credential && dialog.open) {
      dialog.close();
    }
  }, [credential]);

  const displayName = credential
    ? getCredentialDisplayName(credential)
    : "this credential";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="delete-credential-title"
      aria-describedby="delete-credential-description"
      onCancel={(event) => {
        if (isPending) {
          event.preventDefault();
        }
      }}
      onClose={() => {
        if (!isPending) {
          onClose();
        }
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/50"
    >
      {credential ? (
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
            Destructive action
          </p>

          <h2
            id="delete-credential-title"
            className="mt-2 text-xl font-semibold tracking-tight"
          >
            Delete credential?
          </h2>

          <p
            id="delete-credential-description"
            className="mt-3 text-sm leading-6 text-slate-600"
          >
            This permanently deletes{" "}
            <span className="font-semibold text-slate-950">
              {displayName}
            </span>{" "}
            and its encrypted PAT. This cannot be undone.
          </p>

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
        </div>
      ) : null}
    </dialog>
  );
}
