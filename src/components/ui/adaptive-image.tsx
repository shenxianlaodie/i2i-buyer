import { cn } from "@/lib/utils";

export function AdaptiveImage({
  src,
  alt = "",
  maxHeightClass = "max-h-32",
  className,
  onError,
}: {
  src: string;
  alt?: string;
  maxHeightClass?: string;
  className?: string;
  onError?: () => void;
}) {
  return (
    <img
      src={src}
      alt={alt}
      onError={onError}
      className={cn(
        "block w-full h-auto rounded border object-contain bg-muted",
        maxHeightClass,
        className,
      )}
    />
  );
}
