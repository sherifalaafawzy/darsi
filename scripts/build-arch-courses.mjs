// Builds the six university architecture courses in content/units from docs/curriculum/ai-architecture.md,
// and a dev catalog so the local app can show them before they are published.
//   node scripts/build-arch-courses.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const t = (en, ar) => ({ en, ar });
const list = (en, ar) => ({ en, ar });

function choice(id, prompt, options, answer, explain) {
  return {
    type: "choice", id, prompt: t(prompt[0], prompt[1]),
    options: options.map(([oid, en, ar]) => ({ id: oid, text: t(en, ar) })),
    answer, explain: t(explain[0], explain[1]),
  };
}
function tf(id, prompt, answer, explain) {
  return { type: "truefalse", id, prompt: t(prompt[0], prompt[1]), answer, explain: t(explain[0], explain[1]) };
}
function order(id, prompt, steps, explain) {
  return { type: "order", id, prompt: t(prompt[0], prompt[1]), steps: steps.map(([en, ar]) => t(en, ar)), explain: t(explain[0], explain[1]) };
}
function match(id, prompt, pairs, explain) {
  return {
    type: "match", id, prompt: t(prompt[0], prompt[1]),
    pairs: pairs.map(([l, r]) => ({ left: t(l[0], l[1]), right: t(r[0], r[1]) })),
    explain: t(explain[0], explain[1]),
  };
}

function slides(title, bullets, activity, questions, exit, note) {
  const b = (pairs) => list(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  return [
    { layout: "title", title: t(title[0], title[1]), note: t(note[0], note[1]) },
    { layout: "bullets", title: t(bullets[0][0], bullets[0][1]), bullets: b(bullets[1]) },
    { layout: "bullets", title: t(bullets[2][0], bullets[2][1]), bullets: b(bullets[3]) },
    { layout: "activity", title: t(activity[0], activity[1]), bullets: b(activity[2]) },
    { layout: "questions", title: t(questions[0], questions[1]), bullets: b(questions[2]) },
    { layout: "exit", title: t("Exit ticket", "بطاقة الخروج"), bullets: b([exit]), narration: t(exit[0], exit[1]) },
  ];
}

function kit(id, title) {
  return [
    { kind: "slides", title: t(`Slides: ${title[0]}`, `الشرائح: ${title[1]}`), pages: 6, base: `${id}/slides`, formats: ["pdf", "pptx"] },
    { kind: "lesson-plan", title: t(`Plan: ${title[0]}`, `الخطة: ${title[1]}`), pages: 2, base: `${id}/lesson-plan`, formats: ["pdf"] },
  ];
}

function video(title, transcript, checkpoint) {
  return {
    type: "video", id: "video", prompt: t("Watch", "شاهد"), title: t(title[0], title[1]),
    src: null, duration: 150, sizeMB: 0,
    chapters: [{ at: 0, atBy: { en: 0, ar: 0 }, label: t(title[0], title[1]) }],
    checkpoint: { at: 40, atBy: { en: 40, ar: 40 }, question: checkpoint },
    transcript: t(transcript[0], transcript[1]),
  };
}

/** One lesson. `who` is "students" or "lecturers". */
function lesson(spec, who) {
  const you = who === "students";
  const id = `${spec.course}-${spec.n}`;
  const title = spec.title;
  const read = you ? spec.readS : spec.readT;
  const labPrompt = you ? spec.labS : spec.labT;
  const tomorrow = you ? spec.tomS : spec.tomT;
  const project = you ? spec.projS : spec.projT;
  const reflect = you ? spec.refS : spec.refT;
  return {
    id, title: t(title[0], title[1]), minutes: 18,
    tryTomorrow: t(tomorrow[0], tomorrow[1]),
    materials: list(
      ["A phone with Darsi", "Paper for one hand-worked step", "The slides from the kit"],
      ["هاتف فيه درسي", "ورق لخطوة واحدة باليد", "شرائح الحزمة"],
    ),
    competencies: you ? ["S.TA.C", "S.SD.C"] : ["T.AF.C", "T.PE.C"],
    steps: [
      video(title, spec.say, spec.cp),
      {
        type: "read", id: "read", prompt: t("Read", "اقرأ"), title: t(title[0], title[1]),
        body: t(read[0], read[1]),
        keyTerms: spec.terms.map(([en, ar, den, dar]) => ({ term: t(en, ar), def: t(den, dar) })),
      },
      spec.q1, spec.q2, spec.q3,
      { type: "lab", id: "lab", prompt: t(labPrompt[0], labPrompt[1]), tool: spec.lab },
      spec.q4,
      { type: "reflect", id: "reflect", prompt: t(reflect[0], reflect[1]) },
      {
        type: "project", id: "project", prompt: t(project.prompt[0], project.prompt[1]),
        task: t(project.task[0], project.task[1]),
        deliverable: t(project.give[0], project.give[1]),
        rubric: project.rubric.map(([en, ar]) => ({ criterion: t(en, ar) })),
      },
    ],
    slides: slides(title, spec.bullets, spec.activity, spec.discuss, spec.exit, spec.note),
    kit: kit(id, title),
  };
}

function check(course, title, items, who) {
  const steps = items.map((q, i) => ({ ...q, id: `q${i + 1}` }));
  return {
    id: `${course}-check`, title: t(`${title[0]}: unit check`, `${title[1]}: اختبار الوحدة`), minutes: 12,
    tryTomorrow: t("Redo the one item you missed, on paper, before the next course.", "أعد البند الذي أخطأت فيه، على الورق، قبل المقرر التالي."),
    materials: list(["Paper", "The four lessons"], ["ورق", "الدروس الأربعة"]),
    competencies: who === "students" ? ["S.TA.C", "S.SD.C"] : ["T.AF.C", "T.PE.C"],
    steps, 
    slides: slides(title,
      [["The check", "الاختبار"], [["Four lessons", "أربعة دروس"], ["One sitting", "جلسة واحدة"]], ["How to sit it", "كيف تؤديه"], [["No notes", "بلا ملاحظات"], ["Explain the why", "اشرح السبب"]]],
      ["Work it", "اعمله", [["Answer all ten", "أجب عن العشرة"], ["Then read each explain", "ثم اقرأ كل تفسير"]]],
      ["Look back", "راجع", [["Which lesson was the miss?", "أي درس كان الخطأ؟"]]],
      ["Name the idea you will redo.", "سمِّ الفكرة التي ستعيدها."],
      ["University", "الجامعة"],
    ),
    kit: kit(`${course}-check`, title),
  };
}

function unit(meta, lessons) {
  return {
    id: meta.id, track: "ai", level: 4,
    ...(meta.audience ? { audience: meta.audience } : { teach: "university" }),
    title: t(meta.title[0], meta.title[1]),
    summary: t(meta.summary[0], meta.summary[1]),
    lessons,
  };
}

const Q = {
  stack: choice("q1", ["A single neuron draws which boundary?", "أي حد ترسمه خلية واحدة؟"],
    [["a", "One straight cut", "قطع مستقيم واحد"], ["b", "Any closed curve", "أي منحنى مغلق"], ["c", "Two cuts at once", "قطعان معًا"]],
    "a", ["A neuron is a weighted sum and an activation. One of them cuts the plane once.", "الخلية مجموع موزون وتنشيط. وواحدة منها تقطع المستوى مرة واحدة."]),
  stackTf: tf("q2", ["Adding a hidden layer can separate shapes one neuron cannot.", "إضافة طبقة مخفية تستطيع فصل أشكال لا تفصلها خلية واحدة."], true,
    ["The playground shows a ring that one line misses and a small network learns.", "يُظهر الملعب حلقة يخطئها خط واحد وتتعلّمها شبكة صغيرة."]),
  stackM: match("q3", ["Match the part to its job.", "صل الجزء بعمله."],
    [[["Weight", "الوزن"], ["How much an input counts", "مقدار تأثير المدخل"]], [["Bias", "الانحياز"], ["A shift before the activation", "إزاحة قبل التنشيط"]], [["Activation", "التنشيط"], ["A bend, so the stack is not one big line", "انحناء حتى لا تصير الكومة خطًا واحدًا"]]],
    ["Without an activation, stacked linear layers collapse into one linear layer.", "من غير تنشيط، تنطوي الطبقات الخطية المتراصة في طبقة خطية واحدة."]),
  stackO: order("q4", ["Put a forward step in order.", "رتّب خطوة أمامية."],
    [["Multiply inputs by weights", "اضرب المدخلات في الأوزان"], ["Add the bias", "أضف الانحياز"], ["Apply the activation", "طبّق التنشيط"]],
    ["The activation is last. It bends the sum.", "التنشيط آخر شيء. وهو يحني المجموع."]),
  loss: choice("q1", ["Loss θ², θ = 3, η = 0.1. θ after one step?", "الخسارة θ²، وθ تساوي ٣، وإيتا ٠٫١. أين θ بعد خطوة؟"],
    [["a", "2.4", "٢٫٤"], ["b", "2.7", "٢٫٧"], ["c", "3.6", "٣٫٦"]],
    "a", ["The slope is 2θ = 6, so the step is 0.1 × 6 and θ becomes 2.4.", "الميل ٢θ ويساوي ٦، فالخطوة ٠٫١ × ٦ وتصبح θ ٢٫٤."]),
  lossTf: tf("q2", ["The gradient points at the minimum.", "يشير التدرّج إلى القاع."], false,
    ["It points uphill, locally. Descent steps against it.", "يشير إلى أعلى، محليًا. والنزول يخطو عكسه."]),
  lossM: match("q3", ["Match the curve to the cause.", "صل المنحنى بسببه."],
    [[["Loss grows every step", "الخسارة تكبر كل خطوة"], ["Step too big", "خطوة كبيرة جدًا"]], [["Loss falls very slowly", "الخسارة تهبط ببطء شديد"], ["Step too small", "خطوة صغيرة جدًا"]], [["Train loss low, new data worse", "خسارة التدريب منخفضة والبيانات الجديدة أسوأ"], ["Memorising the training set", "حفظ مجموعة التدريب"]]],
    ["The learning rate and overfitting leave different fingerprints on the curve.", "معدّل التعلّم والإفراط في الملاءمة يتركان أثرين مختلفين على المنحنى."]),
  lossO: order("q4", ["Order one descent step.", "رتّب خطوة نزول واحدة."],
    [["Compute the loss", "احسب الخسارة"], ["Compute the gradient", "احسب التدرّج"], ["Step against the gradient", "اخطُ عكس التدرّج"]],
    ["You need the slope before you can step against it.", "تحتاج الميل قبل أن تخطو عكسه."]),
  rnn: choice("q1", ["Three empty steps follow a cue. Memory is near 0. What is left at the end?", "ثلاث خطوات فارغة بعد إشارة. الذاكرة قرب الصفر. ماذا يبقى في النهاية؟"],
    [["a", "Almost none of the cue", "لا شيء تقريبًا من الإشارة"], ["b", "The whole cue", "الإشارة كلها"], ["c", "A new cue the net invented", "إشارة جديدة اخترعتها الشبكة"]],
    "a", ["Each step keeps only a little of the hidden state, so the cue fades.", "كل خطوة تبقي قليلًا من الحالة المخفية، فتخبو الإشارة."]),
  rnnTf: tf("q2", ["A recurrent net reads the whole sequence in one look.", "تقرأ الشبكة التكرارية المتسلسلة كلها بنظرة واحدة."], false,
    ["It reads one symbol at a time and hopes the hidden state kept the rest.", "تقرأ رمزًا واحدًا في كل مرة وتأمل أن الحالة المخفية احتفظت بالباقي."]),
  rnnM: match("q3", ["Match the word to the meaning.", "صل الكلمة بمعناها."],
    [[["Hidden state", "الحالة المخفية"], ["What the net carries forward", "ما تحمله الشبكة إلى الأمام"]], [["Cue", "الإشارة"], ["The symbol that must still matter at the end", "الرمز الذي يجب أن يظل مهمًا في النهاية"]], [["Fading", "الخبو"], ["A small memory times the state, again and again", "ذاكرة صغيرة تضرب الحالة مرة بعد مرة"]]],
    ["The lab’s end number is the cue after it has been multiplied by the memory at every empty step.", "رقم النهاية في المعمل هو الإشارة بعد ضربها في الذاكرة عند كل خطوة فارغة."]),
  rnnO: order("q4", ["Order one recurrent step.", "رتّب خطوة تكرارية."],
    [["Read the next symbol", "اقرأ الرمز التالي"], ["Mix it with the old hidden state", "اخلطه بالحالة المخفية القديمة"], ["Keep the mix as the new state", "أبقِ الخليط حالة جديدة"]],
    ["The new state is the only memory the next symbol will see.", "الحالة الجديدة هي الذاكرة الوحيدة التي سيراها الرمز التالي."]),
  attn: choice("q1", ["Attention builds a new vector by…", "يبني الانتباه متجهًا جديدًا بأن…"],
    [["a", "A weighted sum of the other vectors", "مجموع موزون للمتجهات الأخرى"], ["b", "Copying only the first symbol", "نسخ الرمز الأول فقط"], ["c", "Forgetting every weight", "نسيان كل وزن"]],
    "a", ["The scores become weights that add to 1, and the new vector is their mix.", "تصير الدرجات أوزانًا مجموعها ١، والمتجه الجديد خليطها."]),
  attnTf: tf("q2", ["The eight-note lab composed a piece of music.", "ألّف معمل النغمات الثماني مقطوعة موسيقية."], false,
    ["It continued the counts from one short tune. It did not hear music and it did not train for long.", "أكمل أعداد لحن قصير واحد. لم يسمع موسيقى ولم يتدرّب طويلًا."]),
  attnM: match("q3", ["Match the piece.", "صل القطعة."],
    [[["Query", "الاستعلام"], ["What this item is looking for", "ما يبحث عنه هذا العنصر"]], [["Key", "المفتاح"], ["What each item offers", "ما يقدمه كل عنصر"]], [["Residual", "الباقي"], ["Adding the original back", "إعادة إضافة الأصل"]]],
    ["Attention mixes. The residual keeps what was already there.", "الانتباه يخلط. والباقي يحتفظ بما كان موجودًا."]),
  attnO: order("q4", ["Order an attention step.", "رتّب خطوة انتباه."],
    [["Score every item", "قيّم كل عنصر"], ["Turn scores into weights that add to 1", "حوّل الدرجات إلى أوزان مجموعها ١"], ["Mix the vectors with those weights", "اخلط المتجهات بهذه الأوزان"]],
    ["The mix is last. The weights have to exist first.", "الخليط آخر شيء. والأوزان يجب أن توجد أولًا."]),
  grid: choice("q1", ["A grey picture on a computer is…", "الصورة الرمادية في الحاسوب هي…"],
    [["a", "A grid of numbers", "شبكة أرقام"], ["b", "A list of object names", "قائمة أسماء أشياء"], ["c", "One bit for the whole photo", "بت واحد للصورة كلها"]],
    "a", ["Each cell is a brightness. Colour is three such grids.", "كل خانة سطوع. واللون ثلاث شبكات من هذا النوع."]),
  gridTf: tf("q2", ["A 3×3 filter already knows it is looking at a face.", "المرشّح ٣×٣ يعرف أصلًا أنه ينظر إلى وجه."], false,
    ["It only mixes each pixel with its neighbours. Faces, if they appear, come from many layers.", "هو فقط يخلط كل بكسل بجيرانها. والوجوه، إن ظهرت، تأتي من طبقات كثيرة."]),
  gridM: match("q3", ["Match the filter.", "صل المرشّح."],
    [[["Upright edges", "حواف قائمة"], ["Walls and door sides", "الجدران وجانبا الباب"]], [["Blur", "طمس"], ["A pixel averaged with its neighbours", "بكسل أخذ متوسطه مع جيرانه"]], [["Pooling", "التجميع"], ["Keep the strongest in a small block", "أبقِ الأقوى في مربع صغير"]]],
    ["Convolution mixes. Pooling throws detail away.", "الطي يخلط. والتجميع يرمي التفصيل."]),
  gridO: order("q4", ["Order one filter step.", "رتّب خطوة مرشّح."],
    [["Lay the 3×3 on the picture", "ضع ٣×٣ على الصورة"], ["Multiply and add the nine cells", "اضرب الخلايا التسع واجمعها"], ["Write that sum as the new pixel", "اكتب المجموع بكسلًا جديدًا"]],
    ["The new picture is those sums, one per position.", "الصورة الجديدة هي هذه المجاميع، واحد عند كل موضع."]),
  detect: choice("q1", ["The tiny detector was trained on close-set eyes. A wider drawn face scores…", "تدرّب الكاشف الصغير على عينين متقاربتين. الوجه المرسوم الأعرض درجته…"],
    [["a", "Below the line", "تحت الخط"], ["b", "Perfect", "كاملة"], ["c", "The same as the box", "مثل الصندوق تمامًا"]],
    "a", ["It never saw that spacing, so the match falls under the line. The box stays under it too.", "لم يرَ تلك المسافة، فينزل التطابق تحت الخط. والصندوق يبقى تحته أيضًا."]),
  detectTf: tf("q2", ["A high score on the training shape is enough to trust a detector on new people.", "الدرجة العالية على شكل التدريب كافية للثقة بكاشف على أناس جدد."], false,
    ["The wide face is still a face, and the detector missed it. The test has to include who might be missed.", "الوجه العريض ما زال وجهًا، وقد فوّته الكاشف. ويجب أن يشمل الاختبار من قد يُفوَّت."]),
  detectM: match("q3", ["Match the picture.", "صل الصورة."],
    [[["Round drawing", "الرسم المتقارب"], ["In the training average", "في متوسط التدريب"]], [["Wide drawing", "الرسم العريض"], ["A face the detector misses", "وجه يفوّته الكاشف"]], [["Box", "الصندوق"], ["Correctly not a face", "ليس وجهًا، وهذا صواب"]]],
    ["Same idea, different spacing, different score. That is the lab.", "الفكرة نفسها، والمسافة مختلفة، والدرجة مختلفة. هذا هو المعمل."]),
  detectO: order("q4", ["Order a fair check of a detector.", "رتّب فحصًا عادلًا لكاشف."],
    [["Train on one set", "درّب على مجموعة"], ["Test on shapes it did not train on", "اختبر على أشكال لم يتدرّب عليها"], ["Report who it misses", "اذكر من يفوّته"]],
    ["The miss is invisible if you only rescore the training pictures.", "التفويت لا يُرى إذا أعدت حساب صور التدريب فقط."]),
  vae: choice("q1", ["The two-number code of the blob is…", "رمز البقعة المكوّن من رقمين هو…"],
    [["a", "Where the brightness sits", "موضع الإضاءة"], ["b", "The name of the object", "اسم الشيء"], ["c", "A proof the picture is a photo", "دليل أن الصورة فوتوغرافية"]],
    "a", ["Encoding takes the centre of the brightness. Decoding paints a blob there.", "الترميز يأخذ مركز الإضاءة. وفك الترميز يرسم بقعة هناك."]),
  vaeTf: tf("q2", ["Nudging the code repairs the original pixels.", "تحريك الرمز يصلح بكسلات الأصل."], false,
    ["It paints a new blob at the new code. The exact pixels were never stored.", "يرسم بقعة جديدة عند الرمز الجديد. والبكسلات بالضبط لم تُخزَّن."]),
  vaeM: match("q3", ["Match the model.", "صل النموذج."],
    [[["Autoencoder", "المرمّز التلقائي"], ["Squeeze, then rebuild", "اضغط ثم أعد البناء"]], [["Code", "الرمز"], ["A short summary", "ملخّص قصير"]], [["Sample", "العيّنة"], ["A new code, decoded", "رمز جديد يُفك"]]],
    ["A variational model keeps a cloud of codes so a new sample is allowed.", "النموذج المتغير يحتفظ بسحابة من الرموز حتى تجوز عيّنة جديدة."]),
  vaeO: order("q4", ["Order one encode and decode.", "رتّب ترميزًا وفكًا."],
    [["Find where the brightness sits", "جد موضع الإضاءة"], ["Store those two numbers", "خزّن هذين الرقمين"], ["Paint a blob at that code", "ارسم بقعة عند ذلك الرمز"]],
    ["The picture you get back is the decode, not the file you started with.", "الصورة التي تعود هي فك الرمز، لا الملف الذي بدأت به."]),
  gen: choice("q1", ["Which idea removes a little noise at a time?", "أي فكرة تزيل قليلًا من الضجيج في كل مرة؟"],
    [["a", "Diffusion", "الانتشار"], ["b", "A single 3×3 edge filter", "مرشّح حواف ٣×٣ واحد"], ["c", "A password hash", "تجزئة كلمة مرور"]],
    "a", ["Diffusion repeats a small denoise. One step in the lab is the idea, not a finished generator.", "يكرّر الانتشار إزالة ضجيج صغيرة. والخطوة في المعمل هي الفكرة، لا مولّدًا مكتملًا."]),
  genTf: tf("q2", ["A picture from a generator is evidence of what it shows.", "صورة من مولّد دليل على ما تعرضه."], false,
    ["It is a sample from a loss. It can be confident and false.", "هي عيّنة من خسارة. وقد تكون واثقة وكاذبة."]),
  genM: match("q3", ["Match the generator.", "صل المولّد."],
    [[["Autoencoder", "المرمّز التلقائي"], ["Rebuild from a short code", "أعد البناء من رمز قصير"]], [["GAN", "شبكة خصمية"], ["One network tries to fool another", "شبكة تحاول أن تخدع أخرى"]], [["Diffusion", "الانتشار"], ["Undo noise one step at a time", "أزل الضجيج خطوة بعد خطوة"]]],
    ["Three different losses. The lab only shows one denoise step.", "ثلاث خسائر مختلفة. والمعمل يُظهر خطوة إزالة ضجيج واحدة فقط."]),
  genO: order("q4", ["Order a diffusion story.", "رتّب حكاية انتشار."],
    [["Add noise until the picture is gone", "أضف الضجيج حتى تختفي الصورة"], ["Learn a step that removes a little", "تعلّم خطوة تزيل قليلًا"], ["Repeat the step", "كرّر الخطوة"]],
    ["The lab stops after one step, on purpose.", "يتوقف المعمل بعد خطوة واحدة، عمدًا."]),
  rl: choice("q1", ["A reward arrives after a path of actions. The hard part is…", "تصل المكافأة بعد مسار من الأفعال. الجزء الصعب هو…"],
    [["a", "Sending the credit back along the path", "إعادة الفضل على طول المسار"], ["b", "Storing the reward as a password", "تخزين المكافأة كلمة مرور"], ["c", "Ignoring the world", "تجاهل العالم"]],
    "a", ["The charger is at the end. Earlier steps have to learn that they helped.", "الشاحن في النهاية. والخطوات السابقة يجب أن تتعلّم أنها ساعدت."]),
  rlTf: tf("q2", ["A value and a policy are the same picture.", "القيمة والسياسة الصورة نفسها."], false,
    ["Value is how good it is to be here. Policy is what to do here.", "القيمة مدى جودة أن تكون هنا. والسياسة ماذا تفعل هنا."]),
  rlM: match("q3", ["Match the word.", "صل الكلمة."],
    [[["Reward", "المكافأة"], ["The number the world returns", "الرقم الذي يعيده العالم"]], [["Value", "القيمة"], ["How good a place is", "مدى جودة مكان"]], [["Policy", "السياسة"], ["What to do there", "ماذا تفعل هناك"]]],
    ["A reward that looks sensible can still train a bad policy.", "مكافأة تبدو معقولة قد تدرّب سياسة سيئة."]),
  rlO: order("q4", ["Order one learning step from reward.", "رتّب خطوة تعلّم من مكافأة."],
    [["Take an action", "اتخذ فعلًا"], ["See the new place and the reward", "انظر المكان الجديد والمكافأة"], ["Update the value of where you were", "حدّث قيمة المكان الذي كنت فيه"]],
    ["The update is last. It needs the reward.", "التحديث آخر شيء. وهو يحتاج المكافأة."]),
  llm: choice("q1", ["Fine-tuning, in the small lab, changes…", "التعديل الدقيق، في المعمل الصغير، يغيّر…"],
    [["a", "The last layer, on a few examples", "الطبقة الأخيرة، على أمثلة قليلة"], ["b", "Every weight in a model the size of the internet", "كل وزن في نموذج بحجم الإنترنت"], ["c", "The spelling of the training text", "إملاء نص التدريب"]],
    "a", ["The rest stays frozen. That is the honest small version, and it can crowd an old skill.", "الباقي يبقى مجمّدًا. وهذه هي النسخة الصغيرة الصادقة، وقد تزاحم مهارة قديمة."]),
  llmTf: tf("q2", ["A language model looks facts up as it writes.", "يبحث النموذج اللغوي عن الحقائق وهو يكتب."], false,
    ["It guesses the next token from patterns, unless a separate tool searches.", "يخمن الرمز التالي من الأنماط، إلا إذا بحثت أداة منفصلة."]),
  llmM: match("q3", ["Match the limit.", "صل الحد."],
    [[["Frozen layers", "طبقات مجمّدة"], ["Weights that did not move", "أوزان لم تتحرك"]], [["New last layer", "طبقة أخيرة جديدة"], ["The only part the small lab teaches", "الجزء الوحيد الذي يعلّمه المعمل الصغير"]], [["Old skill crowded out", "مهارة قديمة زُوحمت"], ["A cost of changing a model", "ثمن تغيير النموذج"]]],
    ["Say which weights moved before you claim the model learned a job.", "قل أي أوزان تحركت قبل أن تدّعي أن النموذج تعلّم مهمة."]),
  llmO: order("q4", ["Order a small fine-tune.", "رتّب تعديلًا دقيقًا صغيرًا."],
    [["Start from a model that already exists", "ابدأ من نموذج موجود"], ["Freeze every layer but the last", "جمّد كل طبقة إلا الأخيرة"], ["Teach the last layer with a few examples", "علّم الطبقة الأخيرة بأمثلة قليلة"]],
    ["Freezing is the point. Otherwise you are training from scratch.", "التجميد هو المقصود. وإلا فأنت تدرّب من الصفر."]),
  law: choice("q1", ["A model scores perfectly on its training cases and answers a case it should refuse. The suite…", "ينجح النموذج تمامًا في حالات تدريبه ويجيب عن حالة يجب أن يرفضها. الاختبار…"],
    [["a", "Has not passed", "لم ينجح"], ["b", "Has passed", "نجح"], ["c", "Needs no refusal cases", "لا يحتاج حالات رفض"]],
    "a", ["One missed refusal fails the suite. The other scores do not cancel it.", "رفض فائت واحد يفشل الاختبار. والدرجات الأخرى لا تلغيه."]),
  lawTf: tf("q2", ["Three duties: test before use, keep actions visible, and keep a person responsible.", "ثلاث واجبات: الاختبار قبل الاستعمال، وإبقاء الأفعال ظاهرة، وإبقاء شخص مسؤولًا."], true,
    ["That is the lecture’s content in this course, not a slogan on a slide.", "هذا محتوى المحاضرة في هذا المقرر، لا شعار على شريحة."]),
  lawM: match("q3", ["Match the duty.", "صل الواجب."],
    [[["Test before use", "اختبر قبل الاستعمال"], ["A set of cases, including a refusal", "مجموعة حالات، ومنها رفض"]], [["Visible actions", "أفعال ظاهرة"], ["Someone can see what the system did", "يستطيع أحد أن يرى ما فعله النظام"]], [["A person responsible", "شخص مسؤول"], ["A harmful action is not nobody’s", "الفعل الضار ليس بلا صاحب"]]],
    ["A score without a refusal case misses the first duty.", "درجة بلا حالة رفض تُفوّت الواجب الأول."]),
  lawO: order("q4", ["Order a check before trust.", "رتّب فحصًا قبل الثقة."],
    [["Write the cases", "اكتب الحالات"], ["Include one the model must refuse", "أدرج واحدة يجب أن يرفضها النموذج"], ["Read a miss before you ship", "اقرأ الخطأ قبل أن تشغّل"]],
    ["The refusal is part of the test, not an extra.", "الرفض جزء من الاختبار، وليس إضافة."]),
  scale: choice("q1", ["A layer does not fit on one machine because it is wide. You…", "طبقة لا تتسع على جهاز واحد لأنها عريضة. أنت…"],
    [["a", "Split the layer", "تقسم الطبقة"], ["b", "Only split the examples", "تقسم الأمثلة فقط"], ["c", "Store the activations as passwords", "تخزن التنشيطات كلمات مرور"]],
    "a", ["Splitting examples still copies the whole layer onto each machine.", "تقسيم الأمثلة ما زال ينسخ الطبقة كلها إلى كل جهاز."]),
  scaleTf: tf("q2", ["A fast stand-in for a lab measurement is the experiment.", "البديل السريع لقياس معملي هو التجربة."], false,
    ["It is useful where it was tested. It is not the measurement.", "هو مفيد حيث اختُبر. وهو ليس القياس."]),
  scaleM: match("q3", ["Match the split.", "صل التقسيم."],
    [[["Data parallel", "توازي البيانات"], ["Each machine holds the whole model and some examples", "كل جهاز يحتفظ بالنموذج كله وبعض الأمثلة"]], [["Model parallel", "توازي النموذج"], ["Each machine holds part of the layer", "كل جهاز يحتفظ بجزء من الطبقة"]], [["One phone", "هاتف واحد"], ["One machine, so this lab is a diagram", "جهاز واحد، فالمعمل رسم"]]],
    ["Memory of a step is weights plus activations, and activations grow with the batch.", "ذاكرة الخطوة هي الأوزان زائد التنشيطات، والتنشيطات تكبر مع الدفعة."]),
  scaleO: order("q4", ["Order a decision about a wide layer.", "رتّب قرارًا عن طبقة عريضة."],
    [["Write the memory of one step", "اكتب ذاكرة خطوة واحدة"], ["Try splitting the examples", "جرّب تقسيم الأمثلة"], ["Split the layer if that still does not fit", "قسّم الطبقة إذا ظل ذلك لا يتسع"]],
    ["You measure before you name a bigger machine.", "تقيس قبل أن تسمّي جهازًا أكبر."]),
};

function say(lines) { return [lines.map((l) => l[0]).join(" "), lines.map((l) => l[1]).join(" ")]; }

const courses = [
  {
    idS: "ai-d1", idT: "ai-u2",
    titleS: ["Networks and sequences", "الشبكات والمتسلسلات"],
    titleT: ["Teaching networks and sequences", "تدريس الشبكات والمتسلسلات"],
    sumS: ["How a deep network learns, and how a sequence model decides what to remember. On a phone: a forward step, a backward step, a fading memory, and eight notes.", "كيف تتعلّم شبكة عميقة، وكيف يقرّر نموذج المتسلسلة ما يتذكّره. على هاتف: خطوة أمامية، وخطوة خلفية، وذاكرة تخبو، وثماني نغمات."],
    sumT: ["How to teach deep networks and sequence models to a university class: the misconception to expect, a seminar on one phone, and an assessment a chatbot cannot sit.", "كيف تدرّس الشبكات العميقة ونماذج المتسلسلات لصف جامعي: التصور الخاطئ المتوقع، وحلقة على هاتف واحد، وتقييم لا يستطيع روبوت دردشة أن يؤديه."],
    lessons: [
      {
        n: 1, title: ["A stack of neurons", "كومة من الخلايا العصبية"], lab: "playground",
        terms: [["Neuron", "خلية عصبية", "A weighted sum, a bias and an activation.", "مجموع موزون وانحياز وتنشيط."], ["Depth", "العمق", "More than one layer.", "أكثر من طبقة."], ["Activation", "التنشيط", "The bend that stops a stack collapsing into one line.", "الانحناء الذي يمنع الكومة من أن تصير خطًا واحدًا."]],
        say: say([["One neuron cuts the inputs once.", "خلية واحدة تقطع المدخلات مرة واحدة."], ["A stack, with a bend at each layer, can separate a ring a line cannot.", "كومة، بانحناء عند كل طبقة، تستطيع فصل حلقة لا يفصلها خط."], ["Open the playground and watch a small network learn a boundary the single neuron misses.", "افتح الملعب وشاهد شبكة صغيرة تتعلّم حدًا تخطئه الخلية الواحدة."]]),
        readS: ["Write a neuron as weights, a bias and an activation. One neuron draws one cut. Stack linear layers with no activation and they collapse into a single cut. The activation is what lets the next layer bend the previous one. In the playground, a ring of points is the picture: a line misses it, and a network with a hidden layer can learn it. You are not training a large model. You are watching depth do one job a single neuron cannot.", "اكتب الخلية أوزانًا وانحيازًا وتنشيطًا. وترسم خلية واحدة قطعًا واحدًا. وإن رصصت طبقات خطية بلا تنشيط انطوت في قطع واحد. والتنشيط هو ما يتيح للطبقة التالية أن تحني السابقة. وفي الملعب، حلقة من النقاط هي الصورة: يخطئها الخط، وتستطيع شبكة ذات طبقة مخفية أن تتعلّمها. أنت لا تدرّب نموذجًا كبيرًا. أنت تشاهد العمق يفعل عملًا لا تفعله خلية واحدة."],
        readT: ["Students meet depth as “more is smarter”. Give them a ring the perceptron misses, then the playground. Ask them to say which part did the work: the extra layer, or the activation. Without the activation the extra layer is still one line. Assess the sentence, not a screenshot of a loss going down.", "يلتقي الطلاب العمق على أنه «الأكثر أذكى». أعطهم حلقة يخطئها البرسبترون، ثم الملعب. واطلب أن يقولوا أي جزء قام بالعمل: الطبقة الزائدة، أم التنشيط. ومن غير التنشيط تظل الطبقة الزائدة خطًا واحدًا. قيّم الجملة، لا لقطة شاشة لخسارة تهبط."],
        labS: ["Train a small network on a shape one line cannot separate. Watch the boundary bend.", "درّب شبكة صغيرة على شكل لا يفصله خط. وشاهد الحد ينحني."],
        labT: ["One phone between two. They name the shape a line misses, then run the playground and say what the hidden layer added.", "هاتف واحد بين اثنين. يسمّيان الشكل الذي يخطئه الخط، ثم يشغّلان الملعب ويقولان ماذا أضافت الطبقة المخفية."],
        q1: Q.stack, q2: Q.stackTf, q3: Q.stackM, q4: Q.stackO, cp: Q.stack,
        tomS: ["On paper, compute one forward step: two inputs, two weights, a bias, then a ReLU.", "على الورق، احسب خطوة أمامية: مدخلان، ووزنان، وانحياز، ثم ReLU."],
        tomT: ["Set the seminar: pairs vote on a boundary a line misses before anyone opens the playground.", "جهّز الحلقة: يصوّت كل زوجين على حد يخطئه الخط قبل أن يفتح أحد الملعب."],
        refS: ["Where did the single neuron fail, in one sentence?", "أين فشلت الخلية الواحدة، في جملة واحدة؟"],
        refT: ["Which sentence will you mark: the one about depth, or the one about the activation?", "أي جملة ستصحّح: التي عن العمق، أم التي عن التنشيط؟"],
        projS: { prompt: ["Project: one forward step", "مشروع: خطوة أمامية"], task: ["Write a network with two inputs and one hidden unit. Compute the output by hand for one example, then check it in the playground.", "اكتب شبكة بمدخلين ووحدة مخفية واحدة. واحسب الخرج يدويًا لمثال واحد، ثم تحقق منه في الملعب."], give: ["The arithmetic and a sentence on what the activation changed.", "الحساب وجملة عما غيّره التنشيط."], rubric: [["The arithmetic matches a forward step.", "الحساب يطابق خطوة أمامية."], ["The sentence says what a line cannot do.", "الجملة تقول ما لا يستطيعه خط."]] },
        projT: { prompt: ["Project: a one-phone seminar", "مشروع: حلقة على هاتف واحد"], task: ["Write a 40-minute seminar: the ring, the vote, the playground, and the sentence you will mark.", "اكتب حلقة من ٤٠ دقيقة: الحلقة، والتصويت، والملعب، والجملة التي ستصحّحها."], give: ["The seminar sheet and the marking sentence.", "ورقة الحلقة وجملة التصحيح."], rubric: [["Students must say what the activation does.", "يجب أن يقول الطلاب ماذا يفعل التنشيط."], ["The phone is shared, not required one each.", "الهاتف مشترك، وليس واحدًا لكل طالب."]] },
        bullets: [["The cut", "القطع"], [["One neuron, one cut", "خلية واحدة، قطع واحد"], ["A stack can bend", "الكومة تستطيع أن تحني"]], ["What bends it", "ما يحنيها"], [["The activation", "التنشيط"], ["Without it, still one line", "من غيرها، يظل خطًا واحدًا"]]],
        activity: ["In the lab", "في المعمل", [["Open the playground", "افتح الملعب"], ["Find a shape a line misses", "جد شكلًا يخطئه خط"]]],
        discuss: ["Ask", "اسأل", [["Why is depth not the same as “more”?", "لماذا ليس العمق هو «المزيد»؟"]]],
        exit: ["Name the part that bends the stack.", "سمِّ الجزء الذي يحني الكومة."],
        note: ["University, 1", "الجامعة، ١"],
      },
      {
        n: 2, title: ["Loss, descent and backprop", "الخسارة والنزول والانتشار العكسي"], lab: "gradient",
        terms: [["Loss", "الخسارة", "A number that is large when the answer is wrong.", "رقم يكبر حين تكون الإجابة خاطئة."], ["Gradient", "التدرّج", "The local uphill direction.", "اتجاه الصعود المحلي."], ["Learning rate", "معدّل التعلّم", "How far one step moves.", "كم تبعد الخطوة الواحدة."]],
        say: say([["Learning picks weights that make the loss small.", "يختار التعلّم أوزانًا تجعل الخسارة صغيرة."], ["The gradient points uphill. Descent steps the other way.", "يشير التدرّج إلى أعلى. والنزول يخطو في الاتجاه الآخر."], ["A step that is too big climbs out of the valley.", "خطوة كبيرة جدًا تصعد خارج الوادي."]]),
        readS: ["For the loss θ² the slope is 2θ. One step is θ minus the learning rate times that slope. At θ = 3 and a rate of 0.1 the next θ is 2.4. A rate that is too large steps past the bottom and the loss grows. Backprop is this blame, layer by layer, via the chain rule. Open the gradient lab for the valley, and the backprop lab when you want every number in a tiny net. A falling loss on the training points is not proof the model is right on new points.", "للخسارة θ² الميل هو ٢θ. والخطوة هي θ ناقص معدّل التعلّم مضروبًا في ذلك الميل. وعند θ تساوي ٣ ومعدّل ٠٫١ تصبح θ التالية ٢٫٤. والمعدّل الكبير جدًا يتخطى القاع فتكبر الخسارة. والانتشار العكسي هو هذا اللوم، طبقة بعد طبقة، بقاعدة السلسلة. افتح معمل التدرّج للوادي، ومعمل الانتشار العكسي حين تريد كل رقم في شبكة صغيرة. والخسارة الهابطة على نقاط التدريب ليست دليلًا أن النموذج صحيح على نقاط جديدة."],
        readT: ["The misconception is that the gradient points at the minimum. Have every pair take five steps on θ² at three learning rates before any code. Mark the arithmetic. Then the gradient lab is a check, not the first meeting. Ask who will still say the model is right because the training loss fell.", "التصور الخاطئ أن التدرّج يشير إلى القاع. اجعل كل زوجين يأخذان خمس خطوات على θ² بثلاثة معدّلات قبل أي كود. وصحّح الحساب. ثم يكون معمل التدرّج فحصًا، لا اللقاء الأول. واسأل من سيظل يقول إن النموذج صحيح لأن خسارة التدريب هبطت."],
        labS: ["Run a good step and a step that is too big. Watch the ball in the valley.", "شغّل خطوة مناسبة وخطوة كبيرة جدًا. وراقب الكرة في الوادي."],
        labT: ["Pairs predict which rate will climb, then run it. Collect one wrong prediction and why it was tempting.", "يتنبأ كل زوجين بأي معدّل سيصعد، ثم يشغّلانه. واجمع تنبؤًا خاطئًا واحدًا وسبب إغرائه."],
        q1: Q.loss, q2: Q.lossTf, q3: Q.lossM, q4: Q.lossO, cp: Q.loss,
        tomS: ["Compute the 2.4 step on paper without looking it up.", "احسب خطوة ٢٫٤ على الورق من غير أن تبحث عنها."],
        tomT: ["Bring three loss curves to the seminar with the rates removed. Students name the rate.", "أحضر ثلاثة منحنيات خسارة إلى الحلقة من غير المعدّلات. والطلاب يسمّون المعدّل."],
        refS: ["What does a growing loss tell you, before you look at the weights?", "ماذا تقول لك خسارة تكبر، قبل أن تنظر إلى الأوزان؟"],
        refT: ["What will you mark if the arithmetic is right and the sentence says the gradient points at the minimum?", "ماذا ستصحّح إذا كان الحساب صحيحًا والجملة تقول إن التدرّج يشير إلى القاع؟"],
        projS: { prompt: ["Project: five steps by hand", "مشروع: خمس خطوات باليد"], task: ["Take five steps on θ² from θ = 3 at η = 0.1 and at η = 1.1. Say which one leaves the valley.", "خذ خمس خطوات على θ² من θ تساوي ٣ عند إيتا ٠٫١ وعند إيتا ١٫١. وقل أيهما يغادر الوادي."], give: ["The ten numbers and one sentence.", "الأرقام العشرة وجملة واحدة."], rubric: [["Both runs are arithmetic, not a screenshot.", "كلا التشغيلين حساب، لا لقطة شاشة."], ["The sentence names the rate that diverges.", "الجملة تسمّي المعدّل الذي يتباعد."]] },
        projT: { prompt: ["Project: mark a hand step", "مشروع: صحّح خطوة يدوية"], task: ["Write the problem, a wrong student solution that says the gradient points at the bottom, and the mark scheme.", "اكتب المسألة، وحلًا طلابيًا خاطئًا يقول إن التدرّج يشير إلى القاع، ومعيار التصحيح."], give: ["The problem, the wrong solution and the scheme.", "المسألة والحل الخاطئ والمعيار."], rubric: [["The scheme marks the direction of the gradient.", "المعيار يصحّح اتجاه التدرّج."], ["A chatbot transcript is not evidence.", "نص روبوت الدردشة ليس دليلًا."]] },
        bullets: [["The step", "الخطوة"], [["Loss is large when wrong", "الخسارة تكبر عند الخطأ"], ["Step against the slope", "اخطُ عكس الميل"]], ["The rate", "المعدّل"], [["Too small crawls", "الصغير يزحف"], ["Too big climbs out", "الكبير يصعد خارجًا"]]],
        activity: ["In the lab", "في المعمل", [["Run Good", "شغّل المناسب"], ["Run Too big", "شغّل الكبير جدًا"]]],
        discuss: ["Ask", "اسأل", [["Where does the gradient point?", "إلى أين يشير التدرّج؟"]]],
        exit: ["θ² at 3, rate 0.1: write the next θ.", "θ² عند ٣، والمعدّل ٠٫١: اكتب θ التالية."],
        note: ["University, 2", "الجامعة، ٢"],
      },
      {
        n: 3, title: ["Sequences and the memory that fades", "المتسلسلات والذاكرة التي تخبو"], lab: "rnn",
        terms: [["Hidden state", "الحالة المخفية", "What the net carries to the next step.", "ما تحمله الشبكة إلى الخطوة التالية."], ["Cue", "الإشارة", "The early symbol that must still matter.", "الرمز المبكر الذي يجب أن يظل مهمًا."], ["Fading", "الخبو", "A small memory multiplied at every step.", "ذاكرة صغيرة تُضرب في كل خطوة."]],
        say: say([["A sequence is read one symbol at a time.", "تُقرأ المتسلسلة رمزًا واحدًا في كل مرة."], ["The hidden state is the only memory.", "الحالة المخفية هي الذاكرة الوحيدة."], ["If little of it survives, the first symbol is gone before the end.", "إذا بقي منها القليل، ذهب الرمز الأول قبل النهاية."]]),
        readS: ["Open the memory lab. The first cell is a cue and the next three are empty. The slider is how much of the hidden state survives each step. Near zero, the end has forgotten the cue. Near one, the sign of the cue is still there. That is the limit of a simple recurrent net: a long gap washes the start away. Attention, in the next lesson, looks back instead of trusting this number.", "افتح معمل الذاكرة. الخانة الأولى إشارة والثلاث التالية فارغة. والمؤشر هو مقدار الحالة المخفية الذي يبقى في كل خطوة. وقرب الصفر، نسيت النهاية الإشارة. وقرب الواحد، ما زالت إشارة البداية هناك. وهذا حد الشبكة التكرارية البسيطة: فجوة طويلة تغسل البداية. والانتباه، في الدرس التالي، ينظر إلى الوراء بدل أن يثق بهذا الرقم."],
        readT: ["Students say the net “reads the sentence”. Make them point at the end number with the slider on the left. The sentence is gone. The seminar question is what a longer gap would require. Do not start with an LSTM diagram. Start with the faded number.", "يقول الطلاب إن الشبكة «تقرأ الجملة». اجعلهم يشيرون إلى رقم النهاية والمؤشر على اليسار. الجملة ذهبت. وسؤال الحلقة هو ماذا تتطلبه فجوة أطول. لا تبدأ برسم LSTM. ابدأ بالرقم الذي خبا."],
        labS: ["Find a memory that keeps more than half the cue, and one that keeps almost none.", "جد ذاكرة تبقي أكثر من نصف الإشارة، وأخرى لا تبقي شيئًا تقريبًا."],
        labT: ["Students write the end number at two slider positions before you name vanishing gradients.", "يكتب الطلاب رقم النهاية عند موضعين للمؤشر قبل أن تسمّي تلاشّ التدرّج."],
        q1: Q.rnn, q2: Q.rnnTf, q3: Q.rnnM, q4: Q.rnnO, cp: Q.rnn,
        tomS: ["Write the hidden state after a cue of 1 and one empty step, if memory is one half.", "اكتب الحالة المخفية بعد إشارة ١ وخطوة فارغة واحدة، إذا كانت الذاكرة نصفًا."],
        tomT: ["Ask the class to predict the end number before they move the slider.", "اطلب من الصف أن يتنبأ برقم النهاية قبل أن يحرّكوا المؤشر."],
        refS: ["What did the empty steps do to the cue?", "ماذا فعلت الخطوات الفارغة بالإشارة؟"],
        refT: ["What sentence will you reject: “it reads the whole sequence at once”?", "أي جملة سترفض: «تقرأ المتسلسلة كلها دفعة واحدة»؟"],
        projS: { prompt: ["Project: two memories", "مشروع: ذاكرتان"], task: ["Record the end state at memory 0.2 and at memory 0.9 for the lab’s cue. Say which one still knows the start.", "سجّل الحالة النهائية عند ذاكرة ٠٫٢ وعند ٠٫٩ لإشارة المعمل. وقل أيهما ما زال يعرف البداية."], give: ["The two numbers and one sentence.", "الرقمان وجملة واحدة."], rubric: [["The numbers come from the lab.", "الرقمان من المعمل."], ["The sentence names fading, not “the net understood”.", "الجملة تسمّي الخبو، لا «الشبكة فهمت»."]] },
        projT: { prompt: ["Project: predict, then slide", "مشروع: تنبّأ ثم حرّك"], task: ["Write a ten-minute opening: students predict the end number, then move the slider, then correct the prediction.", "اكتب افتتاحًا من عشر دقائق: يتنبأ الطلاب برقم النهاية، ثم يحرّكون المؤشر، ثم يصحّحون التنبؤ."], give: ["The opening and the prediction you expect to be wrong.", "الافتتاح والتنبؤ الذي تتوقع أن يكون خاطئًا."], rubric: [["The wrong prediction is the one you teach from.", "التنبؤ الخاطئ هو ما تدرّس منه."], ["No one needs their own phone.", "لا يحتاج أحد هاتفه الخاص."]] },
        bullets: [["One symbol at a time", "رمز واحد في كل مرة"], [["The state is the memory", "الحالة هي الذاكرة"], ["Empty steps still multiply it", "الخطوات الفارغة تضربها أيضًا"]], ["The fade", "الخبو"], [["Small memory, cue gone", "ذاكرة صغيرة، الإشارة ذهبت"], ["Large memory, cue remains", "ذاكرة كبيرة، الإشارة تبقى"]]],
        activity: ["In the lab", "في المعمل", [["Slider to the left", "المؤشر إلى اليسار"], ["Slider to the right", "المؤشر إلى اليمين"]]],
        discuss: ["Ask", "اسأل", [["What would a longer gap do?", "ماذا تفعل فجوة أطول؟"]]],
        exit: ["Does the end still know the cue? Write the number.", "هل ما زالت النهاية تعرف الإشارة؟ اكتب الرقم."],
        note: ["University, 3", "الجامعة، ٣"],
      },
      {
        n: 4, title: ["Attention and the transformer", "الانتباه والمحوّل"], lab: "melody",
        terms: [["Attention", "الانتباه", "A weighted mix of the other items.", "خليط موزون من العناصر الأخرى."], ["Transformer block", "كتلة المحوّل", "Attention, a small feed-forward, and a residual add.", "انتباه، وتغذية أمامية صغيرة، وإضافة الباقي."], ["Next note", "النغمة التالية", "The most common follower in a tiny tune, not a composition.", "التابع الأكثر تكرارًا في لحن صغير، لا تأليف."]],
        say: say([["Attention scores every earlier item and mixes them.", "يقيّم الانتباه كل عنصر سابق ويخلطها."], ["A transformer block adds that mix back onto the original.", "كتلة المحوّل تعيد إضافة ذلك الخليط إلى الأصل."], ["Eight notes continue a count. They are not a song.", "ثماني نغمات تكمل عدًّا. وهي ليست أغنية."]]),
        readS: ["Attention replaces the hope that a hidden state kept the start. Each item asks a question, every item offers a key, and the new vector is a weighted sum. A transformer block does that and also adds the original back, so nothing is forced through one narrow state. The melody lab is MIT’s music lab cut down to eight notes: it counts which pitch followed which, then always picks the most common follower. It cannot play a pitch it never saw follow another. Say that limit out loud.", "يستبدل الانتباه بالأمل أن حالة مخفية احتفظت بالبداية. كل عنصر يسأل سؤالًا، وكل عنصر يقدّم مفتاحًا، والمتجه الجديد مجموع موزون. وكتلة المحوّل تفعل ذلك وتعيد إضافة الأصل أيضًا، فلا يُجبر شيء على المرور في حالة ضيقة واحدة. ومعمل اللحن هو معمل الموسيقى في المساق مقصوصًا إلى ثماني نغمات: يعدّ أي درجة تبعت أي درجة، ثم يختار دائمًا التابع الأكثر تكرارًا. ولا يستطيع أن يعزف درجة لم يرها تتبع أخرى. قل هذا الحد بصوت عالٍ."],
        readT: ["Do not let “attention” become “the model understands”. The seminar points at one weight in the attention lab and one continued note in the melody lab. The question to mark is: what was counted, and what was not. A student who says the eight notes are a trained composer has not finished the lesson.", "لا تدع «الانتباه» يصير «النموذج يفهم». تشير الحلقة إلى وزن واحد في معمل الانتباه ونغمة واحدة مكتملة في معمل اللحن. والسؤال الذي يُصحَّح: ماذا عُدّ، وماذا لم يُعد. والطالب الذي يقول إن النغمات الثماني مؤلّف مدرَّب لم يتم الدرس."],
        labS: ["Read the eight-note tune and the four notes it writes next. Name one pitch it cannot invent.", "اقرأ لحن الثماني نغمات والنغمات الأربع التي يكتبها بعد ذلك. وسمِّ درجة لا يستطيع اختراعها."],
        labT: ["Students say, before the continuation appears, which pitch is allowed to follow E. Then they check.", "يقول الطلاب، قبل أن تظهر التكملة، أي درجة يجوز أن تتبع مي. ثم يتحققون."],
        q1: Q.attn, q2: Q.attnTf, q3: Q.attnM, q4: Q.attnO, cp: Q.attn,
        tomS: ["Write one sentence: what the melody lab counted, and what a GPU lab would still only be counting.", "اكتب جملة: ماذا عدّ معمل اللحن، وماذا سيظل معمل بطاقة الرسوم يعدّه فقط."],
        tomT: ["Put the attention lab and the melody lab side by side on one slide and ask which one looks back.", "ضع معمل الانتباه ومعمل اللحن جنبًا إلى جنب على شريحة واحدة واسأل أيهما ينظر إلى الوراء."],
        refS: ["What did the eight notes fail to be?", "ماذا فشلت النغمات الثماني أن تكون؟"],
        refT: ["Which claim will you not accept on a project poster?", "أي ادّعاء لن تقبله على ملصق مشروع؟"],
        projS: { prompt: ["Project: what was counted", "مشروع: ماذا عُدّ"], task: ["From the melody lab, list every pair of notes that occurred and the continuation. State one pair that never occurred.", "من معمل اللحن، اذكر كل زوج نغمات وقع والتكملة. واذكر زوجًا لم يقع قط."], give: ["The list and the missing pair.", "القائمة والزوج الغائب."], rubric: [["The missing pair is really absent.", "الزوج الغائب غائب فعلًا."], ["You do not call the result a composition.", "لا تسمّي النتيجة تأليفًا."]] },
        projT: { prompt: ["Project: two labs, one claim", "مشروع: معملان وادّعاء واحد"], task: ["Write the question you will mark: students must say what attention mixes and what the melody model counted.", "اكتب السؤال الذي ستصحّحه: يجب أن يقول الطلاب ماذا يخلط الانتباه وماذا عدّ نموذج اللحن."], give: ["The question and a model answer of five lines.", "السؤال وإجابة نموذجية من خمسة أسطر."], rubric: [["The answer separates mixing from understanding.", "الإجابة تفصل الخلط عن الفهم."], ["The eight notes are named as a toy.", "النغمات الثماني تُسمّى لعبة."]] },
        bullets: [["Look back", "انظر إلى الوراء"], [["Score, then mix", "قيّم ثم اخلط"], ["Add the original back", "أعد إضافة الأصل"]], ["Eight notes", "ثماني نغمات"], [["Counts, not hearing", "عدّ، لا سمع"], ["No pitch it never saw", "لا درجة لم يرها"]]],
        activity: ["In the lab", "في المعمل", [["Read the tune", "اقرأ اللحن"], ["Read the next four notes", "اقرأ النغمات الأربع التالية"]]],
        discuss: ["Ask", "اسأل", [["What was not counted?", "ماذا لم يُعد؟"]]],
        exit: ["Attention replaces which hope?", "الانتباه يستبدل بأي أمل؟"],
        note: ["University, 4", "الجامعة، ٤"],
      },
    ],
  },
];

/** Course 2 and 3 name questions by key and store `say` as line pairs. Course 1 already holds the objects. */
function resolve(spec) {
  const q = (k) => (typeof k === "string" ? Q[k] : k);
  const sayLines = Array.isArray(spec.say?.[0]) ? say(spec.say) : spec.say;
  return { ...spec, say: sayLines, q1: q(spec.q1), q2: q(spec.q2), q3: q(spec.q3), q4: q(spec.q4), cp: q(spec.cp ?? spec.q1) };
}

function pack(block, who) {
  const id = who === "students" ? block.idS : block.idT;
  const title = who === "students" ? block.titleS : block.titleT;
  const summary = who === "students" ? block.sumS : block.sumT;
  const specs = block.lessons.map(resolve);
  const lessons = specs.map((spec) => lesson({ ...spec, course: id }, who));
  const items = [Q.stack, Q.lossTf, Q.rnnO, Q.attnM, Q.grid, Q.detectTf, Q.vae, Q.genTf, Q.rl, Q.scale].slice(0, 10);
  // The check is per course: use the four lessons' questions, alternating, ten of them.
  const bank = specs.flatMap((spec) => [spec.q1, spec.q2, spec.q3]);
  const ten = [];
  const types = [];
  for (const q of bank) {
    if (ten.length === 10) break;
    if (types.at(-1) === q.type) continue;
    ten.push(q);
    types.push(q.type);
  }
  while (ten.length < 10) {
    const filler = items[ten.length % items.length];
    if (types.at(-1) !== filler.type) { ten.push(filler); types.push(filler.type); }
    else ten.push(tf(`pad${ten.length}`, ["This course comes after the previous one.", "هذا المقرر يأتي بعد السابق."], true, ["Take them in order.", "خذها بالترتيب."]));
  }
  lessons.push(check(id, title, ten.slice(0, 10), who));
  return unit({ id, audience: who === "students" ? "students" : undefined, title, summary }, lessons);
}

export function buildAll(blocks) {
  const units = [];
  for (const block of blocks) {
    units.push(pack(block, "students"));
    units.push(pack(block, "lecturers"));
  }
  return units;
}

// Course 2 and 3 lesson specs are in arch-courses-rest.mjs so this file stays readable.
const { rest } = await import("./arch-courses-rest.mjs");
const units = buildAll([...courses, ...rest]);
const dir = join(ROOT, "content/units");
for (const u of units) writeFileSync(join(dir, `${u.id}.json`), JSON.stringify(u, null, 2) + "\n");
const catalog = {
  version: 1,
  units: units.map((u) => ({
    id: u.id, track: u.track, level: u.level, title: u.title, summary: u.summary,
    lessons: u.lessons.length, sizeMB: 0.2, available: true, src: `/content/dev/${u.id}.json`,
    ...(u.audience ? { audience: u.audience } : {}),
    ...(u.teach ? { teach: u.teach } : {}),
  })),
};
const pub = join(ROOT, "apps/web/public/content");
mkdirSync(pub, { recursive: true });
writeFileSync(join(pub, "dev-catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(units.map((u) => u.id).join(" "));
