import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useMountedRef } from "@/hooks/use-mounted-ref";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-text";
import { pushGlobalNotice, stampSession } from "@/lib/global-errors";
import { validateCredential } from "../api/credential.api";
import { credentialKeys } from "../api/credential.keys";
import type { Credential } from "../types/credential.types";

export function useValidateCredential() {
  const queryClient = useQueryClient();
  // The page shows its own errors; after it is gone, a toast does.
  const mounted = useMountedRef();

  return useMutation({
    mutationFn: validateCredential,
    onMutate: stampSession,
    onSuccess: (result, credentialId) => {
      const current = queryClient.getQueryData<Credential[]>(
        credentialKeys.list
      );

      if (current) {
        queryClient.setQueryData<Credential[]>(
          credentialKeys.list,
          current.map((item) =>
            item.id === credentialId
              ? {
                  ...item,
                  lastValidatedAt: result.lastValidatedAt,
                  lastValidationStatus: result.valid
                    ? "VALID"
                    : "INVALID",
                }
              : item
          )
        );
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: credentialKeys.list,
      });
    },
    onError: (error, _credentialId, stamp) => {
      if (!mounted.current) {
        pushGlobalNotice({ tone: "error", title: "Could not validate the credential", message: errorMessage(error, "Unable to validate the credential.") }, stamp);
      }

      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 502)
      ) {
        void queryClient.invalidateQueries({
          queryKey: credentialKeys.list,
        });
      }
    },
  });
}
