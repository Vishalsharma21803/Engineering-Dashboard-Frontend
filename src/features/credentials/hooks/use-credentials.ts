import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import { listCredentials } from "../api/credential.api";
import { credentialKeys } from "../api/credential.keys";

export function useCredentials() {
  return useQuery({
    queryKey: credentialKeys.list,
    queryFn: listCredentials,
    retry: (failureCount, error) => {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        return false;
      }

      return failureCount < 1;
    },
  });
}
