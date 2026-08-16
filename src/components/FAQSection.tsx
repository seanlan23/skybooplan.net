import { useMemo } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useI18n } from "@/lib/i18n";

type FaqItem = { id: string; emoji: string; question: string; answer: string };

export function FAQSection() {
  const { t } = useI18n();

  const items = useMemo<FaqItem[]>(
    () => [
      { id: "what", emoji: "✈️", question: t("faq.what.q" as never), answer: t("faq.what.a" as never) },
      { id: "free", emoji: "🎁", question: t("faq.free.q" as never), answer: t("faq.free.a" as never) },
      { id: "how", emoji: "🤖", question: t("faq.how.q" as never), answer: t("faq.how.a" as never) },
      { id: "pdf", emoji: "📄", question: t("faq.pdf.q" as never), answer: t("faq.pdf.a" as never) },
      { id: "flights", emoji: "🔍", question: t("faq.flights.q" as never), answer: t("faq.flights.a" as never) },
    ],
    [t],
  );

  return (
    <section className="bg-background py-14 sm:py-16" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-[720px] px-6">
        <h2 id="faq-heading" className="text-center text-2xl font-bold text-foreground sm:text-3xl">
          {t("faq.title" as never)}
        </h2>

        <Accordion type="single" collapsible defaultValue="free" className="mt-8 w-full">
          {items.map(({ id, emoji, question, answer }) => (
            <AccordionItem key={id} value={id} className="border-border">
              <AccordionTrigger className="py-4 text-left text-base font-semibold hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="shrink-0 text-lg leading-none sm:text-xl" aria-hidden>
                    {emoji}
                  </span>
                  <span>{question}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                {answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
