import { useState } from "react";

export function YoutubePlayer({
  videoId,
  thumbnailImage,
}: {
  videoId: string;
  thumbnailImage: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl shadow-lg">
      {isPlaying ? (
        <div className="relative aspect-video w-full">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen={true}
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            title="Demo"
          />
        </div>
      ) : (
        <button
          aria-label="Play demo video"
          className="group relative flex aspect-video w-full items-center justify-center"
          onClick={() => setIsPlaying(true)}
          type="button"
        >
          <img
            alt="Demo"
            className="h-full w-full object-cover"
            loading="lazy"
            src={thumbnailImage}
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <svg
              aria-hidden="true"
              className="h-24 w-24 text-black opacity-80 transition-opacity group-hover:opacity-100"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
