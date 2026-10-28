/**
 * Spot the scam: messages of the kinds teachers and pupils really get, some genuine, some phishing. Every sender is
 * made up and every link uses the reserved ".example" domain. Each scam carries the warning signs to look for.
 */
export type Clue = "urgent" | "money" | "code" | "link" | "sender" | "prize" | "file" | "password";
export type Channel = "sms" | "chat" | "email";
interface Text { from: string; text: string; link?: string; file?: string }
export interface Msg { id: string; channel: Channel; scam: boolean; clues: Clue[]; en: Text; ar: Text }

export const MESSAGES: Msg[] = [
  { id: "parcel", channel: "sms", scam: true, clues: ["urgent", "money", "link", "sender"],
    en: { from: "+44 7700 900123", text: "Your parcel is waiting. Pay the 1.50 redelivery fee within 24 hours or it will be returned.", link: "http://parcel-redelivery.example/pay" },
    ar: { from: "+44 7700 900123", text: "طردك بانتظارك. ادفع رسوم إعادة التوصيل ١٫٥٠ خلال ٢٤ ساعة وإلا سيُعاد.", link: "http://parcel-redelivery.example/pay" } },
  { id: "meeting", channel: "email", scam: false, clues: [],
    en: { from: "School office <office@school.example>", text: "Reminder: the parents' meeting is on Thursday at 16:00 in the main hall. No reply is needed." },
    ar: { from: "إدارة المدرسة <office@school.example>", text: "تذكير: اجتماع أولياء الأمور يوم الخميس الساعة ١٦:٠٠ في القاعة الرئيسية. لا حاجة إلى الرد." } },
  { id: "head", channel: "chat", scam: true, clues: ["sender", "money", "code", "urgent"],
    en: { from: "Head teacher (new number)", text: "Hello, it's Mrs Amal. I lost my phone, this is my new number. Please buy three phone credit cards for the school event and send me the codes now. I'll pay you back tomorrow." },
    ar: { from: "المديرة (رقم جديد)", text: "مرحبًا، أنا الأستاذة أمل. ضاع هاتفي وهذا رقمي الجديد. من فضلك اشترِ ثلاث بطاقات شحن لفعالية المدرسة وأرسل لي أرقامها الآن، وسأعيد لك المال غدًا." } },
  { id: "code", channel: "sms", scam: false, clues: [],
    en: { from: "SchoolPortal", text: "Your sign-in code is 482193. Don't share it with anyone. We will never ask you for it." },
    ar: { from: "SchoolPortal", text: "رمز دخولك هو ٤٨٢١٩٣. لا تشاركه مع أحد. لن نطلبه منك أبدًا." } },
  { id: "security", channel: "email", scam: true, clues: ["urgent", "password", "link", "sender"],
    en: { from: "Security Team <security@portal-verify.example>", text: "We detected an unusual sign-in. Your account will be closed today unless you confirm your password.", link: "http://portal-verify.example/login" },
    ar: { from: "فريق الأمان <security@portal-verify.example>", text: "رصدنا دخولًا غير معتاد. سيُغلق حسابك اليوم ما لم تؤكّد كلمة مرورك.", link: "http://portal-verify.example/login" } },
  { id: "photo", channel: "chat", scam: true, clues: ["file"],
    en: { from: "Cousin Karim", text: "Is this you in the wedding photos?", file: "wedding_photo.apk" },
    ar: { from: "ابن العم كريم", text: "هل هذا أنت في صور العرس؟", file: "wedding_photo.apk" } },
  { id: "prize", channel: "sms", scam: true, clues: ["prize", "money", "sender"],
    en: { from: "NATIONAL-DRAW", text: "Congratulations! Your number won 50,000 in the national draw. Send your ID number and bank card details to claim your prize." },
    ar: { from: "NATIONAL-DRAW", text: "مبروك! فاز رقمك بـ٥٠٬٠٠٠ في السحب الوطني. أرسل رقم هويتك وبيانات بطاقتك المصرفية لتستلم جائزتك." } },
  { id: "darsi", channel: "email", scam: false, clues: [],
    en: { from: "Darsi <hello@darsiai.org>", text: "Well done: you finished Level 1 of the AI track. Your certificate is in the app, under Me." },
    ar: { from: "درسي <hello@darsiai.org>", text: "أحسنت: أنهيت المستوى الأول من مسار الذكاء الاصطناعي. شهادتك في التطبيق، في قسم «حسابي»." } },
];

export const score = (answers: Record<string, boolean>) => MESSAGES.filter((m) => answers[m.id] === m.scam).length;
