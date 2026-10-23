import { useMutation, useQueryClient } from "@tanstack/react-query";

import { loginAccount, registerAccount } from "../api/auth.api";
import { authKeys } from "../api/auth.keys";
import type { RegisterInput, User } from "../types/auth.types";

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegisterInput): Promise<User | null> => {
      await registerAccount(input);

      try {
        return await loginAccount({
          email: input.email,
          password: input.password,
        });
      } catch {
        return null;
      }
    },
    onSuccess: (user) => {
      if (user) {
        queryClient.setQueryData(authKeys.me, user);
      }
    },
  });
}
