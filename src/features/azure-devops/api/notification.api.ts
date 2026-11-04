import { apiRequest } from "@/lib/api-client";
import type { CockpitNotification, NotificationStatus } from "../types/notification.types";

/** Stored in Cockpit only; none of these calls change Azure DevOps or Solidtime. */
export async function listNotifications(credentialId: string, projectName: string | undefined) {
  const query = new URLSearchParams({ credentialId, ...(projectName ? { projectName } : {}) });
  const response = await apiRequest<{ notifications: CockpitNotification[] }>(`/api/notifications?${query.toString()}`);
  return response.notifications;
}

export async function setNotificationStatus(id: string, status: NotificationStatus) {
  const response = await apiRequest<{ notification: CockpitNotification }>(`/api/notifications/${encodeURIComponent(id)}`, {
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
