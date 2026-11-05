import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { applyApiError } from "@/lib/form-errors";
import { cn } from "@/utils/cn";
import { FormError } from "../components/form-error";
import { FormNotice } from "../components/form-notice";
import { useLogin } from "../hooks/use-login";
import { isRefusal, useShake } from "../hooks/use-shake";
import {
  loginFormSchema,
  type LoginFormValues,
} from "../schemas/auth.schema";
import { getPostLoginRedirect } from "../utils/redirect-path";
import { clearSessionExpired } from "../utils/session-expiry";

interface LoginLocationState {
  registered?: boolean;
  email?: string;
  /** The account was created but signing in right after failed: why. */
  loginError?: string;
  /** "expired": the session ended on its own (ProtectedRoute). */
  reason?: string;
  /** Said by the server on sign-out, e.g. that the session could not be ended there. */
  notice?: string;
}

export function LoginPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LoginLocationState | null;
  const redirectTo = getPostLoginRedirect(location.state);
  const expired = locationState?.reason === "expired";

  // The notice below has said it; a later sign-out redirect must not repeat it.
  useEffect(() => {
    if (expired) {
      clearSessionExpired();
    }
  }, [expired]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    mode: "onTouched",
    defaultValues: {
      email: locationState?.email ?? "",
      password: "",
    },
  });

  const [cardRef, shake] = useShake<HTMLDivElement>();

  const onSubmit = handleSubmit((values) => {
    setFormError(null);

    login.mutate(values, {
      onSuccess: () => {
        navigate(redirectTo, { replace: true });
      },
      onError: (error) => {
        if (isRefusal(error)) shake();
        setFormError(
          applyApiError(
            error,
            setError,
            ["email", "password"],
            "Unable to sign in. Please try again."
          )
        );
      },
    });
  });

  return (
    <div ref={cardRef}>
      <Card className="auth-stagger p-6 sm:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Sign in to Relay
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Use your Relay account to pick up your work, time
            and SOP checks where you left them.
          </p>
        </div>

        <form
          className="mt-8 space-y-5"
          onSubmit={onSubmit}
          noValidate
        >
          {locationState?.registered && locationState.loginError ? (
            <FormNotice
              tone="warning"
              message={`Account created, but signing you in failed: ${locationState.loginError.replace(/\.+$/, "")}. Sign in below.`}
            />
          ) : locationState?.registered ? (
            <FormNotice message="Account created. Sign in with your new password to continue." />
          ) : null}

          {expired ? (
            <FormNotice
              tone="warning"
              message="Your session expired. Sign in again to continue where you were."
            />
          ) : null}

          {locationState?.notice ? (
            <FormNotice tone="warning" message={locationState.notice} />
          ) : null}

          {formError ? <FormError message={formError} /> : null}

          <FormField
            id="email"
            label="Email"
            error={errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              spellCheck={false}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={
                errors.email ? "email-error" : undefined
              }
              className={cn(
                errors.email
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : undefined
              )}
              {...register("email")}
            />
          </FormField>

          <FormField
            id="password"
            label="Password"
            error={errors.password?.message}
          >
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={
                errors.password ? "password-error" : undefined
              }
              className={cn(
                errors.password
                  ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                  : undefined
              )}
              {...register("password")}
            />
          </FormField>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={login.isPending}
          >
            {login.isPending ? (
              <>
                <Spinner className="size-4" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          New here?{" "}
          <Link
            to="/register"
            className="rounded-sm font-medium text-indigo-600 outline-none hover:text-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
}
