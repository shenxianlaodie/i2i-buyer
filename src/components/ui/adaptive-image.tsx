import { cn } from "@/lib/utils";

export function AdaptiveImage({
  src,
  alt = "",
  maxHeightClass = "max-h-32",
  className,
}: {
  src: string;
  alt?: string;
  maxHeightClass?: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        "block w-full h-auto rounded border object-contain bg-muted",
        maxHeightClass,
        className,
      )}
    />
  );
}
