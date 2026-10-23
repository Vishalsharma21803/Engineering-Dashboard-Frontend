import { useMutation, useQueryClient } from "@tanstack/react-query";

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
    onSuccess: (credential) => {
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
