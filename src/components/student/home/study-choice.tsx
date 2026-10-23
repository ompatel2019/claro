"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import Link from "next/link";
import { Flame, PortalIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Opening the choice never starts a session; both destinations are setup pages. */
export function StudyChoice() {
  return (
    <Dialog>
      <DialogPrimitive.Trigger render={<Button />}>
        <Flame aria-hidden />
        Light up today
      </DialogPrimitive.Trigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>What would you like to study?</DialogTitle>
          <DialogDescription>
            Choose how to light up today. You can set up your session next.
          </DialogDescription>
        </DialogHeader>
        {[
          {
            name: "Topic Sprint",
            href: "/student/sprint",
            icon: "zap" as const,
            text: "Practise HSC questions on a topic you choose.",
          },
          {
            name: "Flashcards",
            href: "/student/flashcards",
            icon: "copy" as const,
            text: "Choose a topic or review cards you have studied before. Due for review means your saved review date has arrived, based on your previous answers.",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="hover:bg-accent focus-visible:outline-ring flex items-start gap-3 rounded-2xl border p-4 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <PortalIcon
              name={item.icon}
              className="text-brand mt-0.5 shrink-0"
            />
            <span>
              <span className="block font-semibold">{item.name}</span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {item.text}
              </span>
            </span>
          </Link>
        ))}
      </DialogContent>
    </Dialog>
  );
}
