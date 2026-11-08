"use client";

import Image from "next/image";
import { motion } from "framer-motion";

interface GalleryImage {
  src: string;
  caption: string;
}

interface ProductGalleryProps {
  title: string;
  description?: string;
  images: GalleryImage[];
  tone?: "default" | "muted";
}

export default function ProductGallery({ title, description, images, tone = "default" }: ProductGalleryProps) {
  return (
    <section id="gallery" className={`py-24 sm:py-32 relative ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mb-14"
        >
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">{title}</h2>
          {description && <p className="text-lg leading-8 text-muted-foreground">{description}</p>}
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {images.map((image, i) => (
            <motion.div
              key={image.caption}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group relative rounded-2xl overflow-hidden border border-border/50 shadow-sm"
            >
              <div className="relative h-56 overflow-hidden">
                <Image
                  src={image.src}
                  alt={image.caption}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover scale-100 group-hover:scale-110 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"></div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <span className="text-sm font-semibold text-white">{image.caption}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
