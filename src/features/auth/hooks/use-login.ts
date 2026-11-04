import { useMutation, useQueryClient } from "@tanstack/react-query";

import { bumpSessionEpoch } from "@/lib/api-client";
import { dropAllUnsaved } from "@/lib/draft-stash";
import { clearGlobalNotices } from "@/lib/global-errors";
import { clearPrivateQueries } from "@/lib/query-client";
import { loginAccount } from "../api/auth.api";
import { authKeys } from "../api/auth.keys";
import { clearSessionExpired } from "../utils/session-expiry";

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginAccount,
    onSuccess: (user) => {
      // A late 401 from before signing in must not sign this session out.
      bumpSessionEpoch();
      clearSessionExpired();
      // Unsaved edits of another account never reach this one.
      dropAllUnsaved(user.id);
      clearGlobalNotices();
      clearPrivateQueries(queryClient);
      queryClient.setQueryData(authKeys.me, user);
    },
  });
}
