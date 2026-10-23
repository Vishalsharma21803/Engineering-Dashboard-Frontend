import { ApiError, apiRequest } from "@/lib/api-client";
import type {
  AuthResponse,
  CurrentUserResponse,
  LoginInput,
  RegisterInput,
  User,
} from "../types/auth.types";

export async function loginAccount(
  input: LoginInput
): Promise<User> {
  const response = await apiRequest<AuthResponse>(
    "/api/auth/login",
    {
      method: "POST",
      body: input,
    }
  );

  return response.user;
}

export async function registerAccount(
  input: RegisterInput
): Promise<User> {
  const response = await apiRequest<AuthResponse>(
    "/api/auth/register",
    {
      method: "POST",
      body: input,
    }
  );

  return response.user;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await apiRequest<CurrentUserResponse>(
      "/api/auth/me"
    );

    return response.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function logoutAccount(): Promise<void> {
  await apiRequest<{ message: string }>("/api/auth/logout", {
    method: "POST",
  });
}
