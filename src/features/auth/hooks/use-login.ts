import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clearPrivateQueries } from "@/lib/query-client";
import { loginAccount } from "../api/auth.api";
import { authKeys } from "../api/auth.keys";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginAccount,
    onSuccess: (user) => {
      clearPrivateQueries(queryClient);
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}
