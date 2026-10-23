import { useMutation, useQueryClient } from "@tanstack/react-query";

import { deleteCredential } from "../api/credential.api";
import { credentialKeys } from "../api/credential.keys";
import type { Credential } from "../types/credential.types";

export function useDeleteCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCredential,
    onSuccess: (_, credentialId) => {
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
