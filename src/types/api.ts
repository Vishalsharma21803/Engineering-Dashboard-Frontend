export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorPayload {
  message: string;
  errors?: ApiFieldError[];
  reason?: string;
}
