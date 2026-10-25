import json
F='../assets/fonts/'  # the design system's fonts folder
FONTS=f'''
@font-face{{font-family:"Baloo 2";src:url({F}baloo-2-latin-800-normal.woff2);font-weight:800}}
@font-face{{font-family:"Baloo 2";src:url({F}baloo-2-latin-700-normal.woff2);font-weight:700}}
@font-face{{font-family:"Baloo Bhaijaan 2";src:url({F}baloo-bhaijaan-2-arabic-800-normal.woff2);font-weight:800}}
@font-face{{font-family:"Baloo Bhaijaan 2";src:url({F}baloo-bhaijaan-2-arabic-700-normal.woff2);font-weight:700}}
@font-face{{font-family:"Noto Sans";src:url({F}noto-sans-latin-wght-normal.woff2);font-weight:100 900}}
@font-face{{font-family:"Noto Sans Arabic";src:url({F}noto-sans-arabic-arabic-wght-normal.woff2);font-weight:100 900}}
'''
MARK='<svg width="34" height="34" viewBox="0 0 64 64"><path d="M14 4h36a10 10 0 0 1 10 10v28a10 10 0 0 1-10 10H26l-12 9v-9a10 10 0 0 1-10-10V14A10 10 0 0 1 14 4z" fill="#ff6a2b"/><path d="M32 13c1.6 7.4 4.6 10.4 12 12-7.4 1.6-10.4 4.6-12 12-1.6-7.4-4.6-10.4-12-12 7.4-1.6 10.4-4.6 12-12z" fill="#ffc53d"/><circle cx="46" cy="40" r="4" fill="#1e1a33"/></svg>'
CSS=FONTS+'''
@page{size:A4;margin:14mm 15mm 16mm}
*{box-sizing:border-box}
body{margin:0;font-family:"Noto Sans","Noto Sans Arabic",sans-serif;font-size:10.5pt;line-height:1.5;color:#1e1a33}
[dir=rtl] body, body[dir=rtl]{line-height:1.75}
.page{page-break-after:always;position:relative;min-height:262mm}
.page:last-child{page-break-after:auto}
h1,h2,h3{font-family:"Baloo 2","Baloo Bhaijaan 2",sans-serif;margin:0;line-height:1.2}
h1{font-size:24pt;font-weight:800} h2{font-size:13pt;font-weight:800;margin:5mm 0 2mm} h3{font-size:11pt;font-weight:700}
.head{display:flex;align-items:center;gap:4mm;padding-bottom:3mm;border-bottom:1.2pt solid #1e1a33}
.head .meta{margin-inline-start:auto;text-align:end;font-size:8.5pt;color:#5c5470}
.track{display:inline-flex;align-items:center;gap:2mm;padding:1mm 3mm;border:1pt solid #1e1a33;border-radius:99px;font-size:8.5pt;font-weight:700;
 background:repeating-linear-gradient(45deg,#ffc53d 0 2mm,#fff0c4 2mm 4mm)}
.kicker{font-size:8.5pt;font-weight:700;color:#b43c0a;letter-spacing:0}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3mm;margin-top:4mm}
.box{border:1pt solid #8a7560;border-radius:3mm;padding:2.5mm 3mm}
.box b{display:block;font-size:8pt;color:#5c5470}
ol.steps{list-style:none;padding:0;margin:0;counter-reset:s}
ol.steps li{counter-increment:s;display:grid;grid-template-columns:9mm 1fr 16mm;gap:3mm;padding:2.5mm 0;border-bottom:.6pt dashed #c9b8a4}
ol.steps li:before{content:counter(s);display:grid;place-items:center;width:7mm;height:7mm;border-radius:50%;background:#1e1a33;color:#fff;font-weight:800;font-size:9pt}
ol.steps .t{font-weight:700;text-align:end;font-size:9pt;color:#5c5470}
.note{border:1pt solid #1e1a33;border-radius:3mm;padding:3mm 4mm;margin-top:4mm;background:#fff8ee}
.vocab{display:flex;flex-wrap:wrap;gap:2mm}
.vocab span{border:.8pt solid #8a7560;border-radius:2mm;padding:.5mm 2.5mm;font-size:9pt}
.foot{position:absolute;bottom:0;inset-inline:0;display:flex;justify-content:space-between;align-items:center;font-size:7.5pt;color:#5c5470;border-top:.6pt solid #c9b8a4;padding-top:2mm}
.qr{width:16mm;height:16mm;border:1pt dashed #8a7560;display:grid;place-items:center;font-size:6pt;text-align:center;color:#5c5470}
.fields{display:grid;grid-template-columns:2fr 1fr 1fr;gap:4mm;margin:4mm 0}
.fields div{border-bottom:1pt solid #1e1a33;padding-bottom:1mm;font-size:8.5pt;color:#5c5470}
.q{margin-top:5mm;break-inside:avoid}
.q h3{display:flex;gap:2mm;align-items:baseline}
.q h3 .n{display:inline-grid;place-items:center;width:6.5mm;height:6.5mm;border-radius:1.5mm;border:1.2pt solid #1e1a33;font-size:9pt}
.items{display:grid;grid-template-columns:repeat(3,1fr);gap:2.5mm;margin-top:2.5mm}
.items div{border:1pt solid #8a7560;border-radius:2.5mm;padding:3mm;text-align:center;font-weight:600}
.match{display:grid;grid-template-columns:1fr 20mm 1fr;row-gap:2.5mm;margin-top:2.5mm;align-items:center}
.match .l,.match .r{border:1pt solid #8a7560;border-radius:2.5mm;padding:2mm 3mm}
.match .dot{text-align:center;color:#8a7560;letter-spacing:2pt}
.order{display:grid;gap:2mm;margin-top:2.5mm}
.order div{display:flex;gap:3mm;align-items:center}
.order i{display:inline-block;width:8mm;height:8mm;border:1.2pt solid #1e1a33;border-radius:1.5mm;flex:none}
.lines{margin-top:2mm}
.lines div{height:8.5mm;border-bottom:.8pt solid #8a7560}
.lbl{font-size:9pt;font-weight:700;margin-top:3mm}
[dir=rtl] ol.steps li:before{content:counter(s,arabic-indic)}
'''
def doc(lang, d):
    rtl = lang=='ar'
    steps=''.join(f'<li><div><h3>{s[0]}</h3><div>{s[1]}</div></div><span class="t">{s[2]}</span></li>' for s in d['steps'])
    items=''.join(f'<div>{x}</div>' for x in d['items'])
    match=''.join(f'<div class="l">{a}</div><div class="dot">• • • • •</div><div class="r">{b}</div>' for a,b in d['match'])
    order=''.join(f'<div><i></i><span>{x}</span></div>' for x in d['order'])
    vocab=''.join(f'<span>{v}</span>' for v in d['vocab'])
    foot=f'<div class="foot"><span>{MARK.replace("34","16")} &nbsp;{d["foot"]}</span><div class="qr">{d["qr"]}</div></div>'
    head=lambda kicker,title: f'<div class="head">{MARK}<div><div class="kicker">{kicker}</div><h1>{title}</h1></div><div class="meta"><span class="track">{d["track"]}</span><br>{d["unit"]}</div></div>'
    p1=f'''<section class="page">{head(d["k1"],d["t1"])}
<div class="grid"><div class="box"><b>{d["l_time"]}</b>{d["time"]}</div><div class="box"><b>{d["l_age"]}</b>{d["age"]}</div><div class="box"><b>{d["l_mat"]}</b>{d["mat"]}</div></div>
<h2>{d["l_goal"]}</h2><div>{d["goal"]}</div>
<h2>{d["l_steps"]}</h2><ol class="steps">{steps}</ol>
<h2>{d["l_vocab"]}</h2><div class="vocab">{vocab}</div>
<div class="note"><h3>{d["l_tip"]}</h3><div>{d["tip"]}</div></div>{foot}</section>'''
    p2=f'''<section class="page">{head(d["k2"],d["t2"])}
<div class="fields"><div>{d["f_name"]}</div><div>{d["f_class"]}</div><div>{d["f_date"]}</div></div>
<div class="q"><h3><span class="n">{d.get("n1","1")}</span>{d["q1"]}</h3><div class="items">{items}</div></div>
<div class="q"><h3><span class="n">{d.get("n2","2")}</span>{d["q2"]}</h3><div class="match">{match}</div></div>
<div class="q"><h3><span class="n">{d.get("n3","3")}</span>{d["q3"]}</h3><div class="order">{order}</div></div>
<div class="q"><h3><span class="n">{d.get("n4","4")}</span>{d["q4"]}</h3><div class="lbl">{d["q4a"]}</div><div class="lines"><div></div><div></div></div><div class="lbl">{d["q4b"]}</div><div class="lines"><div></div><div></div></div></div>
{foot}</section>'''
    return f'<!doctype html><html lang="{lang}" dir="{"rtl" if rtl else "ltr"}"><head><meta charset="utf-8"><title>{d["t1"]}</title><style>{CSS}</style></head><body>{p1}{p2}</body></html>'

EN=dict(track="AI · Level 1",unit="Unit 1 · Lesson 1",k1="Lesson plan · for the teacher",t1="Is it AI?",k2="Worksheet · for pupils",t2="Is it AI?",
 l_time="Time",time="45 minutes",l_age="Ages",age="10–15 (adaptable)",l_mat="Materials",mat="Board, chalk, 12 paper cards. No devices or electricity needed.",
 l_goal="Learning goal",goal="Pupils can explain that AI learns patterns from examples, and can tell AI tools apart from ordinary machines.",
 l_steps="Steps",steps=[("Warm-up: calculator or assistant?","Ask: “What can a calculator do? What can a phone assistant do?” List answers in two columns on the board.","5 min"),
 ("Human or machine?","Read 6 short sentences aloud. Pupils stand up if they think a machine wrote it. Discuss: how could a machine learn to write like that?","10 min"),
 ("Unplugged game: teach the machine","One pupil is “the model”. Show 8 cards labelled “fruit” or “not fruit”. Then show 4 new unlabelled cards — the model must guess. Discuss wrong guesses: were the examples enough?","20 min"),
 ("Exit ticket","Pupils complete question 4 of the worksheet and hand it in.","10 min")],
 l_vocab="Key words",vocab=["artificial intelligence (AI)","data","example","pattern","prediction","model"],
 l_tip="Try this tomorrow",tip="Keep the cards. In the next lesson, give the “model” only examples of red fruit and ask it about a green apple. This shows how biased examples cause wrong answers.",
 foot="Darsi classroom kit · free to copy for your school",qr="QR · lesson video",
 f_name="Name",f_class="Class",f_date="Date",q1="Circle the things that use AI.",items=["Calculator","Voice assistant on a phone","Light switch","Translation app","Bicycle","Spam filter in email"],
 q2="Match each word to its meaning.",match=[("Data","Information a computer can use"),("Pattern","Something that repeats in a predictable way"),("Prediction","A guess based on what was learned")],
 q3="Put the steps in order (write 1–4 in the boxes).",order=["The model makes a guess about something new","We collect many examples","We check if the guess is right","The model looks for patterns in the examples"],
 q4="Your turn",q4a="One way AI could help in our school:",q4b="One thing we should be careful about:")
AR=dict(n1="١",n2="٢",n3="٣",n4="٤",track="الذكاء الاصطناعي — المستوى ١",unit="الوحدة ١، الدرس ١",k1="خطة درس — للمعلم",t1="هل هذا ذكاء اصطناعي؟",k2="ورقة عمل — للطلاب",t2="هل هذا ذكاء اصطناعي؟",
 l_time="المدة",time="٤٥ دقيقة",l_age="الأعمار",age="١٠–١٥ (قابلة للتكييف)",l_mat="المواد",mat="سبّورة، طباشير، ١٢ بطاقة ورقية. لا حاجة إلى أجهزة أو كهرباء.",
 l_goal="هدف التعلّم",goal="يشرح الطلاب أن الذكاء الاصطناعي يتعلّم الأنماط من الأمثلة، ويميّزون بين أدواته والآلات العادية.",
 l_steps="الخطوات",steps=[("تمهيد: آلة حاسبة أم مساعد ذكي؟","اسأل: «ماذا تفعل الآلة الحاسبة؟ وماذا يفعل المساعد الصوتي في الهاتف؟» واكتب الإجابات في عمودين.","٥ د"),
 ("إنسان أم آلة؟","اقرأ ست جمل قصيرة. يقف الطلاب إذا ظنّوا أن آلة كتبتها. ناقش: كيف يمكن لآلة أن تتعلّم الكتابة هكذا؟","١٠ د"),
 ("لعبة دون أجهزة: علّم الآلة","طالب واحد هو «النموذج». اعرض ٨ بطاقات مكتوب عليها «فاكهة» أو «ليست فاكهة»، ثم ٤ بطاقات جديدة دون تسمية ليخمّن. ناقشوا الأخطاء: هل كانت الأمثلة كافية؟","٢٠ د"),
 ("بطاقة الخروج","يجيب الطلاب عن السؤال ٤ في ورقة العمل ويسلّمونها.","١٠ د")],
 l_vocab="كلمات أساسية",vocab=["الذكاء الاصطناعي","البيانات","مثال","نمط","توقّع","نموذج"],
 l_tip="جرّبها غدًا",tip="احتفظ بالبطاقات. في الدرس التالي أعطِ «النموذج» أمثلة لفواكه حمراء فقط، ثم اسأله عن تفاحة خضراء. هكذا يرى الطلاب كيف تسبّب الأمثلة المنحازة إجابات خاطئة.",
 foot="حقيبة درسي الصفّية — يُسمح بنسخها لمدرستك مجانًا",qr="رمز QR لفيديو الدرس",
 f_name="الاسم",f_class="الصف",f_date="التاريخ",q1="ضع دائرة حول الأشياء التي تستخدم الذكاء الاصطناعي.",items=["آلة حاسبة","مساعد صوتي في الهاتف","مفتاح الإضاءة","تطبيق ترجمة","دراجة","فلتر الرسائل المزعجة"],
 q2="صِل كل كلمة بمعناها.",match=[("البيانات","معلومات يستطيع الحاسوب استخدامها"),("النمط","شيء يتكرّر بطريقة يمكن توقّعها"),("التوقّع","تخمين مبنيّ على ما تعلّمه النموذج")],
 q3="رتّب الخطوات (اكتب ١–٤ في المربعات).",order=["يخمّن النموذج شيئًا جديدًا","نجمع أمثلة كثيرة","نتحقّق من صحة التخمين","يبحث النموذج عن الأنماط في الأمثلة"],
 q4="دورك",q4a="طريقة يمكن أن يساعد بها الذكاء الاصطناعي مدرستنا:",q4b="شيء يجب أن ننتبه له:")
open('en.html','w').write(doc('en',EN)); open('ar.html','w').write(doc('ar',AR))
