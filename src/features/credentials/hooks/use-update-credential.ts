import { useMutation, useQueryClient } from "@tanstack/react-query";

import { azureKeys, triageKeys } from "@/features/azure-devops/api/azure.keys";
import { updateCredential } from "../api/credential.api";
import { credentialKeys } from "../api/credential.keys";
import type {
  Credential,
  UpdateCredentialInput,
} from "../types/credential.types";

interface UpdateCredentialVariables {
  id: string;
  input: UpdateCredentialInput;
}

export function useUpdateCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: UpdateCredentialVariables) =>
      updateCredential(id, input),
    onSuccess: (credential, { id }) => {
      // A new PAT or organization can change everything read with it, so
      // nothing cached under the old one is trusted.
      void queryClient.invalidateQueries({
        queryKey: [...azureKeys.all, id],
      });
      void queryClient.invalidateQueries({
        queryKey: triageKeys.list(id),
      });

      const current = queryClient.getQueryData<Credential[]>(
        credentialKeys.list
      );

      if (current) {
        queryClient.setQueryData<Credential[]>(
          credentialKeys.list,
          current.map((item) =>
            item.id === credential.id ? credential : item
          )
        );
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: credentialKeys.list,
      });
    },
  });
}
