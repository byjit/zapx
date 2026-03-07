export const GALLERY_ITEMS: GalleryItem[] = [
  {
    type: "image",
    src: "https://cdn.prod.website-files.com/5fcb3bbf6fdac55b7a345a8e/62596ca7d654fc32acc1224e_glass%20look.png",
    alt: "Glass look",
  },
];
export type GalleryItem = {
  type: "image" | "video";
  src: string;
  alt?: string;
  title?: string;
  caption?: string;
};

export const CONTACT_FORM = "https://tally.so/r/ODQJ2k";
