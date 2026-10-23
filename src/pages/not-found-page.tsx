import { Link } from "react-router-dom";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function NotFoundPage() {
  return (
    <section className="flex w-full items-center justify-center py-12">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <p className="text-sm font-semibold text-indigo-600">404</p>
          <CardTitle>Page not found</CardTitle>
          <CardDescription>
            The page you are looking for does not exist or has moved.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-slate-500">
            Return to the cockpit to continue.
          </p>
        </CardContent>

        <CardFooter className="justify-center">
          <Link
            to="/"
            className="rounded-md text-sm font-medium text-indigo-600 outline-none hover:text-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Back to home
          </Link>
        </CardFooter>
      </Card>
    </section>
  );
}
