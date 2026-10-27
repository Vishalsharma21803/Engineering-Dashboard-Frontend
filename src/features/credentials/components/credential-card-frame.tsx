import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";
import type { ValidationStatus } from "../types/credential.types";
import { formatDateTime } from "../utils/credential-display";
import { CredentialAlert, type CredentialAlertTone } from "./credential-alert";
import { CredentialStatusBadge } from "./credential-status-badge";

/** A result shown inside the card it belongs to (validation, saved token…), closable. */
export type CardNotice = { tone: CredentialAlertTone; message: string };

export type PlatformTone = "indigo" | "emerald" | "violet";

const TONES: Record<PlatformTone, string> = {
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
};

interface CredentialCardFrameProps {
  /** Platform chip ("Azure DevOps", "Solidtime", "AI provider"). */
  platform: { label: string; tone: PlatformTone };
  status: ValidationStatus | null;
  title: string;
  /** The address or key hint under the title. */
  subtitle?: ReactNode;
  /** Small facts next to the status (organization, role…). */
  meta?: ReactNode;
  lastValidatedAt: string | null;
  /** "Azure DevOps", "Solidtime" or the provider, for "Not validated with … yet." */
  validatedWith: string;
  /** Buttons on the right (Validate, Edit or Replace, Delete). */
  actions: ReactNode;
  /** The latest result for this card, with a close button. */
  notice?: CardNotice | null;
  onDismissNotice?: () => void;
  /** Platform-specific settings below the header. */
  children?: ReactNode;
}

/** The same card for every credential: platform, status, name, address, last check and actions; extras below. */
export function CredentialCardFrame({ platform, status, title, subtitle, meta, lastValidatedAt, validatedWith, actions, notice = null, onDismissNotice, children }: CredentialCardFrameProps) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", TONES[platform.tone])}>{platform.label}</span>
            <CredentialStatusBadge status={status} />
            {meta}
          </div>

          <h3 className="mt-3 truncate text-lg font-semibold tracking-tight text-slate-950">{title}</h3>

          {subtitle ? <p className="mt-1 break-all font-mono text-sm text-slate-600">{subtitle}</p> : null}

          <p className="mt-3 text-xs text-slate-500">{lastValidatedAt ? `Last validated ${formatDateTime(lastValidatedAt)}` : `Not validated with ${validatedWith} yet.`}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      </div>

      {notice ? (
        <div className="mt-4">
          <CredentialAlert tone={notice.tone} message={notice.message} {...(onDismissNotice ? { onDismiss: onDismissNotice } : {})} />
        </div>
      ) : null}

      {children ? <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5">{children}</div> : null}
    </Card>
  );
}
