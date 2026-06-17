import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const TESTIMONIAL_IDS = ["matej", "sara", "luka"] as const;

function useFadeInOnScroll<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  visible: boolean;
} {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function StarRating() {
  return (
    <div className="text-base tracking-wider text-amber-400" aria-label="5 out of 5 stars">
      ★★★★★
    </div>
  );
}

function TestimonialCard({
  quote,
  author,
  visible,
  delayMs,
}: {
  quote: string;
  author: string;
  visible: boolean;
  delayMs: number;
}) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border border-white/20 bg-white/10 p-6 shadow-lg backdrop-blur-md transition-all duration-700 ease-out sm:p-7",
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
      )}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      <StarRating />
      <blockquote className="mt-4 flex-1 text-base leading-relaxed text-white italic sm:text-[17px]">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <footer className="mt-5 text-sm text-white/70">{author}</footer>
    </article>
  );
}

export function TestimonialsSection() {
  const { t } = useI18n();
  const { ref, visible } = useFadeInOnScroll<HTMLElement>();

  return (
    <section
      ref={ref}
      className="relative overflow-hidden border-b border-white/10 bg-slate-950"
      aria-labelledby="testimonials-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-950 to-slate-950"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-6 py-12 sm:py-14">
        <h2
          id="testimonials-heading"
          className={cn(
            "text-center text-2xl font-bold text-white transition-all duration-700 sm:text-3xl",
            visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
        >
          {t("testimonials.title" as never)}
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
          {TESTIMONIAL_IDS.map((id, index) => (
            <TestimonialCard
              key={id}
              quote={t(`testimonials.${id}.quote` as never)}
              author={t(`testimonials.${id}.author` as never)}
              visible={visible}
              delayMs={120 + index * 100}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
