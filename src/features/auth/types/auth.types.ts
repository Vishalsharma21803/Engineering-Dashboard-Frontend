export interface User {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  /** Set by the server (SOP_ADMIN_EMAILS); controls owner-only settings. */
  isSopAdmin?: boolean;
}

export interface AuthResponse {
  message: string;
  user: User;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface CurrentUserResponse {
  user: User;
}

export interface LogoutResponse {
  message: string;
  /** SESSION_NOT_REVOKED: signed out here, but copies of the session stay valid until they expire. */
  reason?: string;
}
