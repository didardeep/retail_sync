import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Matches components/ui/input.jsx's look, for native <select>/<textarea>
// elements where the full shadcn Select/Textarea wrapper isn't worth the
// extra markup.
export const fieldClass = "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const labelClass = "mb-1 block text-[11.5px] font-semibold text-foreground/80";
