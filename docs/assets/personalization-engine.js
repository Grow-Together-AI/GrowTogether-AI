/**
 * Grow Together AI — Deterministic Personalization Engine
 * ---------------------------------------------------------------------------
 * Pure, framework-agnostic, dependency-free JS. No network calls, no LLM APIs,
 * no external DB, no persistent storage. Everything here is a pure function of
 * the profile object passed in — same input always produces the same output.
 *
 * Pipeline (mirrors the required architecture):
 *   Child Profile
 *     -> CaseAnalyzer            (free-text concern -> scored need signals)
 *     -> DevelopmentalAnalyzer   (age -> developmental band + framing)
 *     -> NeedsPriorityEngine     (signals + age/grade/strengths -> ranked needs)
 *     -> KnowledgeBase           (static, structured activity/guidance/evidence data)
 *     -> PlanSelector            (scored matching -> 7-day plan, NOT random)
 *     -> GuidanceSelector        (ranked needs -> parent guidance categories)
 *     -> EvidenceSelector        (domains actually used -> deduped citations)
 *     -> ReferralEngine          (severity heuristic -> optional soft referral)
 *   -> generatePersonalizedPlan() assembles ONE plan object — the single
 *      source of truth consumed by both the results view and the report.
 *
 * Exposed as `window.GTPersonalization` for the static docs/index.html prototype
 * (no bundler is present there), and also as a CommonJS export so it can be
 * unit-tested under Node and later imported as-is into web/src/lib/assessment/.
 */
(function (root) {
  "use strict";

  /* =====================================================================
   * 1. CASE TAXONOMY — 21 developmental/support domains.
   *    Each has a bilingual keyword lexicon used for lightweight, explainable
   *    scoring (NOT a diagnosis — pattern/keyword matching for triage only).
   *    Keywords are deliberately short phrases; matching is substring-based
   *    on normalized (lowercased) text, with simple negation suppression.
   * ===================================================================== */
  const NEED_DOMAINS = [
    { id: "attention", en: "Attention & Focus", ar: "الانتباه والتركيز",
      kwEn: ["focus", "attention span", "can't concentrate", "distract", "zoning out", "attention"],
      kwAr: ["تركيز", "انتباه", "تشتت", "لا يستطيع التركيز"] },
    { id: "executiveFunction", en: "Executive Function", ar: "المهارات التنفيذية",
      kwEn: ["organiz", "plan ahead", "forgets instructions", "loses things", "time management", "multi-step"],
      kwAr: ["تنظيم", "تخطيط", "ينسى التعليمات", "يفقد أغراضه", "إدارة الوقت"] },
    { id: "emotionalRegulation", en: "Emotional Regulation", ar: "التنظيم العاطفي",
      kwEn: ["tantrum", "meltdown", "big emotions", "mood swing", "cries easily", "overwhelmed", "big feelings",
             "gets angry", "angry and frustrated", "calming down", "gives up when losing", "cries or gives up",
             "upset easily", "loses control", "hard time calming"],
      kwAr: ["نوبة غضب", "انهيار", "مشاعر قوية", "تقلب مزاج", "يبكي بسهولة", "يغضب", "يفقد السيطرة"] },
    { id: "anxiety", en: "Anxiety & Fears", ar: "القلق والمخاوف",
      kwEn: ["anxious", "anxiety", "worry", "worried", "scared", "afraid", "fear", "panic", "nervous", "worried about"],
      kwAr: ["قلق", "خوف", "توتر", "خائف", "فزع", "قلقة"] },
    { id: "socialSkills", en: "Social Skills", ar: "المهارات الاجتماعية",
      kwEn: ["social", "doesn't share", "turn-taking", "interrupt", "reading social cues",
             "initiate conversation", "initiate conversations", "speaking in groups", "avoids speaking",
             "hesitant to talk", "hesitant to initiate"],
      kwAr: ["اجتماعي", "لا يشارك", "دوره", "يقاطع", "التحدث في مجموعات", "بدء حديث"] },
    { id: "peerRelationships", en: "Peer Relationships", ar: "علاقات الأقران",
      kwEn: ["friend", "no friends", "bully", "left out", "isolated", "withdraw", "with peers", "talk to peers", "conversations with peers"],
      kwAr: ["صديق", "بلا أصدقاء", "تنمر", "مستبعد", "منعزل", "مع الأقران"] },
    { id: "confidence", en: "Confidence & Self-Esteem", ar: "الثقة وتقدير الذات",
      kwEn: ["confidence", "self-esteem", "insecure", "shy", "self-doubt", "doesn't believe in",
             "hesitant", "worried about making mistakes", "afraid of making mistakes", "afraid to try"],
      kwAr: ["ثقة", "تقدير الذات", "خجول", "غير واثق", "متردد", "خائف من الخطأ"] },
    { id: "communication", en: "Communication", ar: "التواصل",
      kwEn: ["speech", "stutter", "articulat", "expressing himself", "expressing herself", "vocabulary", "not talking"],
      kwAr: ["نطق", "تلعثم", "كلام", "يعبر عن نفسه", "مفردات"] },
    { id: "reading", en: "Reading & Language", ar: "القراءة واللغة",
      kwEn: ["read", "reading", "spelling", "dyslexi", "letters", "phonics"],
      kwAr: ["قراءة", "إملاء", "حروف"] },
    { id: "behavior", en: "Behavior & Cooperation", ar: "السلوك والتعاون",
      kwEn: ["disobedien", "won't listen", "defiant", "argues", "refuses", "acting out"],
      kwAr: ["عصيان", "لا يستمع", "يجادل", "يرفض"] },
    { id: "frustrationTolerance", en: "Frustration Tolerance", ar: "تحمل الإحباط",
      kwEn: ["frustrat", "gives up easily", "low tolerance", "quits quickly"],
      kwAr: ["إحباط", "يستسلم بسرعة"] },
    { id: "independence", en: "Independence", ar: "الاستقلالية",
      kwEn: ["independen", "relies on us", "needs help with everything", "can't do it alone"],
      kwAr: ["استقلالية", "يعتمد علينا", "يحتاج مساعدة بكل شيء"] },
    { id: "dailyRoutines", en: "Daily Routines", ar: "الروتين اليومي",
      kwEn: ["routine", "morning struggle", "bedtime struggle", "transitions are hard"],
      kwAr: ["روتين", "صعوبة الصباح", "صعوبة وقت النوم"] },
    { id: "sleep", en: "Sleep", ar: "النوم",
      kwEn: ["sleep", "insomnia", "nightmare", "won't go to bed", "wakes up at night"],
      kwAr: ["نوم", "أرق", "كوابيس", "لا ينام"] },
    { id: "screenUse", en: "Screen Use", ar: "استخدام الشاشات",
      kwEn: ["screen", "tablet", "video game", "youtube", "too much tv"],
      kwAr: ["شاشة", "جوال", "ألعاب فيديو", "تلفاز"] },
    { id: "motivation", en: "Motivation", ar: "الدافعية",
      kwEn: ["unmotivated", "no motivation", "doesn't care", "apathetic"],
      kwAr: ["غير متحمس", "لا يهتم"] },
    { id: "responsibility", en: "Responsibility", ar: "المسؤولية",
      kwEn: ["responsib", "chores", "doesn't follow through", "forgets duties"],
      kwAr: ["مسؤولية", "واجبات منزلية", "لا يلتزم"] },
    { id: "problemSolving", en: "Problem Solving", ar: "حل المشكلات",
      kwEn: ["problem solving", "figuring things out", "stuck easily", "won't try another way"],
      kwAr: ["حل المشكلات", "يعلق بسهولة"] },
    { id: "resilience", en: "Resilience", ar: "المرونة النفسية",
      kwEn: ["bounce back", "takes failure hard", "can't handle losing", "gives up on"],
      kwAr: ["لا يتقبل الخسارة", "يتأثر بالفشل بشدة"] },
    { id: "creativity", en: "Creativity & Imagination", ar: "الإبداع والخيال",
      kwEn: ["creativ", "imagination", "art", "drawing"],
      kwAr: ["إبداع", "خيال", "رسم"] },
    { id: "empathy", en: "Empathy & Kindness", ar: "التعاطف واللطف",
      kwEn: ["empath", "doesn't consider others", "selfish", "caring for others"],
      kwAr: ["تعاطف", "أناني"] },
  ];
  const DOMAIN_BY_ID = Object.fromEntries(NEED_DOMAINS.map((d) => [d.id, d]));

  // Positive/asset-framed lexicon — used to detect STRENGTHS, not concerns.
  // Kept separate from NEED_DOMAINS keywords so "confident" never scores as a
  // concern for "confidence" and vice versa.
  const STRENGTH_LEXICON = [
    { domain: "confidence", kwEn: ["confiden", "brave", "leader", "bold"], kwAr: ["ثقة", "قيادة", "جرأة"] },
    { domain: "creativity", kwEn: ["creativ", "artistic", "imagin", "draws well"], kwAr: ["إبداع", "فن", "خيال"] },
    { domain: "empathy", kwEn: ["kind", "empath", "caring", "gentle"], kwAr: ["لطيف", "تعاطف", "رحيم"] },
    { domain: "problemSolving", kwEn: ["curious", "smart", "clever", "great memory"], kwAr: ["فضول", "ذكي", "ذاكرة قوية"] },
    { domain: "resilience", kwEn: ["persistent", "determined", "doesn't give up"], kwAr: ["مثابر", "مصمم"] },
  ];

  const NEGATORS_EN = ["not", "no ", "never", "isn't", "doesn't seem", "without"];
  const NEGATORS_AR = ["لا ", "ليس", "غير", "بدون"];

  /* =====================================================================
   * 2. CASE ANALYZER — free text -> scored domain signals.
   *    Score = number of distinct matched keywords per domain (capped),
   *    with a match discarded if a negator appears immediately before it
   *    (small window) in the same language — reduces false positives like
   *    "not anxious" being scored as an anxiety concern.
   * ===================================================================== */
  function normalize(text) {
    return (text || "").toLowerCase();
  }

  function isNegated(text, index, negators) {
    const windowStart = Math.max(0, index - 18);
    const before = text.slice(windowStart, index);
    return negators.some((n) => before.includes(n));
  }

  function scoreLexiconAgainstText(text, kwEn, kwAr) {
    let score = 0;
    const matched = [];
    [
      { list: kwEn, negators: NEGATORS_EN },
      { list: kwAr, negators: NEGATORS_AR },
    ].forEach(({ list, negators }) => {
      (list || []).forEach((kw) => {
        const idx = text.indexOf(kw);
        if (idx !== -1 && !isNegated(text, idx, negators)) {
          score += 2; // uniform weight per distinct matched phrase
          matched.push(kw);
        }
      });
    });
    return { score: Math.min(score, 6), matched }; // cap so one field can't dominate
  }

  /**
   * CaseAnalyzer(profile) -> { concernSignals: [{domain, score, matched}], strengthSignals: [...] }
   * Considers ALL free text the parent entered (concern + any extra context
   * fields the caller supplies), never a single field in isolation.
   */
  function CaseAnalyzer(profile) {
    const text = normalize(profile.concernText);
    const strengthsText = normalize(profile.strengthsText || (profile.strengths || []).join(", "));

    const concernSignals = NEED_DOMAINS
      .map((d) => {
        const { score, matched } = scoreLexiconAgainstText(text, d.kwEn, d.kwAr);
        return { domain: d.id, score, matched };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const strengthSignals = STRENGTH_LEXICON
      .map((s) => {
        const { score, matched } = scoreLexiconAgainstText(strengthsText, s.kwEn, s.kwAr);
        return { domain: s.domain, score, matched };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    // Explicit urgent-language overlay — independent of domain scoring, used
    // only by the ReferralEngine, never surfaced as a diagnosis.
    const urgentEn = ["severe", "constant tantrum", "hurt himself", "hurt herself", "self-harm", "not talking at all", "lost a skill", "regressed"];
    const urgentAr = ["شديد", "يؤذي نفسه", "لا يتحدث إطلاقًا", "فقد مهارة", "تراجع في النمو"];
    const urgentFlag = urgentEn.some((k) => text.includes(k)) || urgentAr.some((k) => text.includes(k));

    return { concernSignals, strengthSignals, urgentFlag };
  }

  /* =====================================================================
   * 3. DEVELOPMENTAL ANALYZER — age -> band + plain-language framing.
   * ===================================================================== */
  const BAND_TEXT = {
    en: {
      "6-7": "forming early friendships, building foundational reading and number skills, and learning to follow classroom routines",
      "8-9": "strengthening logical thinking, growing more stable friendships, and becoming more independent with schoolwork",
      "10-12": "developing abstract thinking, valuing peer belonging more strongly, and taking on greater responsibility at home and school",
    },
    ar: {
      "6-7": "تكوين صداقات أولى، واكتساب مهارات القراءة والحساب الأساسية، وتعلّم اتباع روتين الصف",
      "8-9": "تعزيز التفكير المنطقي، وتكوين صداقات أكثر استقرارًا، واكتساب استقلالية أكبر في الواجبات المدرسية",
      "10-12": "تطور التفكير المجرد، وازدياد أهمية الانتماء لمجموعة الأقران، وتحمّل مسؤوليات أكبر في المنزل والمدرسة",
    },
  };
  function DevelopmentalAnalyzer(profile) {
    const age = profile.age;
    const band = age <= 7 ? "6-7" : age <= 9 ? "8-9" : "10-12";
    return { band, textEn: BAND_TEXT.en[band], textAr: BAND_TEXT.ar[band] };
  }

  /* =====================================================================
   * 4. NEEDS / PRIORITY ENGINE — combines concern signals with age/grade
   *    context so the concern field never solely determines the plan.
   *    Always guarantees at least 2 priorities so the plan is never empty.
   * ===================================================================== */
  function NeedsPriorityEngine(caseSignals, devInfo, profile) {
    let priorities = caseSignals.concernSignals.map((s) => s.domain);

    // Ambient, age/grade-derived needs (small, deterministic influence) —
    // ensures age/grade/strengths participate even with a thin concern field.
    if (priorities.length < 2) {
      if (profile.age <= 7) priorities.push("dailyRoutines");
      else if (profile.age >= 10) priorities.push("independence");
      else priorities.push("responsibility");
    }
    if (priorities.length < 2) priorities.push("socialSkills");

    priorities = Array.from(new Set(priorities)).slice(0, 5);
    return { priorities, strengths: caseSignals.strengthSignals.map((s) => s.domain) };
  }

  /* =====================================================================
   * 5. KNOWLEDGE BASE — structured activities, one core activity per domain
   *    (21), plus deep interest-adaptation variants for the 6 domains most
   *    commonly flagged in practice. This is intentionally the layer to
   *    extend with more content later (see "Limitations" in the audit reply).
   * ===================================================================== */
  const INTEREST_SYNONYMS = {
    art: ["draw", "art", "paint", "colour", "color", "رسم", "فن"],
    sport: ["football", "soccer", "sport", "basketball", "swim", "run", "كرة", "رياضة", "سباحة"],
    music: ["music", "sing", "instrument", "موسيقى", "غناء"],
    reading: ["read", "book", "story", "قراءة", "كتاب", "قصة"],
    building: ["lego", "build", "block", "robot", "مكعبات", "بناء", "روبوت"],
  };
  function canonicalInterestTags(interests) {
    const raw = (interests || []).map((i) => normalize(i));
    const tags = new Set();
    raw.forEach((word) => {
      let matched = false;
      Object.entries(INTEREST_SYNONYMS).forEach(([tag, syns]) => {
        if (syns.some((s) => word.includes(s))) { tags.add(tag); matched = true; }
      });
      if (!matched && word) tags.add(word); // keep the raw word as its own tag too
    });
    return Array.from(tags);
  }

  function act(id, domain, ageRange, title, goal, materials, duration, difficultyBase, parentInstructions, expectedOutcome, opts) {
    opts = opts || {};
    return {
      id, targetNeeds: [domain, ...(opts.secondaryDomains || [])], ageRange, title, goal, materials,
      duration, difficultyBase, parentInstructions, expectedOutcome,
      strengthsSupported: opts.strengthsSupported || [], tags: opts.tags || [],
      evidenceTag: opts.evidenceTag || domain,
      interestAdaptations: opts.interestAdaptations || [],
    };
  }

  const KNOWLEDGE_BASE = [
    act("attn-01", "attention", [6, 12],
      { en: "Focus Sprint Puzzle", ar: "لغز التركيز السريع" },
      { en: "Build sustained attention in short, successful bursts", ar: "بناء الانتباه المستمر على فترات قصيرة وناجحة" },
      { en: "A jigsaw or shape puzzle", ar: "لغز صور أو أشكال" },
      { min: 10, max: 15 }, "easy",
      { en: "Start with 2 short sessions a day; stop while it's still fun and build up gradually.", ar: "ابدآ بجلستين قصيرتين يوميًا وتوقفا قبل الملل، ثم زيدا تدريجيًا." },
      { en: "Longer stretches of focused, self-directed attention.", ar: "فترات أطول من التركيز الذاتي." },
      { tags: ["building", "art"], strengthsSupported: ["problemSolving"],
        interestAdaptations: [
          { matchTags: ["art"], title: { en: "Focus Sprint: Detailed Drawing", ar: "لغز التركيز: رسم تفصيلي" }, materials: { en: "Paper and a fine-tip pen for a detailed drawing", ar: "ورقة وقلم رفيع لرسم تفصيلي" }, parentInstructions: { en: "Ask for one small added detail every few minutes to stretch focus gently.", ar: "اطلب إضافة تفصيل صغير كل بضع دقائق لتمديد التركيز بلطف." } },
          { matchTags: ["sport"], title: { en: "Focus Sprint: Target Practice", ar: "لغز التركيز: تدريب الهدف" }, materials: { en: "A ball and a marked target (hoop, cone, or wall spot)", ar: "كرة وهدف محدد (طوق أو مخروط أو علامة على الحائط)" }, parentInstructions: { en: "Count consecutive focused attempts together instead of just total score.", ar: "عدّا المحاولات المركّزة المتتالية معًا بدلًا من النتيجة الإجمالية فقط." } },
        ] }),
    act("exec-01", "executiveFunction", [6, 12],
      { en: "Step-by-Step Task Card", ar: "بطاقة المهمة خطوة بخطوة" },
      { en: "Practice breaking a task into an ordered checklist", ar: "التدرب على تقسيم مهمة إلى قائمة مرتبة" },
      { en: "Index cards or sticky notes", ar: "بطاقات صغيرة أو ملاحظات لاصقة" },
      { min: 10, max: 20 }, "medium",
      { en: "Write each step on its own card; let your child physically move cards from 'to do' to 'done'.", ar: "اكتب كل خطوة على بطاقة منفصلة ودع طفلك ينقلها من 'للقيام به' إلى 'تم'." },
      { en: "A visible, repeatable system for multi-step tasks.", ar: "نظام واضح وقابل للتكرار للمهام متعددة الخطوات." },
      { tags: ["building"], strengthsSupported: ["problemSolving"] }),
    act("emo-01", "emotionalRegulation", [6, 12],
      { en: "Feelings Check-In", ar: "تسجيل المشاعر" },
      { en: "Build emotional awareness and naming before things escalate", ar: "بناء الوعي العاطفي وتسمية المشاعر قبل تصاعدها" },
      { en: "A simple feelings chart or short list of feeling words", ar: "لوحة مشاعر بسيطة أو قائمة كلمات مشاعر" },
      { min: 5, max: 10 }, "easy",
      { en: "Do this at a calm moment, not mid-meltdown — the goal is practice, not correction.", ar: "مارسا هذا في لحظة هدوء وليس أثناء انفعال — الهدف هو التدريب لا التصحيح." },
      { en: "Faster, calmer naming of emotions in the moment.", ar: "تسمية أسرع وأهدأ للمشاعر في حينها." },
      { tags: ["art"], strengthsSupported: ["empathy"],
        interestAdaptations: [
          { matchTags: ["art"], title: { en: "Feelings Face Drawing", ar: "رسم وجوه المشاعر" }, materials: { en: "Paper and colored pencils to draw today's feeling as a face or color", ar: "ورقة وأقلام ملونة لرسم شعور اليوم كوجه أو لون" }, parentInstructions: { en: "Ask your child to draw the feeling before naming it in words — drawing first often unlocks the word.", ar: "اطلب من طفلك رسم الشعور قبل تسميته بالكلمات — الرسم أولًا غالبًا يسهّل إيجاد الكلمة." } },
          { matchTags: ["sport"], title: { en: "Feelings Energy Match", ar: "مطابقة طاقة المشاعر" }, materials: { en: "Open space to physically act out how the feeling 'moves' (stomping, slow walking, jumping)", ar: "مساحة مفتوحة لتمثيل كيف 'يتحرك' الشعور جسديًا (الدوس، المشي البطيء، القفز)" }, parentInstructions: { en: "Let big feelings move through the body first, then name them once the energy settles.", ar: "دع المشاعر الكبيرة تتحرك عبر الجسد أولًا، ثم سمِّها بعد أن تهدأ الطاقة." } },
        ] }),
    act("anx-01", "anxiety", [6, 12],
      { en: "Worry Jar", ar: "وعاء القلق" },
      { en: "Externalize worries in a safe, contained way", ar: "تفريغ القلق بطريقة آمنة ومحتواة" },
      { en: "A jar and small paper slips", ar: "وعاء وأوراق صغيرة" },
      { min: 5, max: 10 }, "easy",
      { en: "Revisit the jar together once a week, not daily — daily review can reinforce worry.", ar: "راجعا الوعاء معًا أسبوعيًا وليس يوميًا — المراجعة اليومية قد تعزز القلق." },
      { en: "A concrete outlet that reduces worry rumination.", ar: "منفذ ملموس يقلل من اجترار القلق." },
      { tags: [], strengthsSupported: ["creativity"] }),
    act("soc-01", "socialSkills", [6, 12],
      { en: "Turn-Taking Game", ar: "لعبة التناوب" },
      { en: "Practice patience and cooperative play", ar: "التدرب على الصبر واللعب التعاوني" },
      { en: "Any simple board or card game", ar: "أي لعبة لوحية أو ورقية بسيطة" },
      { min: 15, max: 25 }, "easy",
      { en: "Narrate turn-taking out loud the first few times ('my turn, now your turn').", ar: "عبّر بصوت مسموع عن التناوب في المرات الأولى ('دوري، الآن دورك')." },
      { en: "Smoother turn-taking with peers and siblings.", ar: "تناوب أكثر سلاسة مع الأقران والإخوة." },
      { tags: ["sport", "building"], strengthsSupported: [] }),
    act("peer-01", "peerRelationships", [6, 12],
      { en: "Playdate Practice Script", ar: "بروفة موعد لعب" },
      { en: "Rehearse starting a conversation with a peer", ar: "التدرب على بدء حديث مع صديق" },
      { en: "None — just a few minutes of role-play", ar: "لا شيء — فقط بضع دقائق من التمثيل" },
      { min: 10, max: 15 }, "medium",
      { en: "Role-play both sides so it feels like a game, not a lesson.", ar: "مثّلا كلا الدورين ليبدو الأمر كلعبة لا درسًا." },
      { en: "More confidence initiating contact with peers.", ar: "ثقة أكبر في بدء التواصل مع الأقران." },
      { tags: [], strengthsSupported: ["confidence"] }),
    act("conf-01", "confidence", [6, 12],
      { en: "Proud Moment Journal", ar: "مذكرات لحظة الفخر" },
      { en: "Reinforce a growing sense of self-confidence", ar: "تعزيز الشعور المتنامي بالثقة بالنفس" },
      { en: "A small notebook", ar: "دفتر صغير" },
      { min: 5, max: 10 }, "easy",
      { en: "Write it together at first, then let your child take over the pen.", ar: "اكتبا معًا في البداية ثم دع طفلك يتولى الكتابة." },
      { en: "A growing, self-referenced record of accomplishment.", ar: "سجل متنامٍ للإنجازات الشخصية." },
      { tags: [], strengthsSupported: ["confidence"],
        interestAdaptations: [
          { matchTags: ["art"], title: { en: "Proud Moment Sketchbook", ar: "دفتر رسم لحظة الفخر" }, materials: { en: "A sketchbook to draw the proud moment instead of writing it", ar: "دفتر رسم لرسم لحظة الفخر بدلًا من كتابتها" } },
        ] }),
    act("comm-01", "communication", [6, 12],
      { en: "Storytelling Turn", ar: "دور رواية القصص" },
      { en: "Build expressive vocabulary and sentence confidence", ar: "بناء مفردات تعبيرية وثقة في تكوين الجمل" },
      { en: "None", ar: "لا شيء" },
      { min: 10, max: 15 }, "easy",
      { en: "Take turns adding one sentence each to a shared silly story — no correcting mid-story.", ar: "تناوبا إضافة جملة واحدة لقصة مشتركة مضحكة — دون تصحيح أثناء السرد." },
      { en: "More comfort speaking at length without self-consciousness.", ar: "راحة أكبر في التحدث لفترة أطول دون خجل." },
      { tags: ["reading"], strengthsSupported: [] }),
    act("read-01", "reading", [6, 12],
      { en: "Read-Aloud & Retell", ar: "القراءة بصوت عالٍ وإعادة السرد" },
      { en: "Strengthen comprehension and vocabulary", ar: "تعزيز الفهم والمفردات" },
      { en: "A favorite picture or chapter book", ar: "كتاب مصور أو قصة مفضلة" },
      { min: 15, max: 20 }, "easy",
      { en: "Ask 'what happened next?' instead of quiz-style questions.", ar: "اسأل 'ماذا حدث بعد ذلك؟' بدلًا من أسئلة الاختبار." },
      { en: "Better recall and willingness to read for enjoyment.", ar: "تذكر أفضل ورغبة أكبر في القراءة للمتعة." },
      { tags: ["reading"], strengthsSupported: [] }),
    act("beh-01", "behavior", [6, 12],
      { en: "Two Clear Choices", ar: "خياران واضحان" },
      { en: "Reduce power struggles by offering bounded choice", ar: "تقليل الصراعات عبر تقديم خيارات محدودة" },
      { en: "None", ar: "لا شيء" },
      { min: 5, max: 10 }, "easy",
      { en: "Offer exactly two acceptable options rather than an open-ended demand.", ar: "قدّم خيارين مقبولين فقط بدلًا من طلب مفتوح." },
      { en: "Fewer confrontations over daily requests.", ar: "مواجهات أقل حول الطلبات اليومية." },
      { tags: [], strengthsSupported: [] }),
    act("frus-01", "frustrationTolerance", [6, 12],
      { en: "Try-Three-Ways Challenge", ar: "تحدي المحاولة بثلاث طرق" },
      { en: "Build tolerance for a task not working the first time", ar: "بناء تحمل لعدم نجاح المهمة من أول محاولة" },
      { en: "Any puzzle, game, or building task with a fixable setback", ar: "أي لغز أو لعبة أو مهمة بناء يمكن تعديلها" },
      { min: 10, max: 20 }, "medium",
      { en: "Coach 'that's one way that didn't work — what's another?' instead of solving it for them.", ar: "وجّه بقول 'هذه طريقة لم تنجح — ما طريقة أخرى؟' بدلًا من الحل نيابة عنه." },
      { en: "More persistence before asking for help or quitting.", ar: "مثابرة أكبر قبل طلب المساعدة أو الاستسلام." },
      { tags: ["building"], strengthsSupported: ["resilience"] }),
    act("indep-01", "independence", [6, 12],
      { en: "One Task, Start to Finish", ar: "مهمة واحدة من البداية للنهاية" },
      { en: "Practice full ownership of a small task without a reminder", ar: "التدرب على تولي مهمة صغيرة كاملة دون تذكير" },
      { en: "Whatever the chosen task requires", ar: "ما تتطلبه المهمة المختارة" },
      { min: 10, max: 20 }, "easy",
      { en: "Pick one task your child already knows how to do, and resist stepping in.", ar: "اختر مهمة يعرف طفلك كيفية القيام بها بالفعل، وقاوم التدخل." },
      { en: "A small, real sense of self-reliance.", ar: "شعور حقيقي وصغير بالاعتماد على الذات." },
      { tags: [], strengthsSupported: [] }),
    act("rout-01", "dailyRoutines", [6, 12],
      { en: "Visible Routine Chart", ar: "لوحة روتين مرئية" },
      { en: "Use predictability to reduce transition resistance", ar: "استخدام التوقع لتقليل مقاومة الانتقال بين الأنشطة" },
      { en: "Paper and markers, or printed icons", ar: "ورق وأقلام أو رموز مطبوعة" },
      { min: 15, max: 20 }, "easy",
      { en: "Post it at eye level; let your child check off each step themselves.", ar: "علّقها في مستوى نظره ودعه يضع علامة على كل خطوة بنفسه." },
      { en: "Smoother mornings and bedtimes with less negotiation.", ar: "صباحات وأوقات نوم أكثر سلاسة وأقل جدالًا." },
      { tags: ["art"], strengthsSupported: [] }),
    act("sleep-01", "sleep", [6, 12],
      { en: "Wind-Down Routine", ar: "روتين الاسترخاء قبل النوم" },
      { en: "Build a consistent pre-sleep cue sequence", ar: "بناء تسلسل ثابت من الإشارات قبل النوم" },
      { en: "None — a fixed 20-minute sequence (bath, book, lights down)", ar: "لا شيء — تسلسل ثابت من 20 دقيقة (استحمام، كتاب، إطفاء الأنوار)" },
      { min: 15, max: 20 }, "easy",
      { en: "Keep the exact same order every night — the sequence itself is the cue to sleep.", ar: "حافظا على نفس الترتيب كل ليلة — التسلسل نفسه هو إشارة النوم." },
      { en: "Faster, less resisted bedtime.", ar: "وقت نوم أسرع وأقل مقاومة." },
      { tags: ["reading"], strengthsSupported: [] }),
    act("screen-01", "screenUse", [6, 12],
      { en: "Screen-Time Agreement", ar: "اتفاقية وقت الشاشة" },
      { en: "Build shared, predictable screen boundaries", ar: "بناء حدود مشتركة وواضحة لوقت الشاشة" },
      { en: "Paper to write the agreement together", ar: "ورقة لكتابة الاتفاق معًا" },
      { min: 15, max: 20 }, "medium",
      { en: "Negotiate the limit together rather than announcing it — buy-in reduces conflict.", ar: "تفاوضا على الحد معًا بدلًا من الإعلان عنه — المشاركة تقلل الخلاف." },
      { en: "Fewer daily arguments about screen time.", ar: "جدالات أقل يوميًا حول وقت الشاشة." },
      { tags: [], strengthsSupported: [] }),
    act("motiv-01", "motivation", [6, 12],
      { en: "Choose-Your-Challenge Task", ar: "مهمة اختر تحديك" },
      { en: "Rebuild intrinsic motivation through real choice", ar: "إعادة بناء الدافعية الداخلية عبر خيار حقيقي" },
      { en: "None", ar: "لا شيء" },
      { min: 10, max: 20 }, "easy",
      { en: "Offer 2–3 real options for how to approach a task, not just whether to do it.", ar: "قدّم 2-3 خيارات حقيقية لكيفية تنفيذ المهمة، لا فقط إن كان سينفذها." },
      { en: "More willingness to start tasks unprompted.", ar: "استعداد أكبر لبدء المهام دون تذكير." },
      { tags: [], strengthsSupported: [] }),
    act("resp-01", "responsibility", [6, 12],
      { en: "Helper of the Week", ar: "مساعد الأسبوع" },
      { en: "Build a sense of contribution through one owned duty", ar: "بناء شعور بالمساهمة عبر واجب واحد يتولاه" },
      { en: "None", ar: "لا شيء" },
      { min: 10, max: 15 }, "easy",
      { en: "Pick one real household duty and let natural consequences (not lectures) follow if it's missed.", ar: "اختر واجبًا منزليًا حقيقيًا ودع النتائج الطبيعية (لا المحاضرات) تتبع إن نُسي." },
      { en: "More reliable follow-through on a specific duty.", ar: "التزام أكثر ثباتًا بواجب محدد." },
      { tags: [], strengthsSupported: ["empathy"] }),
    act("prob-01", "problemSolving", [6, 12],
      { en: "Mini Experiment Time", ar: "وقت التجربة المصغرة" },
      { en: "Encourage hands-on, cause-and-effect thinking", ar: "تشجيع التفكير العملي القائم على السبب والنتيجة" },
      { en: "Simple household items", ar: "أدوات منزلية بسيطة" },
      { min: 15, max: 25 }, "medium",
      { en: "Let your child predict the outcome before trying it — being wrong is part of the fun.", ar: "دع طفلك يتوقع النتيجة قبل التجربة — الخطأ جزء من المتعة." },
      { en: "More willingness to test ideas independently.", ar: "استعداد أكبر لتجربة الأفكار باستقلالية." },
      { tags: ["building"], strengthsSupported: ["problemSolving"] }),
    act("resil-01", "resilience", [6, 12],
      { en: "Losing-Well Practice Game", ar: "لعبة التدرب على الخسارة بروح رياضية" },
      { en: "Build tolerance for losing or making mistakes", ar: "بناء تحمل للخسارة أو ارتكاب الأخطاء" },
      { en: "Any simple game with a clear winner", ar: "أي لعبة بسيطة لها فائز واضح" },
      { min: 15, max: 20 }, "medium",
      { en: "Model losing out loud yourself ('aw, I lost — good game though!') before it's your child's turn to lose.", ar: "مثّل الخسارة بصوت عالٍ أنت أولًا ('خسرت! لكنها كانت لعبة ممتعة') قبل أن يخسر طفلك." },
      { en: "Calmer reactions to losing or making mistakes.", ar: "ردود فعل أهدأ عند الخسارة أو الخطأ." },
      { tags: ["sport"], strengthsSupported: ["resilience"] }),
    act("creat-01", "creativity", [6, 12],
      { en: "Invent-a-Story Time", ar: "وقت اختراع القصص" },
      { en: "Nurture imaginative thinking", ar: "تنمية التفكير التخيلي" },
      { en: "None", ar: "لا شيء" },
      { min: 10, max: 20 }, "easy",
      { en: "Build on your child's ideas rather than correcting or redirecting them.", ar: "ابنِ على أفكار طفلك بدلًا من تصحيحها أو إعادة توجيهها." },
      { en: "More confident, original creative output.", ar: "إنتاج إبداعي أكثر ثقة وأصالة." },
      { tags: ["art"], strengthsSupported: ["creativity"] }),
    act("emp-01", "empathy", [6, 12],
      { en: "Kindness Mission", ar: "مهمة اللطف" },
      { en: "Reinforce empathy through one small chosen act", ar: "تعزيز التعاطف عبر فعل لطف صغير مختار" },
      { en: "None", ar: "لا شيء" },
      { min: 10, max: 15 }, "easy",
      { en: "Let your child choose their own kind act for the day, and notice it out loud afterward.", ar: "دع طفلك يختار فعل اللطف الخاص به لهذا اليوم ولاحظه بصوت عالٍ لاحقًا." },
      { en: "A stronger habit of noticing others' needs.", ar: "عادة أقوى لملاحظة احتياجات الآخرين." },
      { tags: [], strengthsSupported: ["empathy"] }),
  ];

  /* =====================================================================
   * 6. PLAN SELECTOR — scored matching, fully deterministic.
   *
   * ActivityMatchScore =
   *     NeedMatch            (0–40)  primary need > secondary need > none
   *   + AgeMatch             (0–15)  inside activity.ageRange, tapering outside
   *   + InterestMatch        (0–20)  overlap with the child's interest tags
   *                                   (+5 bonus if a matching interest ADAPTATION exists,
   *                                    since that changes the actual activity, not just its label)
   *   + StrengthMatch        (0–8)   overlap with detected strength domains
   *   + GoalMatch            (0–5)   activity's domain is one of this week's active goal domains
   *   + DevelopmentalMatch   (0–10)  activity difficulty fits the child's age band
   *   + VarietyAdjustment    (−8 × times already used this week)  discourages repeats
   *                                   WITHOUT randomness — a deterministic penalty, not a coin flip.
   *
   * NeedMatch and DevelopmentalMatch dominate the total on purpose, per spec:
   * cosmetic variety (interests) can shift WHICH activity is picked for a
   * need, but should not override whether the need itself gets addressed.
   * ===================================================================== */
  function ageMatchScore(activity, age) {
    const [lo, hi] = activity.ageRange;
    if (age >= lo && age <= hi) return 15;
    const dist = age < lo ? lo - age : age - hi;
    return Math.max(0, 15 - dist * 5);
  }
  function developmentalMatchScore(activity, age) {
    const wantsEasy = age <= 8;
    if (activity.difficultyBase === "easy") return 10;
    return wantsEasy ? 6 : 10; // medium-base activities still score reasonably for older kids
  }
  function scoreActivity(activity, needDomain, profile, interestTags, strengthDomains, goalDomains, usageCount) {
    const needMatch = activity.targetNeeds[0] === needDomain ? 40
      : activity.targetNeeds.includes(needDomain) ? 25 : 5;
    const ageMatch = ageMatchScore(activity, profile.age);
    const hasInterestOverlap = activity.tags.some((t) => interestTags.includes(t));
    const hasAdaptationMatch = (activity.interestAdaptations || []).some((v) => v.matchTags.some((t) => interestTags.includes(t)));
    const interestMatch = (hasInterestOverlap ? 15 : 0) + (hasAdaptationMatch ? 5 : 0);
    const strengthMatch = activity.strengthsSupported.some((s) => strengthDomains.includes(s)) ? 8 : 0;
    const goalMatch = goalDomains.includes(activity.targetNeeds[0]) ? 5 : 0;
    const devMatch = developmentalMatchScore(activity, profile.age);
    const variety = -8 * (usageCount || 0);
    const total = needMatch + ageMatch + interestMatch + strengthMatch + goalMatch + devMatch + variety;
    return {
      total,
      breakdown: { needMatch, ageMatch, interestMatch, strengthMatch, goalMatch, devMatch, variety },
      hasAdaptationMatch,
    };
  }

  function pickActivityAdaptation(activity, interestTags) {
    const variant = (activity.interestAdaptations || []).find((v) => v.matchTags.some((t) => interestTags.includes(t)));
    if (!variant) return { title: activity.title, materials: activity.materials, parentInstructions: activity.parentInstructions };
    return {
      title: variant.title || activity.title,
      materials: variant.materials || activity.materials,
      parentInstructions: variant.parentInstructions || activity.parentInstructions,
    };
  }

  function buildDaySchedule(priorities) {
    // Deterministic weighted round-robin: rank 0 gets weight 3, rank 1 gets
    // weight 2, everything else gets weight 1 — top needs appear more often
    // across the week without any randomness.
    const pool = [];
    priorities.forEach((domain, i) => {
      const weight = i === 0 ? 3 : i === 1 ? 2 : 1;
      for (let k = 0; k < weight; k++) pool.push(domain);
    });
    if (!pool.length) pool.push("socialSkills");
    const days = [];
    for (let d = 0; d < 7; d++) days.push(pool[d % pool.length]);
    return days;
  }

  const DAY_LABELS = {
    en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    ar: ["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"],
  };
  const DIFFICULTY_LABEL = {
    en: { Easy: "Easy", Medium: "Medium" },
    ar: { Easy: "سهل", Medium: "متوسط" },
  };

  function PlanSelector(priorities, strengths, profile, lang) {
    const interestTags = canonicalInterestTags(profile.interests);
    const daySchedule = buildDaySchedule(priorities);
    const usage = {}; // activityId -> times used so far this week
    const explain = [];

    const days = daySchedule.map((needDomain, dayIdx) => {
      const candidates = KNOWLEDGE_BASE
        .filter((a) => a.targetNeeds.includes(needDomain) || a.targetNeeds[0] === needDomain)
        .map((a) => ({ activity: a, ...scoreActivity(a, needDomain, profile, interestTags, strengths, priorities, usage[a.id]) }))
        .sort((a, b) => b.total - a.total || (a.activity.id < b.activity.id ? -1 : 1)); // deterministic tie-break

      const pool = candidates.length ? candidates : KNOWLEDGE_BASE
        .map((a) => ({ activity: a, ...scoreActivity(a, needDomain, profile, interestTags, strengths, priorities, usage[a.id]) }))
        .sort((a, b) => b.total - a.total || (a.activity.id < b.activity.id ? -1 : 1));

      const chosen = pool[0];
      usage[chosen.activity.id] = (usage[chosen.activity.id] || 0) + 1;
      const adapted = pickActivityAdaptation(chosen.activity, interestTags);
      const isYoung = profile.age <= 8;
      const durationMin = isYoung ? chosen.activity.duration.min : chosen.activity.duration.max;
      const difficultyKey = chosen.activity.difficultyBase === "easy" ? "Easy" : (isYoung ? "Easy" : "Medium");

      const why = [];
      why.push(`primary need = ${needDomain}${chosen.breakdown.needMatch === 40 ? " (direct match)" : " (related match)"}`);
      why.push(`age appropriate for ${profile.age} (ageMatch=${chosen.breakdown.ageMatch})`);
      if (chosen.breakdown.interestMatch > 0) why.push(`matched interest tag${chosen.hasAdaptationMatch ? " with adapted variant" : ""}`);
      if (chosen.breakdown.strengthMatch > 0) why.push(`supports identified strength(s): ${chosen.activity.strengthsSupported.join(", ")}`);
      explain.push({ day: dayIdx, activityId: chosen.activity.id, needDomain, score: chosen.total, breakdown: chosen.breakdown, why });

      return {
        day: DAY_LABELS[lang][dayIdx],
        domain: needDomain,
        activityId: chosen.activity.id,
        title: adapted.title[lang],
        goal: chosen.activity.goal[lang],
        duration: lang === "ar" ? `${durationMin} دقيقة` : `${durationMin} min`,
        difficulty: DIFFICULTY_LABEL[lang][difficultyKey],
        materials: adapted.materials[lang],
        tip: adapted.parentInstructions[lang],
        evidenceTag: chosen.activity.evidenceTag,
      };
    });

    return { days, explain };
  }

  /* =====================================================================
   * 7. GUIDANCE SELECTOR — ranked needs -> parent guidance categories.
   * ===================================================================== */
  const GUIDANCE_BANK = {
    communication: { icon: "💬", en: "Ask open-ended questions about their day instead of yes/no ones — it builds reflection and trust.", ar: "اطرح أسئلة مفتوحة عن يومه بدلًا من أسئلة بنعم أو لا — فهذا يعزز التأمل والثقة.", evidenceTag: "communication" },
    sleep: { icon: "🌙", en: "Keep a consistent bedtime — sleep regulation directly supports attention and emotional control.", ar: "حافظ على موعد نوم ثابت — فتنظيم النوم يدعم مباشرة التركيز والتنظيم العاطفي.", evidenceTag: "sleep" },
    screenTime: { icon: "📱", en: "Agree on screen-time boundaries together rather than imposing them — shared limits are easier to keep.", ar: "اتفقا معًا على حدود وقت الشاشة بدلًا من فرضها — الحدود المشتركة أسهل في الالتزام بها.", evidenceTag: "screenUse" },
    positiveReinforcement: { icon: "🌟", en: "Praise effort and persistence ('you kept trying') rather than only outcomes — it builds resilience.", ar: "امدح المثابرة ('لقد واصلت المحاولة') وليس النتيجة فقط — فهذا يبني المرونة.", evidenceTag: "resilience" },
    dailyRoutine: { icon: "📋", en: "Use a simple visible daily schedule — predictability reduces resistance and supports focus.", ar: "استخدم جدولًا يوميًا بسيطًا وواضحًا — فالتوقع يقلل من المقاومة ويدعم التركيز.", evidenceTag: "dailyRoutines" },
    homeworkSupport: { icon: "📚", en: "Break homework into smaller steps and use a consistent, quiet workspace free of screens.", ar: "قسّم الواجبات إلى خطوات أصغر واستخدم مكانًا هادئًا وثابتًا خاليًا من الشاشات.", evidenceTag: "reading" },
    emotionalSupport: { icon: "🤝", en: "Name and validate feelings before problem-solving — children regulate better when they feel understood first.", ar: "سمِّ المشاعر وتقبّلها قبل حل المشكلة — يتنظم الأطفال بشكل أفضل عندما يشعرون بالتفهم أولًا.", evidenceTag: "emotionalRegulation" },
    socialCoaching: { icon: "🧑‍🤝‍🧑", en: "Rehearse social scripts at home before real situations — practice lowers the stakes.", ar: "تدرّبا على حوارات اجتماعية في المنزل قبل المواقف الحقيقية — التدريب يقلل الضغط.", evidenceTag: "socialSkills" },
    independenceBuilding: { icon: "🧩", en: "Resist stepping in the moment a task gets hard — a short pause often lets your child solve it themselves.", ar: "قاوم التدخل فور صعوبة المهمة — التوقف القصير غالبًا يتيح لطفلك حلها بنفسه.", evidenceTag: "independence" },
    problemSolvingSupport: { icon: "🧠", en: "Ask 'what could you try?' before offering a solution — it builds independent thinking.", ar: "اسأل 'ماذا يمكنك أن تجرب؟' قبل تقديم الحل — فهذا يبني التفكير المستقل.", evidenceTag: "problemSolving" },
  };
  const DOMAIN_TO_GUIDANCE = {
    attention: ["dailyRoutine", "screenTime"], executiveFunction: ["dailyRoutine", "problemSolvingSupport"],
    emotionalRegulation: ["emotionalSupport", "communication"], anxiety: ["emotionalSupport", "communication"],
    socialSkills: ["socialCoaching", "communication"], peerRelationships: ["socialCoaching"],
    confidence: ["positiveReinforcement"], communication: ["communication"],
    reading: ["homeworkSupport"], behavior: ["dailyRoutine", "positiveReinforcement"],
    frustrationTolerance: ["positiveReinforcement", "problemSolvingSupport"], independence: ["independenceBuilding"],
    dailyRoutines: ["dailyRoutine"], sleep: ["sleep"], screenUse: ["screenTime"],
    motivation: ["positiveReinforcement"], responsibility: ["independenceBuilding"],
    problemSolving: ["problemSolvingSupport"], resilience: ["positiveReinforcement"],
    creativity: ["positiveReinforcement"], empathy: ["socialCoaching"],
  };
  function GuidanceSelector(priorities) {
    const selected = new Set(["positiveReinforcement"]);
    priorities.forEach((p) => (DOMAIN_TO_GUIDANCE[p] || []).forEach((g) => selected.add(g)));
    return Array.from(selected).slice(0, 5);
  }

  /* =====================================================================
   * 8. EVIDENCE SELECTOR — reuses the 5 sources already present in the
   *    existing UI (World Health Organization, CDC, AAP, UNICEF, Center on
   *    the Developing Child/Harvard) rather than inventing a new source list,
   *    per the instruction to integrate existing resources where possible.
   * ===================================================================== */
  const EVIDENCE_SOURCES = {
    who: { org: "World Health Organization", en: "Guidelines on Parenting for Early & Middle Childhood", ar: "إرشادات التربية للطفولة المبكرة والمتوسطة" },
    cdc: { org: "CDC", en: "Positive Parenting Tips, Ages 6–12", ar: "نصائح التربية الإيجابية، الأعمار 6-12" },
    aap: { org: "American Academy of Pediatrics", en: "HealthyChildren.org — Middle Childhood", ar: "HealthyChildren.org — مرحلة الطفولة المتوسطة" },
    unicef: { org: "UNICEF", en: "Parenting Resources", ar: "موارد التربية" },
    harvard: { org: "Center on the Developing Child, Harvard", en: "Serve and Return Interaction", ar: "تفاعل المبادرة والاستجابة" },
  };
  const DOMAIN_TO_EVIDENCE = {
    attention: "cdc", executiveFunction: "harvard", emotionalRegulation: "who", anxiety: "who",
    socialSkills: "unicef", peerRelationships: "unicef", confidence: "aap", communication: "harvard",
    reading: "aap", behavior: "cdc", frustrationTolerance: "who", independence: "aap",
    dailyRoutines: "cdc", sleep: "aap", screenUse: "aap", motivation: "cdc",
    responsibility: "unicef", problemSolving: "harvard", resilience: "who", creativity: "harvard", empathy: "unicef",
  };
  function EvidenceSelector(usedDomains) {
    const keys = Array.from(new Set(usedDomains.map((d) => DOMAIN_TO_EVIDENCE[d] || "cdc")));
    if (!keys.length) keys.push("cdc");
    return keys.map((k) => EVIDENCE_SOURCES[k]);
  }

  /* =====================================================================
   * 9. REFERRAL ENGINE — soft, topic-aware, never diagnostic.
   * ===================================================================== */
  const REFERRAL_ELIGIBLE = ["attention", "executiveFunction", "emotionalRegulation", "anxiety", "socialSkills", "peerRelationships", "communication", "reading", "behavior", "sleep", "resilience"];
  const REFERRAL_PROFESSIONAL = {
    attention: { en: "a pediatrician", ar: "طبيب الأطفال" }, executiveFunction: { en: "a pediatrician", ar: "طبيب الأطفال" },
    emotionalRegulation: { en: "a licensed counselor", ar: "مستشار مرخّص" }, anxiety: { en: "a licensed counselor", ar: "مستشار مرخّص" },
    socialSkills: { en: "a school counselor", ar: "مرشد مدرسي" }, peerRelationships: { en: "a school counselor", ar: "مرشد مدرسي" },
    communication: { en: "a speech-language specialist", ar: "أخصائي تخاطب" }, reading: { en: "a speech-language specialist", ar: "أخصائي تخاطب" },
    behavior: { en: "a pediatrician", ar: "طبيب الأطفال" }, sleep: { en: "a pediatrician", ar: "طبيب الأطفال" },
    resilience: { en: "a licensed counselor", ar: "مستشار مرخّص" },
  };
  function ReferralEngine(concernSignals, urgentFlag, lang) {
    const top = concernSignals[0];
    const eligible = top && REFERRAL_ELIGIBLE.includes(top.domain) && top.score >= 4;
    if (!eligible && !urgentFlag) return null;
    const domain = top ? top.domain : "emotionalRegulation";
    const topicLabel = DOMAIN_BY_ID[domain] ? DOMAIN_BY_ID[domain][lang] : "";
    const who = (REFERRAL_PROFESSIONAL[domain] || REFERRAL_PROFESSIONAL.emotionalRegulation)[lang];
    if (lang === "ar") {
      return `بناءً على ما شاركته، قد يكون من المفيد التحدث مع ${who} بخصوص ${topicLabel} كنقطة انطلاق. هذه ملاحظة عامة وليست تشخيصًا.`;
    }
    return `Based on what you've shared, it may help to speak with ${who} about ${topicLabel} as a starting point. This is a general educational pointer, not a diagnosis.`;
  }

  /* =====================================================================
   * 10. TOP-LEVEL ENTRY POINT — single source of truth for the whole plan.
   * ===================================================================== */
  function generatePersonalizedPlan(profile, lang) {
    // profile: { age, gender, grade:{en,ar}|string, interests:[strings],
    //            strengths:[strings], concernText: string }
    const caseSignals = CaseAnalyzer(profile);
    const devInfo = DevelopmentalAnalyzer(profile);
    const { priorities, strengths } = NeedsPriorityEngine(caseSignals, devInfo, profile);
    const { days, explain } = PlanSelector(priorities, strengths, profile, lang);
    const guidanceKeys = GuidanceSelector(priorities);
    const usedDomains = Array.from(new Set([...priorities, ...days.map((d) => d.evidenceTag)]));
    const evidence = EvidenceSelector(usedDomains);
    const referralText = ReferralEngine(caseSignals.concernSignals, caseSignals.urgentFlag, lang);

    const priorityLabels = priorities.map((p) => DOMAIN_BY_ID[p][lang]);
    const summary = lang === "ar"
      ? `في هذه المرحلة العمرية، عادة ما يكون الأطفال في طور ${devInfo.textAr}. بناءً على ما شاركته الأسرة، يبدو أن أبرز مجالات التركيز الحالية هي: ${priorityLabels.join("، ")}.`
      : `At this age, children are typically ${devInfo.textEn}. Based on what the family shared, the current focus areas appear to be: ${priorityLabels.join(", ")}.`;

    const goals = days.slice(0, 5).map((d) => d.goal);
    const guidanceTexts = guidanceKeys.map((k) => GUIDANCE_BANK[k][lang]);

    return {
      lang,
      devBand: devInfo.band,
      priorities,
      priorityLabels,
      strengths,
      summary,
      goals,
      weeklyPlan: days,
      guidance: guidanceKeys.map((k) => ({ icon: GUIDANCE_BANK[k].icon, text: GUIDANCE_BANK[k][lang] })),
      guidanceTexts,
      evidence,
      referralText,
      showReferral: !!referralText,
      _explain: explain, // internal only — for testing/research, not prominent in UI
    };
  }

  const GTPersonalization = {
    NEED_DOMAINS, KNOWLEDGE_BASE, GUIDANCE_BANK, EVIDENCE_SOURCES,
    CaseAnalyzer, DevelopmentalAnalyzer, NeedsPriorityEngine, PlanSelector,
    GuidanceSelector, EvidenceSelector, ReferralEngine,
    generatePersonalizedPlan,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = GTPersonalization;
  } else {
    root.GTPersonalization = GTPersonalization;
  }
})(typeof window !== "undefined" ? window : globalThis);
