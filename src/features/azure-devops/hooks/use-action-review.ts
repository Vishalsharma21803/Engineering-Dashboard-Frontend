import { useState } from "react";

import { errorMessage } from "@/lib/error-text";
import type { ProposeActionInput, ProposedAction } from "../types/action.types";
import { useProposeAction } from "./use-actions";

/**
 * Propose → review. Proposing only creates a pending action; the dialog
 * opened afterwards is where the user approves or rejects it.
 */
export function useActionReview() {
  const proposeMutation = useProposeAction();
  const [reviewing, setReviewing] = useState<ProposedAction | null>(null);
  const [proposeError, setProposeError] = useState<string | null>(null);

  function propose(input: ProposeActionInput, onProposed?: () => void) {
    setProposeError(null);
    proposeMutation.mutate(input, {
      onSuccess: (action) => {
        setReviewing(action);
        onProposed?.();
      },
      onError: (error) =>
        setProposeError(errorMessage(error, "The action could not be prepared.")),
    });
  }

  return {
    propose,
    isProposing: proposeMutation.isPending,
    proposeError,
    clearProposeError: () => setProposeError(null),
    reviewing,
    review: setReviewing,
    closeReview: () => setReviewing(null),
  };
}
