import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

import { actionKeys, azureKeys, notificationKeys, triageKeys } from "@/features/azure-devops/api/azure.keys";
import { solidtimeKeys } from "@/features/solidtime/api/solidtime.keys";
import { sopKeys } from "@/features/sop/api/sop.keys";
import { useMountedRef } from "@/hooks/use-mounted-ref";
import { errorMessage } from "@/lib/error-text";
import { pushGlobalNotice, stampSession } from "@/lib/global-errors";
import { deleteCredential } from "../api/credential.api";
import { credentialKeys } from "../api/credential.keys";
import type { Credential } from "../types/credential.types";

/** Everything cached under one credential, Azure DevOps or Solidtime. */
export function credentialQueryKeys(credentialId: string): QueryKey[] {
  return [
    [...azureKeys.all, credentialId],
    triageKeys.list(credentialId),
    [...notificationKeys.all, credentialId],
    sopKeys.azureProjects(credentialId),
    sopKeys.ai(credentialId),
    ["sop", "report", credentialId],
    [...solidtimeKeys.all, credentialId],
    solidtimeKeys.memberships(credentialId),
  ];
}

/** The credential is gone: drop what was read with it and refresh what may have mentioned it. */
export function dropCredentialCaches(queryClient: QueryClient, credentialId: string): void {
  for (const queryKey of credentialQueryKeys(credentialId)) {
    queryClient.removeQueries({ queryKey });
  }

  // Its pending approvals and SOP project rows are gone with it; Solidtime connections may have been linked to it.
  void queryClient.invalidateQueries({ queryKey: actionKeys.all });
  void queryClient.invalidateQueries({ queryKey: sopKeys.projects });
  void queryClient.invalidateQueries({ queryKey: solidtimeKeys.connections });
}

export function useDeleteCredential() {
  const queryClient = useQueryClient();
  // The page shows its own errors; after it is gone, a toast does.
  const mounted = useMountedRef();

  return useMutation({
    mutationFn: deleteCredential,
    onMutate: stampSession,
    onError: (error, _credentialId, stamp) => {
      if (!mounted.current) {
        pushGlobalNotice({ tone: "error", title: "Could not delete the credential", message: errorMessage(error, "Unable to delete the credential.") }, stamp);
      }
    },
    onSuccess: (_, credentialId) => {
      dropCredentialCaches(queryClient, credentialId);

      const current = queryClient.getQueryData<Credential[]>(
        credentialKeys.list
      );

      if (current) {
        queryClient.setQueryData<Credential[]>(
          credentialKeys.list,
          current.filter((item) => item.id !== credentialId)
        );
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: credentialKeys.list,
      });
    },
  });
}
