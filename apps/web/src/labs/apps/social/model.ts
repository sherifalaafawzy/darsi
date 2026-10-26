/**
 * Social engineering: a phone call from "IT support". The story branches on what the learner says. Each caller line
 * carries the manipulation tricks it uses; the safe endings all come from refusing to share and checking another way.
 */
export type Flag = "unknown" | "authority" | "urgency" | "secret" | "fear";
type Text = { en: string; ar: string };
export interface Choice { to: StepId; good: boolean; say: Text }
export type StepId = "start" | "user" | "pressure" | "callback" | "hangup" | "refuse" | "lost";
export interface Step { caller?: Text; flags: Flag[]; choices: Choice[]; end?: "safe" | "lost"; outcome?: Text }

export const STEPS: Record<StepId, Step> = {
  start: {
    caller: { en: "Hello, this is Sami from the Ministry's IT support. We've found a virus on your school's network. I need your portal username to check your account, quickly please.", ar: "مرحبًا، معك سامي من الدعم الفني في الوزارة. وجدنا فيروسًا على شبكة مدرستكم. أحتاج إلى اسم المستخدم في البوابة لأفحص حسابك، بسرعة من فضلك." },
    flags: ["unknown", "authority", "urgency"],
    choices: [
      { to: "user", good: false, say: { en: "Sure, it's amal.hassan.", ar: "طبعًا، إنه amal.hassan." } },
      { to: "callback", good: true, say: { en: "Who exactly are you? I'll call the Ministry back on its official number.", ar: "من أنت بالضبط؟ سأتصل بالوزارة على رقمها الرسمي." } },
      { to: "hangup", good: true, say: { en: "(Hang up.)", ar: "(أغلق الخط.)" } },
    ],
  },
  user: {
    caller: { en: "Thank you. I've just sent a code to your phone by text message. Read it to me so I can confirm it's really you.", ar: "شكرًا لك. أرسلت للتو رمزًا إلى هاتفك في رسالة نصية. اقرأه لي لأتأكد أنك أنت فعلًا." },
    flags: ["secret", "authority"],
    choices: [
      { to: "lost", good: false, say: { en: "It's 482193.", ar: "إنه 482193." } },
      { to: "pressure", good: true, say: { en: "The message says never to share this code. I won't.", ar: "الرسالة تقول ألّا أشارك هذا الرمز أبدًا. لن أفعل." } },
    ],
  },
  pressure: {
    caller: { en: "If you don't give me the code in the next five minutes, your account will be deleted and the school will lose all its data. It will be your fault!", ar: "إن لم تعطني الرمز خلال خمس دقائق فسيُحذف حسابك وستفقد المدرسة كل بياناتها. وسيكون ذلك خطأك!" },
    flags: ["urgency", "fear"],
    choices: [
      { to: "lost", good: false, say: { en: "OK, OK… it's 482193.", ar: "حسنًا، حسنًا… إنه 482193." } },
      { to: "refuse", good: true, say: { en: "No. I'm hanging up and calling the school's IT teacher.", ar: "لا. سأغلق الخط وأتصل بمعلم الحاسوب في المدرسة." } },
    ],
  },
  callback: { flags: [], choices: [], end: "safe", outcome: { en: "The caller says he's busy and hangs up. When you ring the Ministry's official number, they say they never phone teachers about passwords. You report the number.", ar: "يقول المتصل إنه مشغول ويغلق الخط. وحين تتصل بالرقم الرسمي للوزارة يقولون إنهم لا يتصلون بالمعلمين أبدًا بشأن كلمات المرور. فتبلّغ عن الرقم." } },
  hangup: { flags: [], choices: [], end: "safe", outcome: { en: "Safe. Now tell the school's IT teacher, so other staff are warned about this caller.", ar: "أنت في أمان. أخبر الآن معلم الحاسوب في المدرسة حتى يُحذَّر الزملاء الآخرون من هذا المتصل." } },
  refuse: { flags: [], choices: [], end: "safe", outcome: { en: "Safe. They got your username but not the code, so they couldn't get in. The IT teacher warns all staff.", ar: "أنت في أمان. حصلوا على اسم المستخدم لا على الرمز، فلم يستطيعوا الدخول. ويحذّر معلم الحاسوب جميع الزملاء." } },
  lost: { flags: [], choices: [], end: "lost", outcome: { en: "With your code, the caller signed in as you, changed your password and sent fake messages to parents from your account. Tell the IT teacher at once and reset your password.", ar: "بالرمز دخل المتصل باسمك، وغيّر كلمة مرورك، وأرسل رسائل مزيّفة إلى أولياء الأمور من حسابك. أخبر معلم الحاسوب فورًا وأعد تعيين كلمة مرورك." } },
};
