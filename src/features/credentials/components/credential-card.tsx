import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { Spinner } from "@/components/ui/spinner";
import type { Credential } from "../types/credential.types";
import { getCredentialDisplayName } from "../utils/credential-display";
import { CredentialCardFrame, type CardNotice } from "./credential-card-frame";
import { EditIcon, ShieldIcon, TrashIcon } from "./credential-icons";

interface CredentialCardProps {
  credential: Credential;
  isValidating: boolean;
  validateDisabled: boolean;
  deleteDisabled: boolean;
  onValidate: (credential: Credential) => void;
  onDelete: (credential: Credential) => void;
  notice?: CardNotice | null;
  onDismissNotice?: () => void;
}

export function CredentialCard({ credential, isValidating, validateDisabled, deleteDisabled, onValidate, onDelete, notice = null, onDismissNotice }: CredentialCardProps) {
  const displayName = getCredentialDisplayName(credential);

  return (
    <CredentialCardFrame
      platform={{ label: "Azure DevOps", tone: "indigo" }}
      status={credential.lastValidationStatus}
      title={displayName}
      subtitle={credential.organizationUrl}
      lastValidatedAt={credential.lastValidatedAt}
      validatedWith="Azure DevOps"
      notice={notice}
      {...(onDismissNotice ? { onDismissNotice } : {})}
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={() => onValidate(credential)} disabled={validateDisabled} aria-label={`Validate ${displayName}`}>
            {isValidating ? <Spinner className="size-3.5" /> : <ShieldIcon />}
            {isValidating ? "Validating..." : "Validate"}
          </Button>

          <Link to={`/credentials/${credential.id}/edit`} className={buttonClassName({ variant: "secondary", size: "sm" })} aria-label={`Edit ${displayName}`}>
            <EditIcon />
            Edit
          </Link>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDelete(credential)}
            disabled={deleteDisabled}
            aria-label={`Delete ${displayName}`}
            className="text-rose-700 hover:bg-rose-50 hover:text-rose-700"
          >
            <TrashIcon />
            Delete
          </Button>
        </>
      }
    />
  );
}
