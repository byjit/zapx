import { GALLERY_ITEMS } from "@/utils/constant";

export function Gallery() {
  return (
    <section className="">
      <div className="space-y-3">
        {GALLERY_ITEMS.map((item) => (
          <div key={item.src}>
            <p className="text-xs text-muted-foreground mb-1">{item.caption}</p>
            <div className="aspect-video relative">
              {item.type === "image" ? (
                <img
                  alt={item.alt}
                  className="w-full h-full object-cover rounded-lg"
                  src={item.src}
                />
              ) : (
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full rounded-lg"
                  height="100%"
                  src={item.src}
                  title={item.title || "Video"}
                  width="100%"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
