import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[90px] w-full rounded-md border border-border bg-surface px-4 py-3",
          "text-sm leading-relaxed text-text placeholder:text-text-muted",
          "caret-accent transition-[border-color,outline-color] duration-fast ease-out",
          "hover:border-border-strong",
          "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:cursor-not-allowed disabled:opacity-[.45]",
          "aria-[invalid=true]:border-error aria-[invalid=true]:focus-visible:outline-error",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
