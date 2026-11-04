import { useMutation, useQueryClient } from "@tanstack/react-query";

import { actionKeys } from "@/features/azure-devops/api/azure.keys";
import { sopKeys } from "@/features/sop/api/sop.keys";
import { useMountedRef } from "@/hooks/use-mounted-ref";
import { errorMessage } from "@/lib/error-text";
import { pushGlobalNotice, stampSession } from "@/lib/global-errors";
import { updateCredential } from "../api/credential.api";
import { credentialKeys } from "../api/credential.keys";
import { credentialQueryKeys } from "./use-delete-credential";
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
  // The edit page shows its own errors; after it is gone, a toast does.
  const mounted = useMountedRef();

  return useMutation({
    mutationFn: ({ id, input }: UpdateCredentialVariables) =>
      updateCredential(id, input),
    // The variables hold the PAT: do not keep them once the call is done.
    gcTime: 0,
    onMutate: stampSession,
    onError: (error, _input, stamp) => {
      if (!mounted.current) {
        pushGlobalNotice({ tone: "error", title: "Could not update the credential", message: errorMessage(error, "Unable to update the credential.") }, stamp);
      }
    },
    onSuccess: (credential, { id }) => {
      // A new PAT or organization can change everything read with it, so
      // nothing cached under the old one is trusted.
      for (const queryKey of credentialQueryKeys(id)) {
        void queryClient.invalidateQueries({ queryKey });
      }
      void queryClient.invalidateQueries({ queryKey: actionKeys.all });
      void queryClient.invalidateQueries({ queryKey: sopKeys.projects });

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
