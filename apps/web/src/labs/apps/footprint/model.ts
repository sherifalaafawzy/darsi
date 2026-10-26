/**
 * Digital footprint: a made-up pupil's public posts. Each looks harmless alone; together they tell a stranger her
 * school, birthday, route home, pet's name (a common password hint), phone number and when the house is empty.
 */
export type Fact = "school" | "birthday" | "route" | "pet" | "phone" | "away";
export interface Post { id: string; reveals: Fact[]; en: string; ar: string }

export const POSTS: Post[] = [
  { id: "first", reveals: ["school"], en: "First day at Al-Amal Secondary! Class 9B is the best.", ar: "أول يوم في ثانوية الأمل! الصف التاسع (ب) هو الأفضل." },
  { id: "bday", reveals: ["birthday"], en: "Happy 14th birthday to me! 12 March.", ar: "عيد ميلادي الرابع عشر! ١٢ مارس." },
  { id: "walk", reveals: ["route"], en: "Walking home past the big mosque on Nile Street, same time every day.", ar: "أمشي إلى البيت مرورًا بالمسجد الكبير في شارع النيل، في الوقت نفسه كل يوم." },
  { id: "cat", reveals: ["pet"], en: "My cat Mishmish is the cutest in the world.", ar: "قطتي مشمش أجمل قطة في العالم." },
  { id: "bag", reveals: ["phone"], en: "Lost my school bag! If you find it call me: 0100 000 0000.", ar: "ضاعت حقيبتي المدرسية! إن وجدتها فاتصل بي: 0100 000 0000." },
  { id: "trip", reveals: ["away"], en: "Whole family off to grandma's village for a week!", ar: "العائلة كلها مسافرة إلى قرية جدتي لمدة أسبوع!" },
];
export type Audience = "public" | "friends" | "deleted";
/** What a stranger can learn from the posts still public. */
export const known = (aud: Record<string, Audience>) => [...new Set(POSTS.filter((p) => (aud[p.id] ?? "public") === "public").flatMap((p) => p.reveals))];
