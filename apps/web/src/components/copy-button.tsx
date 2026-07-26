import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const COPIED_RESET_MS = 2000;

interface CopyButtonProps {
  /** Text placed on the clipboard. */
  value: string;
  /** Accessible label, also used for the success toast. */
  label?: string;
  className?: string;
}

/** Icon button that copies `value` to the clipboard and confirms briefly. */
export function CopyButton({
  value,
  label = "Copied to clipboard",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(label);
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  return (
    <Button
      className={className}
      onClick={handleCopy}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
