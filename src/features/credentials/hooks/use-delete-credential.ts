import { useMutation, useQueryClient } from "@tanstack/react-query";

import { azureKeys, triageKeys } from "@/features/azure-devops/api/azure.keys";
import { solidtimeKeys } from "@/features/solidtime/api/solidtime.keys";
import { deleteCredential } from "../api/credential.api";
import { credentialKeys } from "../api/credential.keys";
import type { Credential } from "../types/credential.types";

export function useDeleteCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCredential,
    onSuccess: (_, credentialId) => {
      // The credential is gone: drop everything cached under it.
      queryClient.removeQueries({
        queryKey: [...azureKeys.all, credentialId],
      });
      queryClient.removeQueries({
        queryKey: triageKeys.list(credentialId),
      });
      // Solidtime connections may have been linked to it.
      void queryClient.invalidateQueries({ queryKey: solidtimeKeys.connections });

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
