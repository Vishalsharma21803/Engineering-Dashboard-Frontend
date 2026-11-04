import { useMutation, useQueryClient } from "@tanstack/react-query";

import { bumpSessionEpoch } from "@/lib/api-client";
import { dropAllUnsaved } from "@/lib/draft-stash";
import { errorMessage } from "@/lib/error-text";
import { clearGlobalNotices } from "@/lib/global-errors";
import { clearPrivateQueries } from "@/lib/query-client";
import { loginAccount, registerAccount } from "../api/auth.api";
import { authKeys } from "../api/auth.keys";
import type { RegisterInput, User } from "../types/auth.types";
import { clearSessionExpired } from "../utils/session-expiry";

/** The account is created either way; `loginError` says why signing in right after failed. */
export interface RegisterResult {
  user: User | null;
  loginError: string | null;
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegisterInput): Promise<RegisterResult> => {
      await registerAccount(input);

      try {
        const user = await loginAccount({
          email: input.email,
          password: input.password,
        });
        return { user, loginError: null };
      } catch (error) {
        return { user: null, loginError: errorMessage(error, "Signing in did not work.") };
      }
    },
    onSuccess: ({ user }) => {
      if (user) {
        bumpSessionEpoch();
        clearSessionExpired();
        dropAllUnsaved(user.id);
        clearGlobalNotices();
        clearPrivateQueries(queryClient);
        queryClient.setQueryData(authKeys.me, user);
      }
    },
  });
}
