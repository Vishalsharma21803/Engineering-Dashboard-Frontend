import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api-client";
import { applyApiError } from "@/lib/form-errors";
import { cn } from "@/utils/cn";
import { FormError } from "../components/form-error";
import { useRegister } from "../hooks/use-register";
import {
  registerFormSchema,
  type RegisterFormValues,
} from "../schemas/auth.schema";

export function RegisterPage() {
  const [formError, setFormError] = useState<string | null>(null);
  const registerMutation = useRegister();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);

    registerMutation.mutate(
      {
        name: values.name,
        email: values.email,
        password: values.password,
      },
      {
        onSuccess: (user) => {
          if (user) {
            navigate("/", { replace: true });
            return;
          }

          navigate("/login", {
            replace: true,
            state: {
              registered: true,
              email: values.email,
            },
          });
        },
        onError: (error) => {
          const message = applyApiError(
            error,
            setError,
            ["name", "email", "password"],
            "Unable to create your account. Please try again."
          );

          if (error instanceof ApiError && error.status === 409) {
            setError(
              "email",
              {
                type: "server",
                message: error.message,
              },
              { shouldFocus: true }
            );
          }

          setFormError(message);
        },
      }
    );
  });

  return (
    <Card className="p-6 sm:p-8">
      <div>
        <p className="text-sm font-medium text-indigo-600">
          Get started
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          Create your account
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Set up your Engineer Cockpit account. We will sign you in
          automatically after registration.
        </p>
      </div>

      <form
        className="mt-8 space-y-5"
        onSubmit={onSubmit}
        noValidate
      >
        {formError ? <FormError message={formError} /> : null}

        <FormField
          id="name"
          label="Name"
          error={errors.name?.message}
        >
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={
              errors.name ? "name-error" : undefined
            }
            className={cn(
              errors.name
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                : undefined
            )}
            {...register("name")}
          />
        </FormField>

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
          hint="At least 8 characters."
        >
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Create a password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={
              errors.password
                ? "password-error"
                : "password-hint"
            }
            className={cn(
              errors.password
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                : undefined
            )}
            {...register("password")}
          />
        </FormField>

        <FormField
          id="confirmPassword"
          label="Confirm password"
          error={errors.confirmPassword?.message}
        >
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            placeholder="Repeat your password"
            aria-invalid={
              errors.confirmPassword ? true : undefined
            }
            aria-describedby={
              errors.confirmPassword
                ? "confirmPassword-error"
                : undefined
            }
            className={cn(
              errors.confirmPassword
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20"
                : undefined
            )}
            {...register("confirmPassword")}
          />
        </FormField>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={registerMutation.isPending}
        >
          {registerMutation.isPending ? (
            <>
              <Spinner className="size-4" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link
          to="/login"
          className="rounded-sm font-medium text-indigo-600 outline-none hover:text-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          Sign in
        </Link>
      </p>
    </Card>
  );
}
