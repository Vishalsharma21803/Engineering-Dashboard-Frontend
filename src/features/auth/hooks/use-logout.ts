import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logoutAccount } from "../api/auth.api";
import { authKeys } from "../api/auth.keys";

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutAccount,
    onSuccess: () => {
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}
