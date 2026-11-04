import { useEffect, useState } from "react";
import { isRouteErrorResponse, Link, useLocation, useNavigate, useRouteError } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/utils/cn";

/** After a deploy, the old page asks for code files that no longer exist. */
const CHUNK_LOAD_FAILURE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed|Unable to preload CSS/i;

function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && (error.name === "ChunkLoadError" || CHUNK_LOAD_FAILURE.test(error.message));
}

function describe(error: unknown): { title: string; message: string } {
  if (isRouteErrorResponse(error)) {
    return {
      title: error.status === 404 ? "Page not found" : `Something went wrong (HTTP ${error.status})`,
      message: error.statusText || (typeof error.data === "string" ? error.data : "The page could not be shown."),
    };
  }

  if (error instanceof Error && error.message) {
    return { title: "This page crashed", message: error.message };
  }

  return { title: "This page crashed", message: "An unexpected error stopped this page from showing." };
}

interface RouteErrorProps {
  /** The layout itself failed: there is no header around this card. */
  fullPage?: boolean;
}

/**
 * Error boundary for the router. Inside a layout it replaces only the page, so the
 * navigation stays usable; at the top level it stands alone. No telemetry exists:
 * the error goes to the console.
 */
export function RouteError({ fullPage = false }: RouteErrorProps) {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const chunkFailed = isChunkLoadError(error);
  const { title, message } = describe(error);

  useEffect(() => {
    console.error(error);
  }, [error]);

  async function copyDetails() {
    const details = [
      `${title}: ${message}`,
      `Page: ${location.pathname}${location.search}`,
      `Time: ${new Date().toISOString()}`,
      error instanceof Error && error.stack ? error.stack : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      // Missing on non-secure origins (a LAN address or a tunnel without https).
      if (!navigator.clipboard) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(details);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <section role="alert" className={cn("flex w-full items-center justify-center py-12", fullPage && "min-h-screen px-4")}>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{chunkFailed ? "A new version of Cockpit is available" : title}</CardTitle>
          <CardDescription>
            {chunkFailed ? "Part of this page could not be loaded, usually because Cockpit was updated. Reload to get the new version." : message}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-wrap gap-2">
          {chunkFailed ? (
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => void navigate(0)}>
                Try again
              </Button>
              {/* A plain link: in-app navigation from the top-level boundary has no layout to land in. */}
              {fullPage ? (
                <a href="/" className={buttonClassName({ variant: "ghost", size: "sm" })}>
                  Go home
                </a>
              ) : (
                <Link to="/" className={buttonClassName({ variant: "ghost", size: "sm" })}>
                  Go home
                </Link>
              )}
              <Button size="sm" variant="ghost" onClick={() => void copyDetails()}>
                {copied === "done" ? "Copied" : "Copy details"}
              </Button>
            </>
          )}
          {copied === "failed" ? <p className="w-full text-xs text-slate-500">Copying is not available here; select the message above instead.</p> : null}
        </CardFooter>
      </Card>
    </section>
  );
}
