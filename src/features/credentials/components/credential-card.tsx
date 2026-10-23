import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { Credential } from "../types/credential.types";
import {
  formatDateTime,
  getCredentialDisplayName,
} from "../utils/credential-display";
import { CredentialStatusBadge } from "./credential-status-badge";

interface CredentialCardProps {
  credential: Credential;
  isValidating: boolean;
  validateDisabled: boolean;
  deleteDisabled: boolean;
  onValidate: (credential: Credential) => void;
  onDelete: (credential: Credential) => void;
}

export function CredentialCard({
  credential,
  isValidating,
  validateDisabled,
  deleteDisabled,
  onValidate,
  onDelete,
}: CredentialCardProps) {
  const displayName = getCredentialDisplayName(credential);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="size-3.5"
              >
                <path d="M4.5 3A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 15.5 3h-11Zm1.75 2.5a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Zm0 3a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Zm0 3a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5h-6Z" />
              </svg>
              Azure DevOps
            </span>

            <CredentialStatusBadge
              status={credential.lastValidationStatus}
            />
          </div>

          <h2 className="mt-3 truncate text-lg font-semibold tracking-tight text-slate-950">
            {displayName}
          </h2>

          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            {credential.organizationUrl}
          </p>

          <p className="mt-3 text-xs text-slate-500">
            {credential.lastValidatedAt
              ? `Last validated ${formatDateTime(
                  credential.lastValidatedAt
                )}`
              : "Not validated with Azure DevOps yet."}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onValidate(credential)}
            disabled={validateDisabled}
            aria-label={`Validate ${displayName}`}
          >
            {isValidating ? (
              <Spinner className="size-3.5" />
            ) : (
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="size-4"
              >
                <path
                  fillRule="evenodd"
                  d="M10 1.944a11.954 11.954 0 0 1-3.944.753c-.882 0-1.74-.095-2.567-.277A2.25 2.25 0 0 0 1.25 4.66v4.254c0 4.313 2.626 7.992 6.39 9.944a2.25 2.25 0 0 0 1.72 0c3.764-1.952 6.39-5.631 6.39-9.944V4.66a2.25 2.25 0 0 0-2.239-2.24c-.827.182-1.685.277-2.567.277A11.954 11.954 0 0 1 10 1.944Zm3.28 6.025a.75.75 0 1 0-1.06-1.06L9.25 9.88 7.78 8.41a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0l3.5-3.5Z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {isValidating ? "Validating..." : "Validate"}
          </Button>

          <Link
            to={`/credentials/${credential.id}/edit`}
            className={buttonClassName({
              variant: "secondary",
              size: "sm",
            })}
            aria-label={`Edit ${displayName}`}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="size-4"
            >
              <path d="m5.433 13.917-1.262-1.262 7.313-7.313 1.262 1.262-7.313 7.313ZM4.5 17a2.5 2.5 0 0 0 2.5-2.5v-.433l-2.067-2.067H4.5A2.5 2.5 0 0 0 2 14.5 2.5 2.5 0 0 0 4.5 17Zm10.72-10.22a1.75 1.75 0 0 0 0-2.474l-.486-.486a1.75 1.75 0 0 0-2.474 0l-.9.9 2.96 2.96.9-.9Z" />
            </svg>
            Edit
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(credential)}
            disabled={deleteDisabled}
            aria-label={`Delete ${displayName}`}
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="size-4"
            >
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482 41.03 41.03 0 0 0-2.365-.298V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                clipRule="evenodd"
              />
            </svg>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
