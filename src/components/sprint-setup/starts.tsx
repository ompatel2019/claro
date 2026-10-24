import { useActionState } from "react";
import { startSprint } from "@/app/(app)/actions";
import { PortalIcon } from "../icons";
import { Button } from "../ui/button";

/** Results "Same setup again": starts a new sprint with this session's settings. */
export function SameSetup({ config }: { config: object }) {
  const [state, action, pending] = useActionState(startSprint, {});
  return (
    <form action={action}>
      <Button
        variant="outline"
        name="config"
        value={JSON.stringify(config)}
        type="submit"
        disabled={pending}
      >
        <PortalIcon name="rotate-ccw" className="size-4" />
        {pending ? "Building…" : "Same setup again"}
      </Button>
      {state.error && (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {state.error}
        </p>
      )}
    </form>
  );
}
