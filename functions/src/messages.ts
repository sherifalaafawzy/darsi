/**
 * Push notification wording, in English and Arabic, plus French, Spanish, German, Portuguese and Urdu (MORE).
 * Pure: no Firebase imports, so it is unit-tested directly.
 * Tone: "Encourage, never punish". No guilt, no threats, no emoji; Arabic and Urdu never use "·".
 * A phone set to another language platform admins added gets the English wording.
 */
import { LANG_CODE } from "./shared/languages.js";

/** A device's language: English, Arabic, or one platform admins added ("fr", "pt-br"). */
export type Lang = string;
/** The wording a device gets: its own language when there is wording for it, else English. */
export const wordingFor = (lang: Lang): Lang => (lang === "ar" || lang in MORE ? lang : "en");
/** A language code that may go into a topic name; anything else counts as English. */
export const topicLang = (lang: unknown): Lang => (typeof lang === "string" && LANG_CODE.test(lang) ? lang : "en");
export type Cat = "reminders" | "reviews" | "staff" | "news";
export type Kind =
  | "daily0" | "daily1" | "daily2" | "weekGoal" | "streak" | "comeback7" | "comeback21"
  | "reviewApproved" | "reviewRevise" | "orgApproved" | "orgRejected" | "staffSubmission" | "staffOrgRequest"
  | "ssoSecretExpiring" | "ssoEndpointsMoved" | "ssoFull";

/** Values a message can fill in. `name` and `org` are isolated; `uid` and `orgId` only build links. */
export interface MessageVars { n?: number; name?: string; org?: string; feedback?: string; uid?: string; orgId?: string }
export interface Text { title: string; body: string }

/** Unicode first-strong isolate: keeps a Latin name from reordering an Arabic sentence, and the other way round. */
export const isolate = (s: string) => `⁨${s}⁩`;
export const formatNumber = (n: number, lang: Lang) => new Intl.NumberFormat(lang === "ar" ? "ar-EG" : lang in MORE ? lang : "en").format(n);
export const dirOf = (lang: Lang) => (["ar", "ur", "fa", "he", "ps", "sd", "ckb", "ug", "yi"].includes(lang.split("-")[0]) ? "rtl" : "ltr");
export const FEEDBACK_MAX = 140;

/** Reviewer feedback as a notification body: whitespace collapsed, at most 140 characters including the ellipsis. */
export function trimFeedback(s: unknown, max = FEEDBACK_MAX): string {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  const chars = Array.from(t); // code points, so a surrogate pair is never cut in half
  return chars.length <= max ? t : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

type Fill = (v: MessageVars, lang: Lang) => string;
const fixed = (s: string): Fill => () => s;
const num = (v: MessageVars, lang: Lang) => formatNumber(Math.max(0, Math.round(v.n ?? 0)), lang);
const daysLeft = (v: MessageVars) => Math.max(0, Math.round(v.n ?? 0));
const name = (v: MessageVars) => isolate((v.name ?? "").trim() || "—");
const org = (v: MessageVars) => isolate((v.org ?? "").trim() || "—");
const feedbackOr = (fallback: string): Fill => (v) => trimFeedback(v.feedback) || fallback;

interface Entry { cat: Cat; link: string; en: { title: Fill; body: Fill }; ar: { title: Fill; body: Fill } }

/** The full catalogue. `link` may hold {uid}, filled from vars. */
export const CATALOGUE: Record<Kind, Entry> = {
  daily0: {
    cat: "reminders", link: "/learn",
    en: { title: fixed("Your 5-minute lesson is ready"), body: fixed("One short lesson today, one new idea for your class tomorrow.") },
    ar: { title: fixed("درسك ذو الدقائق الخمس جاهز"), body: fixed("درس قصير اليوم، وفكرة جديدة لفصلك غدًا.") },
  },
  daily1: {
    cat: "reminders", link: "/learn",
    en: { title: fixed("Five minutes for you?"), body: fixed("Pick up where you left off. It only takes five minutes.") },
    ar: { title: fixed("خمس دقائق لك اليوم؟"), body: fixed("تابع من حيث توقفت، فالأمر لا يستغرق سوى خمس دقائق.") },
  },
  daily2: {
    cat: "reminders", link: "/learn",
    en: { title: fixed("Something new for your class"), body: fixed("Today's lesson ends with an idea you can try tomorrow.") },
    ar: { title: fixed("شيء جديد لفصلك"), body: fixed("ينتهي درس اليوم بفكرة يمكنك تجربتها غدًا.") },
  },
  weekGoal: {
    cat: "reminders", link: "/learn",
    en: {
      title: (v, l) => (Math.round(v.n ?? 0) === 1 ? "1 lesson left for this week's goal" : `${num(v, l)} lessons left for this week's goal`),
      body: fixed("You're close. A short lesson now keeps you on track."),
    },
    ar: { title: (v, l) => `دروس متبقية لهدف هذا الأسبوع: ${num(v, l)}`, body: fixed("أنت قريب. درس قصير الآن يُبقيك على المسار.") },
  },
  streak: {
    cat: "reminders", link: "/learn",
    en: { title: (v, l) => `Your streak: ${num(v, l)} weeks`, body: fixed("You've learned every week lately. One lesson keeps it going.") },
    ar: { title: (v, l) => `سلسلة الأسابيع: ${num(v, l)}`, body: fixed("تعلّمت في كل أسبوع مؤخرًا. درس واحد يُبقي السلسلة مستمرة.") },
  },
  comeback7: {
    cat: "reminders", link: "/learn",
    en: { title: fixed("We saved your place"), body: fixed("Your next lesson is waiting, and it takes five minutes.") },
    ar: { title: fixed("حفظنا مكانك"), body: fixed("درسك التالي بانتظارك، ولا يستغرق سوى خمس دقائق.") },
  },
  comeback21: {
    cat: "reminders", link: "/learn",
    en: { title: fixed("New ideas for your classroom"), body: fixed("Come back for a 5-minute lesson whenever you're ready.") },
    ar: { title: fixed("أفكار جديدة لفصلك"), body: fixed("عُد لدرس من خمس دقائق متى كنت مستعدًا.") },
  },
  reviewApproved: {
    cat: "reviews", link: "/me#projects",
    en: { title: fixed("Your project was approved"), body: feedbackOr("Well done, your project was approved.") },
    ar: { title: fixed("تمت الموافقة على مشروعك"), body: feedbackOr("أحسنت، تمت الموافقة على مشروعك.") },
  },
  reviewRevise: {
    cat: "reviews", link: "/me#projects",
    en: { title: fixed("Feedback on your project"), body: feedbackOr("Your reviewer suggested a few changes.") },
    ar: { title: fixed("ملاحظات على مشروعك"), body: feedbackOr("اقترح المراجِع بعض التعديلات.") },
  },
  // Whoever asked to register an organization hears the outcome (reviewOrg); the rejection carries the reviewer's note.
  orgApproved: {
    cat: "reviews", link: "/admin",
    en: { title: fixed("Your organization is approved"), body: (v) => `${org(v)} is now on Darsi. Add your teachers and students from Admin.` },
    ar: { title: fixed("تمت الموافقة على مؤسستك"), body: (v) => `أصبحت ${org(v)} في «درسي». أضف معلميك وطلابك من «الإدارة».` },
  },
  orgRejected: {
    cat: "reviews", link: "/org",
    en: { title: fixed("About your organization request"), body: feedbackOr("Open Darsi to read the reply.") },
    ar: { title: fixed("بخصوص طلب مؤسستك"), body: feedbackOr("افتح «درسي» لقراءة الرد.") },
  },
  staffSubmission: {
    cat: "staff", link: "/teach/{uid}?tab=projects",
    en: { title: fixed("New project to review"), body: (v) => `${name(v)} sent a project for review.` },
    ar: { title: fixed("مشروع جديد للمراجعة"), body: (v) => `وصل مشروع جديد من ${name(v)} للمراجعة.` },
  },
  staffOrgRequest: {
    cat: "staff", link: "/super",
    en: { title: fixed("New organization request"), body: (v) => `${org(v)} asked to join Darsi.` },
    ar: { title: fixed("طلب مؤسسة جديد"), body: (v) => `طلبت ${org(v)} الانضمام إلى «درسي».` },
  },
  // School sign-in (sso.ts ssoJob). The first two go to the organization's admins, the third to platform admins.
  // `n` is the days left; Arabic gives it as a count after a colon, so it needs no plural form.
  ssoSecretExpiring: {
    cat: "staff", link: "/admin?tab=signin",
    en: {
      title: fixed("School sign-in: the client secret runs out soon"),
      body: (v, l) => {
        const days = daysLeft(v);
        const when = days === 0 ? "today" : days === 1 ? "in 1 day" : `in ${num(v, l)} days`;
        return `The client secret for ${org(v)} runs out ${when}. Make a new one and save it in Admin.`;
      },
    },
    ar: {
      title: fixed("تسجيل الدخول عبر المدرسة: سر العميل ينتهي قريبًا"),
      body: (v, l) => (daysLeft(v) === 0
        ? `ينتهي سر العميل لدى ${org(v)} اليوم. أنشئ سرًا جديدًا واحفظه من «الإدارة».`
        : `الأيام المتبقية على انتهاء سر العميل لدى ${org(v)}: ${num(v, l)}. أنشئ سرًا جديدًا واحفظه من «الإدارة».`),
    },
  },
  ssoEndpointsMoved: {
    cat: "staff", link: "/admin?tab=signin",
    en: { title: fixed("School sign-in needs a new test"), body: (v) => `The provider's addresses changed for ${org(v)}. Test the sign-in again before people are affected.` },
    ar: { title: fixed("تسجيل الدخول عبر المدرسة يحتاج إلى اختبار جديد"), body: (v) => `تغيّرت عناوين المزوّد لدى ${org(v)}. اختبر تسجيل الدخول مرة أخرى قبل أن يتأثر الأشخاص.` },
  },
  ssoFull: {
    cat: "staff", link: "/super/orgs/{orgId}?tab=signin",
    en: { title: fixed("A school reached its member limit"), body: (v) => `${org(v)} reached the number of members school sign-in may make. New people can't join until the limit is raised.` },
    ar: { title: fixed("مدرسة بلغت الحد الأقصى لأعضائها"), body: (v) => `بلغت ${org(v)} عدد الأعضاء الذي يمكن لتسجيل الدخول عبر المدرسة إنشاؤه. لن ينضم أشخاص جدد حتى يُرفع الحد.` },
  },
};

export const KINDS = Object.keys(CATALOGUE) as Kind[];
export const catOf = (kind: Kind): Cat => CATALOGUE[kind].cat;

/** Title and body for one kind in one language, with the vars filled in. */
export function message(kind: Kind, lang: Lang, vars: MessageVars = {}): Text {
  const e = MORE[lang]?.[kind] ?? CATALOGUE[kind][lang === "ar" ? "ar" : "en"];
  return { title: e.title(vars, lang), body: e.body(vars, lang) };
}

/* ---------- The languages platform admins added (content/i18n/<code>.json) ---------- */

type Wording = { title: Fill; body: Fill };
const w = (title: Fill | string, body: Fill | string): Wording => ({ title: typeof title === "string" ? fixed(title) : title, body: typeof body === "string" ? fixed(body) : body });
const one = (v: MessageVars) => Math.round(v.n ?? 0) === 1;
const NB = "\u00A0"; // French: a no-break space before ? : ! ;

/** Same kinds as CATALOGUE, in the same tone. Feedback from a reviewer is shown as written. */
export const MORE: Record<string, Record<Kind, Wording>> = {
  fr: {
    daily0: w("Votre leçon de 5 minutes est prête", "Une courte leçon aujourd’hui, une idée nouvelle pour votre classe demain."),
    daily1: w(`Cinq minutes pour vous${NB}?`, "Reprenez là où vous en étiez. Cela ne prend que cinq minutes."),
    daily2: w("Du nouveau pour votre classe", "La leçon du jour se termine par une idée à essayer demain."),
    weekGoal: w((v, l) => (one(v) ? "Plus qu’une leçon pour l’objectif de la semaine" : `Plus que ${num(v, l)} leçons pour l’objectif de la semaine`), "Vous y êtes presque. Une courte leçon maintenant vous garde sur la bonne voie."),
    streak: w((v, l) => `Votre série${NB}: ${num(v, l)} ${one(v) ? "semaine" : "semaines"}`, "Vous avez appris chaque semaine ces derniers temps. Une leçon suffit pour continuer."),
    comeback7: w("Nous avons gardé votre place", "Votre prochaine leçon vous attend, et elle ne prend que cinq minutes."),
    comeback21: w("De nouvelles idées pour votre classe", "Revenez pour une leçon de 5 minutes quand vous le souhaitez."),
    reviewApproved: w("Votre projet a été approuvé", feedbackOr("Bravo, votre projet a été approuvé.")),
    reviewRevise: w("Des retours sur votre projet", feedbackOr("La personne qui a relu votre projet propose quelques changements.")),
    staffSubmission: w("Nouveau projet à relire", (v) => `${name(v)} a envoyé un projet à relire.`),
    staffOrgRequest: w("Nouvelle demande d’organisation", (v) => `${org(v)} souhaite rejoindre Darsi.`),
    orgApproved: w("Votre organisation est approuvée", (v) => `${org(v)} est maintenant sur Darsi. Ajoutez vos enseignants et vos élèves depuis Admin.`),
    orgRejected: w("À propos de votre demande d’organisation", feedbackOr("Ouvrez Darsi pour lire la réponse.")),
    ssoSecretExpiring: w(`Connexion via l’école${NB}: le secret client expire bientôt`, (v, l) => { const d = daysLeft(v); return `Le secret client de ${org(v)} expire ${d === 0 ? "aujourd’hui" : d === 1 ? "dans 1 jour" : `dans ${num(v, l)} jours`}. Créez-en un nouveau et enregistrez-le dans Admin.`; }),
    ssoEndpointsMoved: w("La connexion via l’école doit être testée à nouveau", (v) => `Les adresses du fournisseur ont changé pour ${org(v)}. Testez à nouveau la connexion avant que des personnes ne soient touchées.`),
    ssoFull: w("Une école a atteint sa limite de membres", (v) => `${org(v)} a atteint le nombre de membres que la connexion via l’école peut créer. Les nouvelles personnes ne pourront pas rejoindre l’école tant que la limite n’est pas relevée.`),
  },
  es: {
    daily0: w("Tu lección de 5 minutos está lista", "Una lección corta hoy, una idea nueva para tu clase mañana."),
    daily1: w("¿Cinco minutos para ti?", "Sigue donde lo dejaste. Solo toma cinco minutos."),
    daily2: w("Algo nuevo para tu clase", "La lección de hoy termina con una idea que puedes probar mañana."),
    weekGoal: w((v, l) => (one(v) ? "Te falta 1 lección para la meta de esta semana" : `Te faltan ${num(v, l)} lecciones para la meta de esta semana`), "Estás cerca. Una lección corta ahora te mantiene en camino."),
    streak: w((v, l) => `Tu racha: ${num(v, l)} ${one(v) ? "semana" : "semanas"}`, "Últimamente has aprendido cada semana. Una lección la mantiene viva."),
    comeback7: w("Guardamos tu lugar", "Tu próxima lección te espera, y solo toma cinco minutos."),
    comeback21: w("Ideas nuevas para tu clase", "Vuelve para una lección de 5 minutos cuando quieras."),
    reviewApproved: w("Tu proyecto fue aprobado", feedbackOr("¡Bien hecho! Tu proyecto fue aprobado.")),
    reviewRevise: w("Comentarios sobre tu proyecto", feedbackOr("Quien revisó tu proyecto sugirió algunos cambios.")),
    staffSubmission: w("Nuevo proyecto para revisar", (v) => `${name(v)} envió un proyecto para revisar.`),
    staffOrgRequest: w("Nueva solicitud de organización", (v) => `${org(v)} pidió unirse a Darsi.`),
    orgApproved: w("Tu organización fue aprobada", (v) => `${org(v)} ya está en Darsi. Agrega a tus docentes y estudiantes desde Admin.`),
    orgRejected: w("Sobre tu solicitud de organización", feedbackOr("Abre Darsi para leer la respuesta.")),
    ssoSecretExpiring: w("Inicio de sesión con la escuela: el secreto de cliente vence pronto", (v, l) => { const d = daysLeft(v); return `El secreto de cliente de ${org(v)} vence ${d === 0 ? "hoy" : d === 1 ? "en 1 día" : `en ${num(v, l)} días`}. Crea uno nuevo y guárdalo en Admin.`; }),
    ssoEndpointsMoved: w("El inicio de sesión con la escuela necesita una nueva prueba", (v) => `Las direcciones del proveedor cambiaron para ${org(v)}. Vuelve a probar el inicio de sesión antes de que afecte a las personas.`),
    ssoFull: w("Una escuela alcanzó su límite de miembros", (v) => `${org(v)} alcanzó el número de miembros que puede crear el inicio de sesión con la escuela. Las personas nuevas no podrán unirse hasta que se suba el límite.`),
  },
  de: {
    daily0: w("Deine 5-Minuten-Lektion ist bereit", "Heute eine kurze Lektion, morgen eine neue Idee für deine Klasse."),
    daily1: w("Fünf Minuten für dich?", "Mach da weiter, wo du aufgehört hast. Es dauert nur fünf Minuten."),
    daily2: w("Etwas Neues für deine Klasse", "Die heutige Lektion endet mit einer Idee, die du morgen ausprobieren kannst."),
    weekGoal: w((v, l) => (one(v) ? "Noch 1 Lektion bis zu deinem Wochenziel" : `Noch ${num(v, l)} Lektionen bis zu deinem Wochenziel`), "Du bist nah dran. Eine kurze Lektion jetzt hält dich auf Kurs."),
    streak: w((v, l) => `Deine Serie: ${num(v, l)} ${one(v) ? "Woche" : "Wochen"}`, "Du hast zuletzt jede Woche gelernt. Eine Lektion hält die Serie am Laufen."),
    comeback7: w("Wir haben deinen Platz gemerkt", "Deine nächste Lektion wartet auf dich und dauert nur fünf Minuten."),
    comeback21: w("Neue Ideen für deine Klasse", "Komm für eine 5-Minuten-Lektion zurück, wann immer du magst."),
    reviewApproved: w("Dein Projekt wurde angenommen", feedbackOr("Gut gemacht, dein Projekt wurde angenommen.")),
    reviewRevise: w("Rückmeldung zu deinem Projekt", feedbackOr("Die Person, die dein Projekt geprüft hat, schlägt ein paar Änderungen vor.")),
    staffSubmission: w("Neues Projekt zur Durchsicht", (v) => `${name(v)} hat ein Projekt zur Durchsicht geschickt.`),
    staffOrgRequest: w("Neue Anfrage einer Organisation", (v) => `${org(v)} möchte Darsi beitreten.`),
    orgApproved: w("Deine Organisation wurde freigeschaltet", (v) => `${org(v)} ist jetzt bei Darsi. Füge deine Lehrkräfte und Lernenden unter Admin hinzu.`),
    orgRejected: w("Zu deiner Anfrage für eine Organisation", feedbackOr("Öffne Darsi, um die Antwort zu lesen.")),
    ssoSecretExpiring: w("Anmeldung über die Schule: Das Client-Secret läuft bald ab", (v, l) => { const d = daysLeft(v); return `Das Client-Secret von ${org(v)} läuft ${d === 0 ? "heute" : d === 1 ? "in 1 Tag" : `in ${num(v, l)} Tagen`} ab. Erstelle ein neues und speichere es unter Admin.`; }),
    ssoEndpointsMoved: w("Die Anmeldung über die Schule muss neu getestet werden", (v) => `Die Adressen des Anbieters haben sich für ${org(v)} geändert. Teste die Anmeldung erneut, bevor jemand betroffen ist.`),
    ssoFull: w("Eine Schule hat ihr Mitgliederlimit erreicht", (v) => `${org(v)} hat die Zahl an Mitgliedern erreicht, die die Anmeldung über die Schule anlegen darf. Neue Personen können erst beitreten, wenn das Limit erhöht wird.`),
  },
  pt: {
    daily0: w("Sua lição de 5 minutos está pronta", "Uma lição curta hoje, uma ideia nova para sua turma amanhã."),
    daily1: w("Cinco minutos para você?", "Continue de onde parou. Leva só cinco minutos."),
    daily2: w("Algo novo para sua turma", "A lição de hoje termina com uma ideia que você pode testar amanhã."),
    weekGoal: w((v, l) => (one(v) ? "Falta 1 lição para a meta desta semana" : `Faltam ${num(v, l)} lições para a meta desta semana`), "Você está perto. Uma lição curta agora mantém você no caminho."),
    streak: w((v, l) => `Sua sequência: ${num(v, l)} ${one(v) ? "semana" : "semanas"}`, "Você aprendeu toda semana ultimamente. Uma lição mantém a sequência."),
    comeback7: w("Guardamos o seu lugar", "Sua próxima lição está esperando, e leva só cinco minutos."),
    comeback21: w("Novas ideias para sua turma", "Volte para uma lição de 5 minutos quando quiser."),
    reviewApproved: w("Seu projeto foi aprovado", feedbackOr("Muito bem, seu projeto foi aprovado.")),
    reviewRevise: w("Comentários sobre seu projeto", feedbackOr("Quem revisou seu projeto sugeriu algumas mudanças.")),
    staffSubmission: w("Novo projeto para revisar", (v) => `${name(v)} enviou um projeto para revisão.`),
    staffOrgRequest: w("Nova solicitação de organização", (v) => `${org(v)} pediu para entrar no Darsi.`),
    orgApproved: w("Sua organização foi aprovada", (v) => `${org(v)} já está no Darsi. Adicione seus professores e estudantes em Admin.`),
    orgRejected: w("Sobre a sua solicitação de organização", feedbackOr("Abra o Darsi para ler a resposta.")),
    ssoSecretExpiring: w("Login pela escola: o segredo do cliente expira em breve", (v, l) => { const d = daysLeft(v); return `O segredo do cliente de ${org(v)} expira ${d === 0 ? "hoje" : d === 1 ? "em 1 dia" : `em ${num(v, l)} dias`}. Crie um novo e salve-o em Admin.`; }),
    ssoEndpointsMoved: w("O login pela escola precisa de um novo teste", (v) => `Os endereços do provedor mudaram para ${org(v)}. Teste o login de novo antes que as pessoas sejam afetadas.`),
    ssoFull: w("Uma escola atingiu o limite de membros", (v) => `${org(v)} atingiu o número de membros que o login pela escola pode criar. Novas pessoas não poderão entrar até que o limite seja aumentado.`),
  },
  ur: {
    daily0: w("آپ کا 5 منٹ کا سبق تیار ہے", "آج ایک مختصر سبق، کل آپ کی کلاس کے لیے ایک نیا خیال۔"),
    daily1: w("آپ کے لیے پانچ منٹ؟", "جہاں چھوڑا تھا وہیں سے جاری رکھیں۔ اس میں صرف پانچ منٹ لگتے ہیں۔"),
    daily2: w("آپ کی کلاس کے لیے کچھ نیا", "آج کا سبق ایک ایسے خیال پر ختم ہوتا ہے جسے آپ کل آزما سکتے ہیں۔"),
    weekGoal: w((v, l) => `اس ہفتے کے ہدف کے لیے ${num(v, l)} سبق باقی ہیں`, "آپ قریب ہیں۔ ابھی ایک مختصر سبق آپ کو راستے پر رکھے گا۔"),
    streak: w((v, l) => `آپ کا سلسلہ: ${num(v, l)} ہفتے`, "حال میں آپ نے ہر ہفتے سیکھا ہے۔ ایک سبق اسے جاری رکھتا ہے۔"),
    comeback7: w("ہم نے آپ کی جگہ محفوظ رکھی ہے", "آپ کا اگلا سبق آپ کا منتظر ہے، اور اس میں صرف پانچ منٹ لگتے ہیں۔"),
    comeback21: w("آپ کی کلاس کے لیے نئے خیالات", "جب بھی آپ تیار ہوں، 5 منٹ کے سبق کے لیے واپس آئیں۔"),
    reviewApproved: w("آپ کا پروجیکٹ منظور ہو گیا", feedbackOr("شاباش، آپ کا پروجیکٹ منظور ہو گیا۔")),
    reviewRevise: w("آپ کے پروجیکٹ پر رائے", feedbackOr("جائزہ لینے والے نے کچھ تبدیلیاں تجویز کی ہیں۔")),
    staffSubmission: w("جائزے کے لیے نیا پروجیکٹ", (v) => `${name(v)} نے جائزے کے لیے ایک پروجیکٹ بھیجا ہے۔`),
    staffOrgRequest: w("تنظیم کی نئی درخواست", (v) => `${org(v)} نے «درسی» میں شامل ہونے کی درخواست کی ہے۔`),
    orgApproved: w("آپ کا ادارہ منظور ہو گیا", (v) => `${org(v)} اب «درسی» پر ہے۔ ایڈمن سے اپنے اساتذہ اور طلبہ شامل کریں۔`),
    orgRejected: w("آپ کے ادارے کی درخواست کے بارے میں", feedbackOr("جواب پڑھنے کے لیے «درسی» کھولیں۔")),
    ssoSecretExpiring: w("اسکول کے ذریعے سائن ان: کلائنٹ سیکرٹ جلد ختم ہو رہا ہے", (v, l) => (daysLeft(v) === 0 ? `${org(v)} کا کلائنٹ سیکرٹ آج ختم ہو رہا ہے۔ نیا بنائیں اور اسے ایڈمن میں محفوظ کریں۔` : `${org(v)} کے کلائنٹ سیکرٹ کے ختم ہونے میں باقی دن: ${num(v, l)}۔ نیا بنائیں اور اسے ایڈمن میں محفوظ کریں۔`)),
    ssoEndpointsMoved: w("اسکول کے ذریعے سائن ان کو دوبارہ جانچنا ہے", (v) => `${org(v)} کے لیے فراہم کنندہ کے پتے بدل گئے ہیں۔ لوگوں کے متاثر ہونے سے پہلے سائن ان دوبارہ جانچیں۔`),
    ssoFull: w("ایک اسکول اپنے ارکان کی حد تک پہنچ گیا", (v) => `${org(v)} اتنے ارکان تک پہنچ گیا ہے جتنے اسکول کے ذریعے سائن ان بنا سکتا ہے۔ حد بڑھائے جانے تک نئے لوگ شامل نہیں ہو سکتے۔`),
  },
};

/**
 * The default app path for a kind ("/teach/{uid}" becomes "/teach/abc"). Without the organization's id,
 * "/super/orgs/{orgId}?tab=signin" opens the list of organizations instead.
 */
export function linkFor(kind: Kind, vars: MessageVars = {}): string {
  const link = CATALOGUE[kind].link.replace("{uid}", encodeURIComponent(vars.uid ?? ""));
  if (!link.includes("{orgId}")) return link;
  const orgId = (vars.orgId ?? "").trim();
  return orgId ? link.replace("{orgId}", encodeURIComponent(orgId)) : link.slice(0, link.indexOf("/{orgId}"));
}

/**
 * Where "New project to review" opens: the person's page on its Projects tab, for their teacher (/teach/…) or for
 * the organization's admins (/admin/people/…). The page opens on Progress without the tab, with no project in sight.
 */
export const projectsLink = (reader: "teacher" | "admin", uid: string): string =>
  `${reader === "teacher" ? "/teach" : "/admin/people"}/${encodeURIComponent(uid)}?tab=projects`;

/** Notification tag: automatic nudges share one so a new one replaces the old. */
export function tagFor(kind: Kind, id?: string): string {
  const cat = catOf(kind);
  if (cat === "reminders") return "darsi-nudge";
  const prefix = cat === "reviews" ? "review" : cat;
  return id ? `darsi-${prefix}-${id}` : `darsi-${prefix}`;
}

export interface PushData { [key: string]: string; title: string; body: string; link: string; tag: string; lang: Lang; dir: "rtl" | "ltr" }

/** Data-only web push, read by public/push-sw.js. Kept small: a day's TTL, normal urgency. */
export function webpush(text: Text, lang: Lang, link: string, tag: string) {
  const data: PushData = { title: text.title, body: text.body, link, tag, lang, dir: dirOf(lang) };
  return { headers: { TTL: "86400", Urgency: "normal" }, data };
}

/* ---------- Announcement topics ---------- */

export type Audience = { type: "all" } | { type: "org"; orgId: string } | { type: "role"; role: "student" | "teacher" | "orgAdmin" };
/** FCM topic names allow [a-zA-Z0-9-_.~%]; ids and roles are checked before they become part of one. */
const TOPIC_PART = /^[A-Za-z0-9_-]{1,128}$/;
const ROLES = ["learner", "student", "teacher", "orgAdmin", "superadmin"];

/** The topics a device should be in. None while announcements (cats.news) are off. */
export function topicsFor(lang: Lang, role: unknown, orgId: unknown, news: boolean): string[] {
  if (!news) return [];
  const r = typeof role === "string" && ROLES.includes(role) ? role : "learner";
  const t = ["all", `lang-${topicLang(lang)}`, `role-${r}`];
  if (typeof orgId === "string" && TOPIC_PART.test(orgId)) t.push(`org-${orgId}`);
  return t;
}

/**
 * One condition per wording: the Arabic text to Arabic phones, the English text to every other phone (English and the
 * languages platform admins added). Every subscribed device is in "all".
 */
export function broadcastCondition(lang: "en" | "ar", audience: Audience): string {
  const base = lang === "ar" ? "'lang-ar' in topics" : "'all' in topics && !('lang-ar' in topics)";
  if (audience.type === "org") return `${base} && 'org-${audience.orgId}' in topics`;
  if (audience.type === "role") return `${base} && 'role-${audience.role}' in topics`;
  return base;
}
export const isTopicPart = (s: string) => TOPIC_PART.test(s);
