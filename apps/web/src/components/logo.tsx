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
      <Zap className={cn("size-5", className)} strokeWidth={2.5} />
      {showText && (
        <span className={cn("text-lg font-bold", textStyle)}>
          {seoConstants.SITE_NAME}
        </span>
      )}
    </div>
  );
};
