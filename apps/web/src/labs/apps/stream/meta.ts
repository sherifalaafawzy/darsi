import type { LabMeta } from "../../types";

export const meta: LabMeta = {
  id: "stream", category: "data-pipelines", level: 3, minutes: 7, order: 4,
  title: { en: "Streams and batches", ar: "التدفّق والدفعات" },
  summary: { en: "A river sensor by the school sends a reading every minute. Handle each one as it arrives or in batches, average over a window, and see the flood alert fire early, late or on time.", ar: "مستشعر على النهر بجانب المدرسة يرسل قراءة كل دقيقة. عالج كل قراءة لحظة وصولها أو في دفعات، وخذ المتوسط على نافذة، وانظر إنذار الفيضان يأتي مبكرًا أو متأخرًا أو في وقته." },
};
