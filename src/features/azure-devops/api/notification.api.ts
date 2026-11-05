import { apiRequest } from "@/lib/api-client";
import type { RelayNotification, NotificationStatus } from "../types/notification.types";

/** Stored in Relay only; none of these calls change Azure DevOps or Solidtime. */
export async function listNotifications(credentialId: string, projectName: string | undefined, signal?: AbortSignal) {
  const query = new URLSearchParams({ credentialId, ...(projectName ? { projectName } : {}) });
  const response = await apiRequest<{ notifications: RelayNotification[] }>(`/api/notifications?${query.toString()}`, { signal });
  return response.notifications;
}

export async function setNotificationStatus(id: string, status: NotificationStatus) {
  const response = await apiRequest<{ notification: RelayNotification }>(`/api/notifications/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { status },
  });
  return response.notification;
}

export async function readAllNotifications(credentialId: string, projectName: string | undefined) {
  await apiRequest<{ count: number }>("/api/notifications/read-all", {
    method: "POST",
    body: { credentialId, ...(projectName ? { projectName } : {}) },
  });
}
