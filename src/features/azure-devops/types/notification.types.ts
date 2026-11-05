export type NotificationKind = "pullRequest" | "pipeline" | "approvals" | "timeDay" | "timer" | "timeUntracked" | "closedTicket";
export type NotificationStatus = "UNREAD" | "READ" | "ABANDONED";

export interface RelayNotification {
  id: string;
  key: string;
  kind: NotificationKind;
  projectName: string | null;
  title: string;
  reasons: string[];
  /** Where Open goes. */
  target: {
    type: "workItem" | "pullRequest" | "build" | "time" | "actions";
    projectName: string | null;
    id: number;
    repositoryId?: string;
    solidtimeCredentialId?: string;
  };
  status: NotificationStatus;
  firstSeenAt: string;
  updatedAt: string;
}
