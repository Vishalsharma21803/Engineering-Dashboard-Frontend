import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { bumpSessionEpoch } from "@/lib/api-client";
import { dropAllUnsaved } from "@/lib/draft-stash";
import { clearGlobalNotices } from "@/lib/global-errors";
import { clearPrivateQueries } from "@/lib/query-client";
import { logoutAccount } from "../api/auth.api";
import { authKeys } from "../api/auth.keys";
import { clearSessionExpired } from "../utils/session-expiry";

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: logoutAccount,
    onSuccess: (response) => {
      // Answers to requests from the ended session must not act on the next one.
      bumpSessionEpoch();
      clearSessionExpired();
      dropAllUnsaved();
      clearGlobalNotices();
      queryClient.setQueryData(authKeys.me, null);
      clearPrivateQueries(queryClient);
      // Commit /login synchronously, before the cleared session reaches
      // React, so ProtectedRoute never records the current page as a
      // post-login return path.
      void navigate("/login", {
        replace: true,
        flushSync: true,
        // Signed out here, but the server could not end the session: say so.
        ...(response?.reason === "SESSION_NOT_REVOKED" ? { state: { notice: response.message } } : {}),
      });
    },
  });
}
