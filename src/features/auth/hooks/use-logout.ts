import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { clearPrivateQueries } from "@/lib/query-client";
import { logoutAccount } from "../api/auth.api";
import { authKeys } from "../api/auth.keys";

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: logoutAccount,
    onSuccess: () => {
      queryClient.setQueryData(authKeys.me, null);
      clearPrivateQueries(queryClient);
      // Commit /login synchronously, before the cleared session reaches
      // React, so ProtectedRoute never records the current page as a
      // post-login return path.
      void navigate("/login", { replace: true, flushSync: true });
    },
  });
}
