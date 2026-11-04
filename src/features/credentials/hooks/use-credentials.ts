import { useQuery } from "@tanstack/react-query";

import { retryUnlessClientError } from "@/lib/query-retry";
import { listCredentials } from "../api/credential.api";
import { credentialKeys } from "../api/credential.keys";

/** Azure DevOps credentials only; Solidtime connections are listed by the Solidtime feature. */
export function useCredentials() {
  return useQuery({
    queryKey: credentialKeys.list,
    queryFn: ({ signal }) => listCredentials(signal),
    select: (credentials) => credentials.filter((credential) => credential.platform === "AZURE"),
    retry: retryUnlessClientError,
  });
}
