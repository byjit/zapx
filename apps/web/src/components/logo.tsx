import { Zap } from "lucide-react";
import { seoConstants } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Logo = ({
  className,
  showText,
  textStyle,
}: {
  className?: string;
  showText?: boolean;
  textStyle?: string;
}) => {
  return (
    <div className="flex items-center gap-1">
      <Zap strokeWidth={2.5} className={cn("size-5", className)} />
      {showText && (
        <span className={cn("text-lg font-bold", textStyle)}>
          {seoConstants.SITE_NAME}
        </span>
      )}
    </div>
  );
};
