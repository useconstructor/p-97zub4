"use client";
import * as Primitive from "@radix-ui/react-alert-dialog";
export const AlertDialog = Primitive.Root;
export const AlertDialogTitle = Primitive.Title;
export const AlertDialogDescription = Primitive.Description;
export const AlertDialogCancel = Primitive.Cancel;
export const AlertDialogAction = Primitive.Action;
export function AlertDialogContent({ children, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Overlay className="dialog-overlay" /><Primitive.Content className="dialog-content" {...props}>{children}</Primitive.Content></Primitive.Portal>;
}
