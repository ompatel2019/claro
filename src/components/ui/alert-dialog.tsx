"use client";
import { AlertDialog as Primitive } from "@base-ui/react/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export const AlertDialog = Primitive.Root;
export const AlertDialogTitle = Primitive.Title;
export const AlertDialogDescription = Primitive.Description;
export function AlertDialogContent({
  className,
  ...props
}: Primitive.Popup.Props) {
  return (
    <Primitive.Portal>
      <Primitive.Backdrop className="data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 bg-navy-deep/30 fixed inset-0 isolate z-50 duration-100 supports-backdrop-filter:backdrop-blur-xs" />
      <Primitive.Popup
        className={cn(
          "bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 shadow-pop fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border p-6 text-sm duration-100 outline-none sm:max-w-[440px]",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
export function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("flex justify-end gap-2", className)} {...props} />;
}
/** Closes the dialog as an outline button. */
export function AlertDialogCancel(props: Primitive.Close.Props) {
  return <Primitive.Close render={<Button variant="outline" />} {...props} />;
}
