import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/utils/cn";
import { FormError } from "../components/form-error";
import { FormField } from "../components/form-field";
import { FormNotice } from "../components/form-notice";
import { PasswordInput } from "../components/password-input";
import { useLogin } from "../hooks/use-login";
import {
  loginFormSchema,
  type LoginFormValues,
} from "../schemas/auth.schema";
import { applyApiError } from "../utils/apply-api-error";

interface LoginLocationState {
  from?: {
    pathname?: string;
  };
  registered?: boolean;
  email?: string;
}

export function LoginPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LoginLocationState | null;
  const requestedPath = locationState?.from?.pathname;
  const redirectTo =
    requestedPath &&
    requestedPath.startsWith("/") &&
    !requestedPath.startsWith("//") &&
    requestedPath !== "/login"
      ? requestedPath
      : "/";

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

  const onSubmit = handleSubmit((values) => {
    setFormError(null);

    login.mutate(values, {
      onSuccess: () => {
        navigate(redirectTo, { replace: true });
      },
      onError: (error) => {
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
    <Card className="p-6 sm:p-8">
      <div>
        <p className="text-sm font-medium text-indigo-600">
          Welcome back
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          Sign in to your cockpit
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Use your Engineer Cockpit account to access your Azure
          DevOps workspace.
        </p>
      </div>

      <form
        className="mt-8 space-y-5"
        onSubmit={onSubmit}
        noValidate
      >
        {locationState?.registered ? (
          <FormNotice message="Account created. Sign in with your new password to continue." />
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
  );
}
