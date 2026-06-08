export default function AssetsLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground" />
        <p className="text-sm text-muted-foreground">加载素材库...</p>
      </div>
    </div>
  );
}
