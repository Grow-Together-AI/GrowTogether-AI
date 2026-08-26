/**
 * Grow Together AI — Deterministic Personalization Engine
 * ---------------------------------------------------------------------------
 * Pure, framework-agnostic, dependency-free JS. No network calls, no LLM APIs,
 * no external DB, no persistent storage. Everything here is a pure function of
 * the profile object passed in — same input always produces the same output.
 *
 * Pipeline (mirrors the required architecture):
 *   Child Profile
 *     -> CaseAnalyzer            (free-text concern -> scored need + risk signals)
 *     -> DevelopmentalAnalyzer   (age -> developmental band + framing)
 *     -> NeedsPriorityEngine     (signals + age/grade/strengths -> ranked needs)
 *     -> SaudiContextLayer       (structural hook for future cultural adaptation —
 *                                  see "SAUDI CONTEXT LAYER" section; currently a
 *                                  documented pass-through, no invented content)
 *     -> EvidenceKnowledgeBase   (structured, provenance-tagged activity/evidence data)
 *     -> PlanSelector            (scored matching + deterministic progression, NOT random)
 *     -> GuidanceSelector        (ranked needs -> parent guidance categories)
 *     -> ReferralSafetyEngine    (tiered routing heuristic -> optional soft referral)
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

  /* =====================================================================
   * 1b. VERIFIED KNOWLEDGE BASE INTEGRATION (Saudi Verified KB v1)
   *     Loads docs/assets/saudi-verified-knowledge-base-v1.json as a
   *     separate, independently-versioned artifact (never hand-copied into
   *     this file). Static-file, same-origin fetch only — no child/profile
   *     data is ever sent anywhere; this is a read of a static asset, not a
   *     network call about the family. If the fetch fails for any reason
   *     (offline file:// preview, missing file, blocked network), the app
   *     falls back silently to the original validated internal
   *     KNOWLEDGE_BASE / INTERNATIONAL_KNOWLEDGE content below — no crash,
   *     no fabricated "verified" evidence.
   * ===================================================================== */
  const KB_JSON_PATH = "assets/saudi-verified-knowledge-base-v1.json";

  // Engine domain id -> knowledge-base domain id. Every one of the 21
  // engine domains has an unambiguous 1:1 match in the supplied KB (checked
  // against the KB's domains[].id list before writing this map — no domain
  // was ambiguous, so nothing here is a guess).
  const ENGINE_TO_KB_DOMAIN = {
    attention: "attentionFocus",
    executiveFunction: "executiveFunction",
    emotionalRegulation: "emotionalRegulation",
    anxiety: "anxietyFears",
    socialSkills: "socialSkills",
    peerRelationships: "peerRelationships",
    confidence: "confidenceSelfEsteem",
    communication: "communication",
    reading: "readingLanguage",
    behavior: "behaviorCooperation",
    frustrationTolerance: "frustrationTolerance",
    independence: "independence",
    dailyRoutines: "dailyRoutines",
    sleep: "sleep",
    screenUse: "screenUse",
    motivation: "motivation",
    responsibility: "responsibility",
    problemSolving: "problemSolving",
    resilience: "resilience",
    creativity: "creativity",
    empathy: "empathy",
  };

  // KB interestAdaptations are keyed by the ORIGINAL interest word
  // ("drawing", "football", "building", "stories", "nature"), while
  // canonicalInterestTags() (below) collapses raw parent-entered interest
  // words into broader synonym buckets ("art", "sport", ...). This bridges
  // the two vocabularies so a KB interest key matches whichever canonical
  // tag(s) the parent's raw interest text produced.
  const KB_INTEREST_TAG_BRIDGE = {
    drawing: ["art", "drawing"],
    football: ["sport", "football"],
    building: ["building"],
    stories: ["stories", "reading"],
    nature: ["nature"],
  };

  let EXTERNAL_KB = null;                 // parsed JSON once loaded, else null
  let EXTERNAL_KB_STATUS = "not_loaded";  // "not_loaded" | "loaded" | "failed"
  let kbReadyPromise = null;

  // Populated by indexExternalKb() once EXTERNAL_KB loads successfully.
  let KB_DOMAIN_BY_ID = {};
  let KB_SOURCE_BY_ID = {};
  let KB_ACTIVITIES_BY_ENGINE_DOMAIN = {};

  function indexExternalKb(kb) {
    KB_DOMAIN_BY_ID = {};
    KB_SOURCE_BY_ID = {};
    KB_ACTIVITIES_BY_ENGINE_DOMAIN = {};
    (kb.sourceRegistry || []).forEach((s) => { KB_SOURCE_BY_ID[s.id] = s; });
    (kb.domains || []).forEach((d) => { KB_DOMAIN_BY_ID[d.id] = d; });
    Object.entries(ENGINE_TO_KB_DOMAIN).forEach(([engineId, kbId]) => {
      const domain = KB_DOMAIN_BY_ID[kbId];
      if (!domain) return; // no silent guessing — simply unavailable for this domain
      KB_ACTIVITIES_BY_ENGINE_DOMAIN[engineId] = (domain.activities || [])
        .map((a) => kbActivityToInternal(a, engineId));
    });
  }

  /**
   * Adapts one KB activity record into the internal activity shape consumed
   * by scoreActivity()/PlanSelector(), so KB-sourced and legacy hand-authored
   * activities can be ranked side by side. This only reshapes field
   * names/containers — it never rewrites the KB's own steps/scripts/sources.
   * The full original KB record is kept on `_kbRaw` for the report's
   * step-by-step rendering and for evidence-provenance lookups.
   */
  function kbActivityToInternal(a, engineDomainId) {
    return {
      id: a.id,
      targetNeeds: [engineDomainId],
      ageRange: [a.ageRange.min, a.ageRange.max],
      title: a.title,
      goal: a.purpose,
      materials: { en: (a.materials.en || []).join(", "), ar: (a.materials.ar || []).join("، ") },
      duration: { min: a.durationMinutes.min, max: a.durationMinutes.max },
      // KB activities don't carry a difficultyBase; the two earlier stages
      // read as "easy", the two later stages as "medium" — mirrors how the
      // existing difficultyKey logic already treats stage-appropriate load.
      difficultyBase: (a.stage === "independentApplication" || a.stage === "reflection") ? "medium" : "easy",
      parentInstructions: a.parentScript,
      expectedOutcome: a.successIndicator,
      strengthsSupported: [],
      tags: [], // interest matching for KB activities goes through kbInterestMatch(), not .tags
      evidenceTag: engineDomainId,
      interestAdaptations: [],
      stage: a.stage,
      _kb: true,
      _kbRaw: a,
    };
  }

  function kbInterestMatch(kbAct, interestTags) {
    const adaptations = (kbAct._kbRaw && kbAct._kbRaw.interestAdaptations) || {};
    const matchedKey = Object.keys(adaptations).find((key) =>
      (KB_INTEREST_TAG_BRIDGE[key] || [key]).some((t) => interestTags.includes(t)),
    );
    return matchedKey ? { key: matchedKey, text: adaptations[matchedKey] } : null;
  }

  /**
   * loadKnowledgeBase() — fetches the static JSON artifact once (GitHub
   * Pages-compatible: same-origin relative fetch, no auth headers, no child
   * data in the request). Safe to call repeatedly; only fetches once. NEVER
   * rejects — callers can always `await` it and keep going, falling back to
   * the original validated internal content on any failure.
   */
  function loadKnowledgeBase(path) {
    if (kbReadyPromise) return kbReadyPromise;
    const url = path || KB_JSON_PATH;
    kbReadyPromise = (typeof fetch === "function"
      ? fetch(url).then((res) => {
          if (!res.ok) throw new Error("KB fetch failed: " + res.status);
          return res.json();
        })
      : Promise.reject(new Error("fetch unavailable")))
      .then((json) => {
        if (!json || !Array.isArray(json.domains) || !Array.isArray(json.sourceRegistry)) {
          throw new Error("KB JSON missing expected shape");
        }
        EXTERNAL_KB = json;
        EXTERNAL_KB_STATUS = "loaded";
        indexExternalKb(json);
      })
      .catch((err) => {
        // Developer-facing warning only — parents never see a raw error,
        // and the app keeps working on the original validated content.
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[GTPersonalization] Saudi verified knowledge base failed to load — falling back to built-in content.", err);
        }
        EXTERNAL_KB = null;
        EXTERNAL_KB_STATUS = "failed";
      });
    return kbReadyPromise;
  }

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

    // Explicit safety overlay — independent of domain scoring. If present,
    // ReferralSafetyEngine escalates immediately regardless of anything else.
    const safetyEn = ["hurt himself", "hurt herself", "hurt someone", "self-harm", "suicid", "wants to die", "not talking at all", "lost a skill", "regressed"];
    const safetyAr = ["يؤذي نفسه", "يؤذي نفسها", "إيذاء نفسه", "لا يتحدث إطلاقًا", "فقد مهارة", "تراجع في النمو"];
    const safetyFlag = safetyEn.some((k) => text.includes(k)) || safetyAr.some((k) => text.includes(k));

    // Additional tiering signals — used ONLY by ReferralSafetyEngine to decide
    // HOW STRONGLY to route a case, never to add/remove developmental domains.
    // Each is a small, explainable keyword set; none of these imply diagnosis.
    const severityFlag = ["severe", "extreme", "constant", "all the time", "every day", "can't function", "شديد", "باستمرار", "طوال الوقت", "كل يوم"].some((k) => text.includes(k));
    const persistenceFlag = ["for months", "for weeks", "for a long time", "since he was little", "since she was little", "always been", "منذ أشهر", "منذ فترة طويلة", "دائمًا"].some((k) => text.includes(k));
    const functionalImpairmentFlag = ["can't go to school", "can't keep up", "falling behind", "unable to function", "stopped attending", "لا يستطيع الذهاب للمدرسة", "متأخر دراسيًا", "توقف عن الحضور"].some((k) => text.includes(k));
    const schoolImpactFlag = ["teacher says", "school called", "suspended", "expelled", "failing", "school said", "المعلمة قالت", "المدرسة اتصلت", "الرسوب"].some((k) => text.includes(k));
    const familyImpactFlag = ["affecting the whole family", "we are exhausted", "affecting our marriage", "siblings are affected", "يؤثر على العائلة كلها", "منهكون", "يؤثر على إخوته"].some((k) => text.includes(k));
    const explicitHelpRequestFlag = ["need professional help", "should we see a doctor", "want a referral", "need a specialist", "need help from a professional", "نحتاج مساعدة متخصصة", "هل نحتاج طبيب", "نريد إحالة"].some((k) => text.includes(k));

    return {
      concernSignals, strengthSignals,
      // kept for backward compatibility with any external caller expecting urgentFlag
      urgentFlag: safetyFlag,
      riskSignals: { safetyFlag, severityFlag, persistenceFlag, functionalImpairmentFlag, schoolImpactFlag, familyImpactFlag, explicitHelpRequestFlag },
    };
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

  const STAGE_ORDER = { introduction: 0, guidedPractice: 1, independentApplication: 2, reflection: 3 };
  function act(id, domain, ageRange, title, goal, materials, duration, difficultyBase, parentInstructions, expectedOutcome, opts) {
    opts = opts || {};
    return {
      id, targetNeeds: [domain, ...(opts.secondaryDomains || [])], ageRange, title, goal, materials,
      duration, difficultyBase, parentInstructions, expectedOutcome,
      strengthsSupported: opts.strengthsSupported || [], tags: opts.tags || [],
      evidenceTag: opts.evidenceTag || domain,
      interestAdaptations: opts.interestAdaptations || [],
      // Pedagogical stage — used by PlanSelector to build a deterministic
      // introduction -> guidedPractice -> independentApplication -> reflection
      // PROGRESSION across the week instead of repeating one activity.
      // Domains with only one authored activity default to "introduction"
      // and will still repeat (documented limitation — see engine header).
      stage: opts.stage || "introduction",
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

    // ---- PROGRESSION ACTIVITIES (Defect 2 fix) ----
    // These give PlanSelector real alternatives when a domain needs to appear
    // on more than one day, so the week shows introduction -> guidedPractice
    // -> independentApplication (-> reflection) instead of one activity
    // repeated verbatim. Added for the domains most commonly primary/secondary
    // in practice; other domains still have only one authored activity today
    // (documented limitation, not a hidden gap).
    act("emo-02", "emotionalRegulation", [6, 12],
      { en: "Calm-Down Steps, Coached", ar: "خطوات الهدوء بمساعدة الوالدين" },
      { en: "Practice a concrete 3-step calm-down routine with support", ar: "التدرب على روتين هدوء من 3 خطوات بمساعدة" },
      { en: "None — a simple 3-step routine (stop, breathe, name it)", ar: "لا شيء — روتين بسيط من 3 خطوات (توقف، تنفس، سمِّه)" },
      { min: 5, max: 10 }, "medium",
      { en: "Walk through the 3 steps together out loud the first several times.", ar: "مرّا على الخطوات الثلاث معًا بصوت عالٍ في المرات الأولى." },
      { en: "A repeatable routine your child starts to recognize.", ar: "روتين قابل للتكرار يبدأ طفلك بالتعرف عليه." },
      { tags: ["art"], strengthsSupported: ["empathy"], stage: "guidedPractice",
        interestAdaptations: [
          { matchTags: ["art"], title: { en: "Calm-Down Steps Comic Strip", ar: "خطوات الهدوء كقصة مصورة" }, materials: { en: "Paper to draw the 3 steps as a mini comic strip", ar: "ورقة لرسم الخطوات الثلاث كقصة مصورة صغيرة" } },
          { matchTags: ["sport"], title: { en: "Calm-Down Steps, Move-It-Out", ar: "خطوات الهدوء بالحركة" }, materials: { en: "Open space — the first step is 10 seconds of physical movement to release energy", ar: "مساحة مفتوحة — الخطوة الأولى 10 ثوانٍ من الحركة لتفريغ الطاقة" } },
        ] }),
    act("emo-03", "emotionalRegulation", [6, 12],
      { en: "Independent Calm-Down Attempt", ar: "محاولة هدوء مستقلة" },
      { en: "Apply the calm-down routine with minimal parent involvement", ar: "تطبيق روتين الهدوء بأقل تدخل من الوالدين" },
      { en: "None", ar: "لا شيء" },
      { min: 5, max: 10 }, "medium",
      { en: "Stay nearby but let your child lead the steps themselves before you step in.", ar: "ابقَ قريبًا لكن دع طفلك يقود الخطوات بنفسه قبل أن تتدخل." },
      { en: "More independent use of the calm-down routine in the moment.", ar: "استخدام أكثر استقلالية لروتين الهدوء في حينه." },
      { tags: [], strengthsSupported: [], stage: "independentApplication" }),
    act("emo-04", "emotionalRegulation", [6, 12],
      { en: "Weekly Feelings Reflection", ar: "تأمل أسبوعي في المشاعر" },
      { en: "Reflect on which calm-down step worked best this week", ar: "التأمل في الخطوة الأكثر فائدة هذا الأسبوع" },
      { en: "None", ar: "لا شيء" },
      { min: 5, max: 10 }, "easy",
      { en: "Ask 'which step helped most this week?' — there's no wrong answer.", ar: "اسأل 'أي خطوة ساعدتك أكثر هذا الأسبوع؟' — لا توجد إجابة خاطئة." },
      { en: "A child who can name what helps them calm down.", ar: "طفل قادر على تسمية ما يساعده على الهدوء." },
      { tags: [], strengthsSupported: [], stage: "reflection" }),

    act("frus-02", "frustrationTolerance", [6, 12],
      { en: "Try-Three-Ways, Coached", ar: "المحاولة بثلاث طرق بمساعدة" },
      { en: "Practice tolerating setbacks with active parent coaching", ar: "التدرب على تحمل العقبات بمساعدة فعالة من الوالدين" },
      { en: "A moderately challenging puzzle or building task", ar: "لغز أو مهمة بناء متوسطة الصعوبة" },
      { min: 10, max: 20 }, "medium",
      { en: "Sit alongside and prompt 'what's another way?' at each stuck point.", ar: "اجلس بجانبه واسأل 'ما طريقة أخرى؟' عند كل نقطة توقف." },
      { en: "More willingness to try again with support.", ar: "استعداد أكبر للمحاولة مجددًا بمساعدة." },
      { tags: ["building"], strengthsSupported: ["resilience"], stage: "guidedPractice" }),
    act("frus-03", "frustrationTolerance", [6, 12],
      { en: "Solo Persistence Challenge", ar: "تحدي المثابرة المنفرد" },
      { en: "Apply persistence to a hard task without in-the-moment coaching", ar: "تطبيق المثابرة على مهمة صعبة دون مساعدة مباشرة" },
      { en: "A task slightly above the child's comfort level", ar: "مهمة أصعب قليلًا من مستوى راحة الطفل" },
      { min: 10, max: 20 }, "medium",
      { en: "Let your child attempt it fully alone first; offer help only if asked twice.", ar: "دع طفلك يحاول بمفرده أولًا؛ قدّم المساعدة فقط إذا طلبها مرتين." },
      { en: "Longer independent persistence before seeking help.", ar: "مثابرة مستقلة أطول قبل طلب المساعدة." },
      { tags: [], strengthsSupported: ["resilience"], stage: "independentApplication" }),

    act("attn-02", "attention", [6, 12],
      { en: "Focus Sprint With Check-Ins", ar: "لغز التركيز مع نقاط تحقق" },
      { en: "Extend attention span with brief parent check-ins", ar: "إطالة فترة الانتباه بنقاط تحقق قصيرة من الوالدين" },
      { en: "A jigsaw, building set, or shape puzzle", ar: "لغز أو مجموعة بناء أو أشكال" },
      { min: 10, max: 15 }, "medium",
      { en: "Check in briefly every few minutes rather than hovering the whole time.", ar: "تحقق بإيجاز كل بضع دقائق بدلًا من المراقبة المستمرة." },
      { en: "Slightly longer, steadier focus with light support.", ar: "تركيز أطول وأكثر ثباتًا بدعم خفيف." },
      { tags: ["building", "art"], strengthsSupported: ["problemSolving"], stage: "guidedPractice" }),
    act("attn-03", "attention", [6, 12],
      { en: "Independent Focus Block", ar: "فترة تركيز مستقلة" },
      { en: "Sustain attention for a full block without check-ins", ar: "الحفاظ على التركيز لفترة كاملة دون تحقق" },
      { en: "Whatever held their attention earlier in the week", ar: "ما شدّ انتباهه سابقًا هذا الأسبوع" },
      { min: 10, max: 15 }, "medium",
      { en: "Set a visible timer and step away completely for the full block.", ar: "اضبط مؤقتًا مرئيًا وابتعد تمامًا طوال الفترة." },
      { en: "A real, unaided stretch of independent focus.", ar: "فترة تركيز مستقلة حقيقية دون مساعدة." },
      { tags: [], strengthsSupported: ["problemSolving"], stage: "independentApplication" }),

    act("exec-02", "executiveFunction", [6, 12],
      { en: "Step Card Walkthrough, Guided", ar: "بطاقة المهمة بمساعدة الوالدين" },
      { en: "Practice sequencing a task with a parent alongside", ar: "التدرب على ترتيب مهمة بمساعدة أحد الوالدين" },
      { en: "Index cards or sticky notes", ar: "بطاقات صغيرة أو ملاحظات لاصقة" },
      { min: 10, max: 20 }, "medium",
      { en: "Write the steps together, then walk through the first attempt side by side.", ar: "اكتبا الخطوات معًا ثم نفذا المحاولة الأولى جنبًا إلى جنب." },
      { en: "A clearer mental model of breaking tasks into steps.", ar: "فهم أوضح لتقسيم المهام إلى خطوات." },
      { tags: ["building"], strengthsSupported: ["problemSolving"], stage: "guidedPractice" }),
    act("exec-03", "executiveFunction", [6, 12],
      { en: "Independent Step Card Task", ar: "مهمة بطاقة الخطوات المستقلة" },
      { en: "Sequence and complete a task without parent involvement", ar: "ترتيب وإنجاز مهمة دون تدخل الوالدين" },
      { en: "Index cards from earlier in the week", ar: "البطاقات المستخدمة سابقًا هذا الأسبوع" },
      { min: 10, max: 20 }, "medium",
      { en: "Hand over the blank cards and let your child build the sequence alone.", ar: "سلّمه البطاقات الفارغة ودعه يرتب التسلسل بمفرده." },
      { en: "Independent use of a multi-step planning tool.", ar: "استخدام مستقل لأداة تخطيط متعددة الخطوات." },
      { tags: [], strengthsSupported: ["problemSolving"], stage: "independentApplication" }),

    act("soc-02", "socialSkills", [6, 12],
      { en: "Coached Turn-Taking With Feedback", ar: "التناوب بمساعدة وملاحظات" },
      { en: "Practice turn-taking with real-time gentle feedback", ar: "التدرب على التناوب مع ملاحظات لطيفة فورية" },
      { en: "Any simple board or card game", ar: "أي لعبة لوحية أو ورقية بسيطة" },
      { min: 15, max: 25 }, "medium",
      { en: "Gently name what went well ('you waited nicely that time') during play.", ar: "اذكر بلطف ما سار جيدًا ('انتظرت بشكل جميل هذه المرة') أثناء اللعب." },
      { en: "Better real-time self-monitoring during play.", ar: "مراقبة ذاتية أفضل أثناء اللعب." },
      { tags: ["sport", "building"], strengthsSupported: [], stage: "guidedPractice" }),
    act("soc-03", "socialSkills", [6, 12],
      { en: "Independent Playdate Turn-Taking", ar: "التناوب المستقل في موعد لعب" },
      { en: "Apply turn-taking with a peer, unsupervised in the moment", ar: "تطبيق التناوب مع صديق دون إشراف مباشر" },
      { en: "Whatever game the children choose", ar: "أي لعبة يختارها الأطفال" },
      { min: 20, max: 30 }, "medium",
      { en: "Debrief afterward rather than intervening during play.", ar: "ناقشا الأمر لاحقًا بدلًا من التدخل أثناء اللعب." },
      { en: "Turn-taking skills that hold up without adult presence.", ar: "مهارات تناوب تصمد دون وجود شخص بالغ." },
      { tags: ["sport"], strengthsSupported: [], stage: "independentApplication" }),

    act("conf-02", "confidence", [6, 12],
      { en: "Share-Your-Proud-Moment Aloud", ar: "شارك لحظة فخرك بصوت عالٍ" },
      { en: "Build confidence by voicing an accomplishment to family", ar: "بناء الثقة بمشاركة إنجاز مع العائلة" },
      { en: "This week's proud-moment notebook", ar: "دفتر لحظة الفخر لهذا الأسبوع" },
      { min: 5, max: 10 }, "medium",
      { en: "Ask your child to read one entry aloud to another family member.", ar: "اطلب من طفلك قراءة إحدى المدخلات لفرد آخر من العائلة." },
      { en: "More comfort voicing accomplishments to others.", ar: "راحة أكبر في التعبير عن الإنجازات أمام الآخرين." },
      { tags: [], strengthsSupported: ["confidence"], stage: "guidedPractice" }),
    act("conf-03", "confidence", [6, 12],
      { en: "Proud Moment Without Prompting", ar: "لحظة فخر دون تذكير" },
      { en: "Initiate self-recognition without being asked", ar: "المبادرة بتقدير الذات دون طلب" },
      { en: "The notebook, left accessible", ar: "الدفتر متاح في مكان يسهل الوصول إليه" },
      { min: 5, max: 10 }, "easy",
      { en: "Leave the notebook out and see if your child writes in it unprompted — no reminders this time.", ar: "اترك الدفتر ظاهرًا وانظر إن كتب فيه طفلك دون تذكير هذه المرة." },
      { en: "Self-driven recognition of personal accomplishment.", ar: "تقدير ذاتي للإنجاز دون الحاجة لتذكير." },
      { tags: [], strengthsSupported: ["confidence"], stage: "independentApplication" }),

    act("anx-02", "anxiety", [6, 12],
      { en: "Guided Breathing With Worry Review", ar: "تنفس موجه مع مراجعة القلق" },
      { en: "Pair a calming technique with reviewing the worry jar together", ar: "دمج تقنية تهدئة مع مراجعة وعاء القلق معًا" },
      { en: "The worry jar from earlier in the week", ar: "وعاء القلق المستخدم سابقًا هذا الأسبوع" },
      { min: 10, max: 15 }, "medium",
      { en: "Take 5 slow breaths together before opening the jar to review it.", ar: "خذا 5 أنفاس بطيئة معًا قبل فتح الوعاء لمراجعته." },
      { en: "A calming technique linked to an existing coping tool.", ar: "تقنية تهدئة مرتبطة بأداة تأقلم موجودة بالفعل." },
      { tags: [], strengthsSupported: ["creativity"], stage: "guidedPractice" }),
    act("anx-03", "anxiety", [6, 12],
      { en: "Independent Worry Jar Use", ar: "استخدام مستقل لوعاء القلق" },
      { en: "Use the coping tool independently when a worry comes up", ar: "استخدام أداة التأقلم بشكل مستقل عند ظهور قلق" },
      { en: "The worry jar, kept in an accessible spot", ar: "وعاء القلق في مكان يسهل الوصول إليه" },
      { min: 5, max: 10 }, "easy",
      { en: "Notice out loud if your child uses the jar on their own, without prompting it.", ar: "لاحظ بصوت عالٍ إن استخدم طفلك الوعاء بمفرده دون تذكير." },
      { en: "Independent use of a calming strategy in the moment.", ar: "استخدام مستقل لاستراتيجية تهدئة في حينه." },
      { tags: [], strengthsSupported: [], stage: "independentApplication" }),
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
  function scoreActivity(activity, needDomain, profile, interestTags, strengthDomains, goalDomains, usageCount, domainOccurrenceIndex) {
    const needMatch = activity.targetNeeds[0] === needDomain ? 40
      : activity.targetNeeds.includes(needDomain) ? 25 : 5;
    const ageMatch = ageMatchScore(activity, profile.age);
    const hasInterestOverlap = activity.tags.some((t) => interestTags.includes(t));
    const hasAdaptationMatch = (activity.interestAdaptations || []).some((v) => v.matchTags.some((t) => interestTags.includes(t)));
    const interestMatch = (hasInterestOverlap ? 15 : 0) + (hasAdaptationMatch ? 5 : 0);
    const strengthMatch = activity.strengthsSupported.some((s) => strengthDomains.includes(s)) ? 8 : 0;
    const goalMatch = goalDomains.includes(activity.targetNeeds[0]) ? 5 : 0;
    const devMatch = developmentalMatchScore(activity, profile.age);
    // DEFECT 2 FIX — deterministic progression, not random shuffling:
    // domainOccurrenceIndex is "how many times THIS domain has already
    // appeared earlier in the week" (0 the first time, 1 the second, ...).
    // An activity whose authored `stage` matches that index gets a bonus,
    // so the week naturally walks introduction -> guidedPractice ->
    // independentApplication -> reflection instead of repeating one activity.
    // NeedMatch/AgeMatch/DevMatch still dominate the ceiling (65 pts) —
    // progression only breaks ties among activities that already fit the need.
    // Weighted at 20 (>= max possible interestMatch of 20) so, among
    // candidates that already match the SAME need, walking to the correct
    // next stage reliably outranks an interest-adapted but already-used
    // earlier-stage activity. This was tuned after a validation run showed
    // a weight of 12 let a strongly interest-matched "introduction" activity
    // keep winning over an available, untried "independentApplication" one.
    const progressionMatch = STAGE_ORDER[activity.stage] === domainOccurrenceIndex ? 20 : 0;
    // Existing per-activity repeat penalty still applies underneath, so even
    // domains with only one authored activity taper off rather than scoring
    // identically every time.
    const variety = -8 * (usageCount || 0);
    const total = needMatch + ageMatch + interestMatch + strengthMatch + goalMatch + devMatch + progressionMatch + variety;
    return {
      total,
      breakdown: { needMatch, ageMatch, interestMatch, strengthMatch, goalMatch, devMatch, progressionMatch, variety },
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

  /**
   * scoreKbActivity — sibling to scoreActivity() for KB-sourced activities.
   * Same weighting philosophy and priority order (NeedMatch > Age/Dev >
   * Progression > Interest > Strength > Variety), so KB and legacy
   * activities for the same domain compete on equal footing: whichever
   * scores higher for THIS profile/day is chosen, never a hardcoded
   * preference for one source over the other. KB activities don't yet
   * carry strengthsSupported tags, so strengthMatch is always 0 for them —
   * a legacy activity can still win a tie via its strength match.
   */
  function scoreKbActivity(activity, needDomain, profile, interestTags, strengthDomains, goalDomains, usageCount, domainOccurrenceIndex) {
    const needMatch = activity.targetNeeds[0] === needDomain ? 40 : 5;
    const ageMatch = ageMatchScore(activity, profile.age);
    const match = kbInterestMatch(activity, interestTags);
    const interestMatch = match ? 20 : 0;
    const strengthMatch = 0;
    const goalMatch = goalDomains.includes(activity.targetNeeds[0]) ? 5 : 0;
    const devMatch = developmentalMatchScore(activity, profile.age);
    const progressionMatch = STAGE_ORDER[activity.stage] === domainOccurrenceIndex ? 20 : 0;
    const variety = -8 * (usageCount || 0);
    const total = needMatch + ageMatch + interestMatch + strengthMatch + goalMatch + devMatch + progressionMatch + variety;
    return {
      total,
      breakdown: { needMatch, ageMatch, interestMatch, strengthMatch, goalMatch, devMatch, progressionMatch, variety },
      hasAdaptationMatch: !!match,
      kbInterestKey: match ? match.key : null,
    };
  }

  // Dispatches to the right scorer based on activity source — the single
  // seam PlanSelector uses so it never needs to know which pool an activity
  // came from.
  function scoreAny(activity, needDomain, profile, interestTags, strengthDomains, goalDomains, usageCount, domainOccurrenceIndex) {
    return activity._kb
      ? scoreKbActivity(activity, needDomain, profile, interestTags, strengthDomains, goalDomains, usageCount, domainOccurrenceIndex)
      : scoreActivity(activity, needDomain, profile, interestTags, strengthDomains, goalDomains, usageCount, domainOccurrenceIndex);
  }

  /**
   * pickActivityAdaptationUnified — like pickActivityAdaptation(), but also
   * handles KB activities. KB interestAdaptations are a single explanatory
   * sentence describing HOW to vary the practice for that interest (not a
   * full title/materials swap), so it comes back as `interestNote` and gets
   * folded into the activity card/report rather than replacing the title.
   */
  function pickActivityAdaptationUnified(activity, interestTags) {
    if (activity._kb) {
      const match = kbInterestMatch(activity, interestTags);
      return {
        title: activity.title,
        materials: activity.materials,
        parentInstructions: activity.parentInstructions,
        interestNote: match ? match.text : null,
      };
    }
    const base = pickActivityAdaptation(activity, interestTags);
    return Object.assign({ interestNote: null }, base);
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

  function PlanSelector(priorities, strengths, profile, lang, saudiContext) {
    const interestTags = canonicalInterestTags(profile.interests);
    const daySchedule = buildDaySchedule(priorities);
    const usage = {}; // activityId -> times used so far this week
    const domainOccurrence = {}; // domain -> times this domain has appeared so far
    const explain = [];

    const days = daySchedule.map((needDomain, dayIdx) => {
      const occIndex = domainOccurrence[needDomain] || 0;

      // Candidate pool = legacy hand-authored activities for this domain PLUS
      // (when the verified KB loaded) its KB-sourced activities for this
      // domain. Both are scored with the same priority order (Need > Age/Dev
      // > Progression > Interest > Strength > Variety) via scoreAny(), so the
      // KB never simply overrides the legacy content — it only wins a given
      // day if it actually scores higher for this child/day.
      const legacyPool = KNOWLEDGE_BASE.filter((a) => a.targetNeeds.includes(needDomain) || a.targetNeeds[0] === needDomain);
      const kbPool = (EXTERNAL_KB_STATUS === "loaded" && KB_ACTIVITIES_BY_ENGINE_DOMAIN[needDomain]) || [];
      const combinedPool = kbPool.concat(legacyPool);

      const scoreAll = (pool) => pool
        .map((a) => ({ activity: a, ...scoreAny(a, needDomain, profile, interestTags, strengths, priorities, usage[a.id], occIndex) }))
        .sort((a, b) => b.total - a.total || (a.activity.id < b.activity.id ? -1 : 1)); // deterministic tie-break

      const candidates = scoreAll(combinedPool);
      const pool = candidates.length ? candidates : scoreAll(KNOWLEDGE_BASE);

      const chosen = pool[0];
      usage[chosen.activity.id] = (usage[chosen.activity.id] || 0) + 1;
      domainOccurrence[needDomain] = occIndex + 1;
      const adapted = pickActivityAdaptationUnified(chosen.activity, interestTags);
      const isYoung = profile.age <= 8;
      const durationMin = isYoung ? chosen.activity.duration.min : chosen.activity.duration.max;
      const difficultyKey = chosen.activity.difficultyBase === "easy" ? "Easy" : (isYoung ? "Easy" : "Medium");

      // SaudiContextLayer hook — every day's final materials/instructions
      // pass through here. When the verified KB is loaded and the chosen
      // activity carries saudiContextTags, adapt() attaches a real,
      // KB-authored cultural note (family/home-school/local-materials/
      // bilingual) keyed off those tags; otherwise it stays a documented
      // pass-through exactly as before.
      const kbTags = (chosen.activity._kbRaw && chosen.activity._kbRaw.saudiContextTags) || [];
      const culturallyAdapted = saudiContext.adapt(
        { title: adapted.title[lang], materials: adapted.materials[lang], tip: adapted.parentInstructions[lang] },
        { domain: needDomain, lang, age: profile.age, saudiContextTags: kbTags },
      );

      const why = [];
      why.push(`primary need = ${needDomain}${chosen.breakdown.needMatch === 40 ? " (direct match)" : " (related match)"}`);
      why.push(`age appropriate for ${profile.age} (ageMatch=${chosen.breakdown.ageMatch})`);
      if (chosen.breakdown.interestMatch > 0) why.push(`matched interest tag${chosen.hasAdaptationMatch ? " with adapted variant" : ""}`);
      if (chosen.breakdown.strengthMatch > 0) why.push(`supports identified strength(s): ${chosen.activity.strengthsSupported.join(", ")}`);
      if (chosen.breakdown.progressionMatch > 0) why.push(`progression stage = ${chosen.activity.stage} (occurrence #${occIndex + 1} for this need)`);
      explain.push({ day: dayIdx, activityId: chosen.activity.id, needDomain, source: chosen.activity._kb ? "kb" : "legacy", score: chosen.total, breakdown: chosen.breakdown, why });

      const raw = chosen.activity._kbRaw;
      const interestNoteLocalized = adapted.interestNote ? adapted.interestNote[lang] : null;

      return {
        day: DAY_LABELS[lang][dayIdx],
        domain: needDomain,
        activityId: chosen.activity.id,
        stage: chosen.activity.stage,
        title: culturallyAdapted.title,
        goal: chosen.activity.goal[lang],
        duration: lang === "ar" ? `${durationMin} دقيقة` : `${durationMin} min`,
        difficulty: DIFFICULTY_LABEL[lang][difficultyKey],
        materials: culturallyAdapted.materials,
        tip: culturallyAdapted.tip,
        evidenceTag: chosen.activity.evidenceTag,
        // Internal-only provenance/data for evidence selection — never
        // rendered directly to parents.
        evidenceSourceIds: raw ? raw.evidenceSourceIds : null,
        contentStatus: raw ? raw.contentStatus : "legacy_authored_activity",
        // Full parent-facing instruction card for the report's
        // "How to Do This Week's Activities" section.
        howTo: {
          title: culturallyAdapted.title,
          purpose: chosen.activity.goal[lang],
          duration: lang === "ar" ? `${durationMin} دقيقة` : `${durationMin} min`,
          materials: raw ? raw.materials[lang] : [adapted.materials[lang]],
          steps: raw ? raw.steps[lang] : [adapted.parentInstructions[lang]],
          parentScript: raw ? raw.parentScript[lang] : adapted.parentInstructions[lang],
          parentDo: raw ? raw.parentDo[lang] : [],
          parentAvoid: raw ? raw.parentAvoid[lang] : [],
          successIndicator: raw ? raw.successIndicator[lang] : chosen.activity.expectedOutcome[lang],
          reflectionQuestion: raw ? raw.reflectionQuestion[lang]
            : (lang === "ar" ? "ما الذي أعجبك في هذا النشاط، وماذا تود تجربته لاحقًا؟" : "What did you enjoy about this activity, and what would you like to try next?"),
          interestNote: interestNoteLocalized,
          culturalNote: culturallyAdapted.culturalNote || null,
          stage: chosen.activity.stage,
        },
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
   *    the Developing Child/Harvard) rather than inventing a new source list.
   *
   *    RESTRUCTURED (Part B) into a provenance schema so every record can
   *    eventually carry: id, sourceOrganization, sourceTitle, sourceType,
   *    country, authorityType, evidenceLevel, url, lastVerified,
   *    applicableAgeRanges, applicableDomains, supports, verificationStatus.
   *
   *    IMPORTANT — none of the existing international entries below have had
   *    their exact titles/URLs fact-checked against the live source, so they
   *    are honestly marked "requires-verification", NOT "verified". Nothing
   *    in this file is ever rendered as an "authoritative" source unless its
   *    verificationStatus is exactly "verified" (see EvidenceKnowledgeBase.select()).
   * ===================================================================== */
  const INTERNATIONAL_KNOWLEDGE = [
    { id: "intl-who-01", sourceOrganization: "World Health Organization", sourceTitle: { en: "Guidelines on Parenting for Early & Middle Childhood", ar: "إرشادات التربية للطفولة المبكرة والمتوسطة" },
      sourceType: "guideline", country: "International", authorityType: "international", evidenceLevel: "organizational-guideline",
      url: null, lastVerified: null, applicableAgeRanges: [[6, 12]], applicableDomains: ["emotionalRegulation", "anxiety", "frustrationTolerance"],
      supports: "general", verificationStatus: "requires-verification" },
    { id: "intl-cdc-01", sourceOrganization: "CDC", sourceTitle: { en: "Positive Parenting Tips, Ages 6–12", ar: "نصائح التربية الإيجابية، الأعمار 6-12" },
      sourceType: "guideline", country: "International", authorityType: "international", evidenceLevel: "organizational-guideline",
      url: null, lastVerified: null, applicableAgeRanges: [[6, 12]], applicableDomains: ["attention", "behavior", "dailyRoutines", "motivation"],
      supports: "general", verificationStatus: "requires-verification" },
    { id: "intl-aap-01", sourceOrganization: "American Academy of Pediatrics", sourceTitle: { en: "HealthyChildren.org — Middle Childhood", ar: "HealthyChildren.org — مرحلة الطفولة المتوسطة" },
      sourceType: "guideline", country: "International", authorityType: "international", evidenceLevel: "organizational-guideline",
      url: null, lastVerified: null, applicableAgeRanges: [[6, 12]], applicableDomains: ["confidence", "reading", "independence", "sleep", "screenUse"],
      supports: "general", verificationStatus: "requires-verification" },
    { id: "intl-unicef-01", sourceOrganization: "UNICEF", sourceTitle: { en: "Parenting Resources", ar: "موارد التربية" },
      sourceType: "guideline", country: "International", authorityType: "international", evidenceLevel: "organizational-guideline",
      url: null, lastVerified: null, applicableAgeRanges: [[6, 12]], applicableDomains: ["socialSkills", "peerRelationships", "responsibility", "empathy"],
      supports: "general", verificationStatus: "requires-verification" },
    { id: "intl-harvard-01", sourceOrganization: "Center on the Developing Child, Harvard", sourceTitle: { en: "Serve and Return Interaction", ar: "تفاعل المبادرة والاستجابة" },
      sourceType: "research-summary", country: "International", authorityType: "international", evidenceLevel: "research-summary",
      url: null, lastVerified: null, applicableAgeRanges: [[6, 12]], applicableDomains: ["executiveFunction", "communication", "problemSolving", "resilience", "creativity"],
      supports: "general", verificationStatus: "requires-verification" },
  ];

  // PLACEHOLDER — intentionally empty. Do NOT populate from memory. A
  // separately researched and verified Saudi knowledge-base file will be
  // supplied later; only records with real, checked sourceOrganization,
  // sourceTitle, url, and lastVerified fields should ever be added here,
  // and only then with verificationStatus: "verified".
  const SAUDI_VERIFIED_KNOWLEDGE = [];

  const DOMAIN_TO_EVIDENCE = {
    attention: "intl-cdc-01", executiveFunction: "intl-harvard-01", emotionalRegulation: "intl-who-01", anxiety: "intl-who-01",
    socialSkills: "intl-unicef-01", peerRelationships: "intl-unicef-01", confidence: "intl-aap-01", communication: "intl-harvard-01",
    reading: "intl-aap-01", behavior: "intl-cdc-01", frustrationTolerance: "intl-who-01", independence: "intl-aap-01",
    dailyRoutines: "intl-cdc-01", sleep: "intl-aap-01", screenUse: "intl-aap-01", motivation: "intl-cdc-01",
    responsibility: "intl-unicef-01", problemSolving: "intl-harvard-01", resilience: "intl-who-01", creativity: "intl-harvard-01", empathy: "intl-unicef-01",
  };

  /**
   * EvidenceKnowledgeBase — the single lookup surface for evidence records.
   * Prefers a verified Saudi source for a domain if one exists (it never
   * will until a real file is supplied — SAUDI_VERIFIED_KNOWLEDGE is empty),
   * otherwise falls back to the international "requires-verification" pool.
   * A record is NEVER labeled/returned as authoritative unless
   * verificationStatus === "verified" — enforced in select(), not left to callers.
   */
  const EvidenceKnowledgeBase = {
    all: [...SAUDI_VERIFIED_KNOWLEDGE, ...INTERNATIONAL_KNOWLEDGE],
    byId(id) { return this.all.find((r) => r.id === id) || null; },
    select(usedDomains) {
      const records = [];
      const seen = new Set();
      usedDomains.forEach((domain) => {
        const saudiMatch = SAUDI_VERIFIED_KNOWLEDGE.find(
          (r) => r.verificationStatus === "verified" && (r.applicableDomains || []).includes(domain),
        );
        const record = saudiMatch || this.byId(DOMAIN_TO_EVIDENCE[domain] || "intl-cdc-01");
        if (record && !seen.has(record.id)) { seen.add(record.id); records.push(record); }
      });
      if (!records.length) records.push(this.byId("intl-cdc-01"));
      return records;
    },
    // Backward-compatible shape for the existing docs/index.html rendering
    // code (`e.org`, `e.en`/`e.ar`) — derived from the richer schema above so
    // the UI does not need to change to consume the new provenance model.
    toLegacyShape(record) {
      return { org: record.sourceOrganization, en: record.sourceTitle.en, ar: record.sourceTitle.ar, verificationStatus: record.verificationStatus };
    },
  };
  function EvidenceSelector(usedDomains) {
    return EvidenceKnowledgeBase.select(usedDomains).map((r) => EvidenceKnowledgeBase.toLegacyShape(r));
  }

  /* =====================================================================
   * 9. SAUDI CONTEXT LAYER (Part B) — activated once the verified KB is
   *    loaded. Uses ONLY the KB's own bilingual saudiContextLayer
   *    .adaptationRules, keyed off an activity's saudiContextTags — never
   *    invented content, and never a generic "this is for a Saudi family"
   *    banner. When the KB isn't loaded, or an activity carries no
   *    saudiContextTags, adapt() stays a pass-through exactly as before.
   * ===================================================================== */
  function SaudiContextLayer(profile, lang) {
    // Structured metadata hooks for future cultural adaptation. Populated
    // conservatively from what the profile actually contains — no assumed
    // defaults about family structure, religiosity, or practices, and no
    // stereotyping. Fields left null are genuinely unknown, not guessed.
    const culturalMetadata = {
      languagePreference: lang,
      bilingualHousehold: null, // not currently collected by the UI
      familyContextTag: null,   // reserved for future, non-stereotyping context tags
      siblingSupportHook: null, // reserved: sibling-involved activity variants
      homeRoutineHook: null,    // reserved: home-routine-specific adaptations
      schoolParticipationHook: null, // reserved: KSA school-calendar-aware adaptations
      kbContextActive: EXTERNAL_KB_STATUS === "loaded",
    };

    const kbRules = (EXTERNAL_KB && EXTERNAL_KB.saudiContextLayer && EXTERNAL_KB.saudiContextLayer.adaptationRules) || [];
    const RULE_BY_ID = Object.fromEntries(kbRules.map((r) => [r.id, r]));
    // Maps the KB's own saudiContextTags (attached per-activity) to the
    // KB's own adaptationRules ids — a lookup table, not new content.
    const TAG_TO_RULE_ID = {
      arabic_bilingual_ready: "ARABIC_BILINGUAL",
      family_centered: "FAMILY_CENTERED",
      sibling_optional: "FAMILY_CENTERED",
      home_school_connection: "HOME_SCHOOL",
      school_participation: "HOME_SCHOOL",
      locally_available_materials: "LOCAL_MATERIALS",
    };
    const PRIORITY_ORDER = ["FAMILY_CENTERED", "LOCAL_MATERIALS", "ARABIC_BILINGUAL", "HOME_SCHOOL"];

    return {
      metadata: culturalMetadata,
      // adapt(content, context) -> content
      // Pass-through when the KB isn't loaded or the activity has no
      // saudiContextTags (exactly the original documented behavior).
      // Otherwise picks ONE most-relevant KB-authored rule for the tags
      // present on this specific activity and attaches it as
      // `content.culturalNote` — a real, non-stereotyping, tag-driven note,
      // not a decorative label.
      adapt(content, context) {
        context = context || {};
        const tags = context.saudiContextTags || [];
        if (!tags.length || !kbRules.length) return content;
        const ruleId = PRIORITY_ORDER.find(
          (id) => tags.some((tag) => TAG_TO_RULE_ID[tag] === id) && RULE_BY_ID[id],
        );
        const rule = ruleId ? RULE_BY_ID[ruleId] : null;
        if (!rule) return content;
        return Object.assign({}, content, {
          culturalNote: rule[lang === "ar" ? "ruleAr" : "ruleEn"],
        });
      },
    };
  }

  /* =====================================================================
   * 10. REFERRAL SAFETY ENGINE (Defect 3 fix + Part B routing) — tiered,
   *     deterministic, never diagnostic. Replaces the old single-threshold
   *     ReferralEngine, which treated ordinary frustration/crying/difficulty
   *     calming down as equivalent to a signal needing a licensed counselor.
   *     Routing levels are the 7 conceptual categories from Part B — these
   *     are ROUTING TIERS, not diagnoses.
   * ===================================================================== */
  const SAUDI_CONTEXT_LEVELS = {
    NORMAL_DEVELOPMENTAL_SUPPORT: "normalDevelopmentalSupport",
    PARENT_GUIDED_SUPPORT: "parentGuidedSupport",
    SCHOOL_EDUCATIONAL_SUPPORT: "schoolEducationalSupport",
    PRIMARY_HEALTHCARE_CONSULTATION: "primaryHealthcareConsultation",
    DEVELOPMENTAL_BEHAVIORAL_ASSESSMENT: "developmentalBehavioralAssessment",
    CHILD_ADOLESCENT_MENTAL_HEALTH_ASSESSMENT: "childAdolescentMentalHealthAssessment",
    SAFEGUARDING_URGENT_ESCALATION: "safeguardingUrgentEscalation",
  };
  // Domains routed toward a mental-health-style assessment track (vs. a
  // developmental-behavioral track) IF a case clears the higher tiers below.
  const EMOTIONAL_TRACK_DOMAINS = ["emotionalRegulation", "anxiety", "resilience", "peerRelationships"];
  const REFERRAL_PROFESSIONAL = {
    attention: { en: "a pediatrician", ar: "طبيب الأطفال" }, executiveFunction: { en: "a pediatrician", ar: "طبيب الأطفال" },
    emotionalRegulation: { en: "a licensed counselor", ar: "مستشار مرخّص" }, anxiety: { en: "a licensed counselor", ar: "مستشار مرخّص" },
    socialSkills: { en: "a school counselor", ar: "مرشد مدرسي" }, peerRelationships: { en: "a school counselor", ar: "مرشد مدرسي" },
    communication: { en: "a speech-language specialist", ar: "أخصائي تخاطب" }, reading: { en: "a speech-language specialist", ar: "أخصائي تخاطب" },
    behavior: { en: "a pediatrician", ar: "طبيب الأطفال" }, sleep: { en: "a pediatrician", ar: "طبيب الأطفال" },
    resilience: { en: "a licensed counselor", ar: "مستشار مرخّص" }, frustrationTolerance: { en: "a pediatrician", ar: "طبيب الأطفال" },
  };

  /**
   * Deterministic tiered heuristic — documented thresholds, no randomness.
   * Ordinary parenting concerns (a handful of matched keywords in ONE domain,
   * no severity/persistence/functional-impairment/school/family/safety
   * signals) land at PARENT_GUIDED_SUPPORT, which shows guidance only — no
   * professional-referral banner. Escalation requires converging evidence,
   * not a single keyword hit.
   */
  function ReferralSafetyEngine(caseSignals, profile, priorities, lang) {
    const { safetyFlag, severityFlag, persistenceFlag, functionalImpairmentFlag, schoolImpactFlag, familyImpactFlag, explicitHelpRequestFlag } = caseSignals.riskSignals;
    const top = caseSignals.concernSignals[0];
    const intensity = top ? top.score : 0;

    if (safetyFlag) {
      return { tier: SAUDI_CONTEXT_LEVELS.SAFEGUARDING_URGENT_ESCALATION, showReferral: true, referralText: buildReferralText("safeguarding", null, lang) };
    }

    const weight = intensity + (severityFlag ? 3 : 0) + (persistenceFlag ? 3 : 0) + (functionalImpairmentFlag ? 4 : 0) + (schoolImpactFlag ? 2 : 0) + (familyImpactFlag ? 2 : 0);

    if (explicitHelpRequestFlag) {
      return { tier: SAUDI_CONTEXT_LEVELS.PRIMARY_HEALTHCARE_CONSULTATION, showReferral: true, referralText: buildReferralText("primaryHealthcare", top ? top.domain : null, lang) };
    }
    if (!top) {
      return { tier: SAUDI_CONTEXT_LEVELS.NORMAL_DEVELOPMENTAL_SUPPORT, showReferral: false, referralText: null };
    }
    if (weight >= 14) {
      const track = EMOTIONAL_TRACK_DOMAINS.includes(top.domain)
        ? SAUDI_CONTEXT_LEVELS.CHILD_ADOLESCENT_MENTAL_HEALTH_ASSESSMENT
        : SAUDI_CONTEXT_LEVELS.DEVELOPMENTAL_BEHAVIORAL_ASSESSMENT;
      return { tier: track, showReferral: true, referralText: buildReferralText("assessment", top.domain, lang) };
    }
    if (weight >= 9) {
      return { tier: SAUDI_CONTEXT_LEVELS.PRIMARY_HEALTHCARE_CONSULTATION, showReferral: true, referralText: buildReferralText("primaryHealthcare", top.domain, lang) };
    }
    if (schoolImpactFlag) {
      return { tier: SAUDI_CONTEXT_LEVELS.SCHOOL_EDUCATIONAL_SUPPORT, showReferral: false, referralText: null };
    }
    // Ordinary-range concern — e.g. frustration + crying + difficulty calming
    // down with no severity/persistence/functional-impairment signal. Stays
    // at parent-guided support: guidance card only, no referral banner.
    return { tier: SAUDI_CONTEXT_LEVELS.PARENT_GUIDED_SUPPORT, showReferral: false, referralText: null };
  }

  function buildReferralText(kind, domain, lang) {
    const topicLabel = domain && DOMAIN_BY_ID[domain] ? DOMAIN_BY_ID[domain][lang] : (lang === "ar" ? "هذا الجانب" : "this area");
    const who = domain ? (REFERRAL_PROFESSIONAL[domain] || REFERRAL_PROFESSIONAL.emotionalRegulation)[lang] : (lang === "ar" ? "مختص مؤهل" : "a qualified professional");
    if (kind === "safeguarding") {
      return lang === "ar"
        ? "بناءً على ما شاركته، من المهم التواصل في أقرب وقت ممكن مع مختص مؤهل أو جهة دعم مختصة. هذه ليست أداة تشخيص أو طوارئ."
        : "Based on what you've shared, it's important to reach out to a qualified professional or support service as soon as possible. This tool is not a diagnostic or emergency service.";
    }
    if (lang === "ar") {
      return `بناءً على ما شاركته، قد يكون من المفيد التحدث مع ${who} بخصوص ${topicLabel} كنقطة انطلاق. هذه ملاحظة عامة وليست تشخيصًا.`;
    }
    return `Based on what you've shared, it may help to speak with ${who} about ${topicLabel} as a starting point. This is a general educational pointer, not a diagnosis.`;
  }

  /**
   * kbSourceToLegacyShape — reshapes a KB sourceRegistry record into the
   * same {org, en, ar} shape the existing UI already renders (see
   * EvidenceKnowledgeBase.toLegacyShape above), with the caveat/URL/status
   * kept alongside for callers that want to render them. Never invents a
   * field: caveatEn/caveatAr are only present when the source record itself
   * has them (i.e. verified_with_caveat awareness sources).
   */
  function kbSourceToLegacyShape(src) {
    return {
      org: src.sourceOrganization,
      en: src.sourceTitleEn,
      ar: src.sourceTitleAr,
      verificationStatus: src.verificationStatus,
      caveatEn: src.caveatEn || null,
      caveatAr: src.caveatAr || null,
      url: src.url || null,
    };
  }

  // Looks up which KB source ids (if any) actually support a triggered
  // referral tier / domain-specific rule — used only to attach honest
  // citations to the evidence list, never to change tier thresholds.
  function kbReferralSourceIds(tierId, kbDomainId) {
    if (!EXTERNAL_KB || !EXTERNAL_KB.referralSafetyEngine) return [];
    const ids = new Set();
    const tier = (EXTERNAL_KB.referralSafetyEngine.tiers || []).find((t) => t.id === tierId);
    (tier && tier.sourceIds || []).forEach((id) => ids.add(id));
    (EXTERNAL_KB.referralSafetyEngine.domainSpecificRules || []).forEach((r) => {
      if (r.domain === kbDomainId && r.sourceId) ids.add(r.sourceId);
    });
    return Array.from(ids);
  }

  /* =====================================================================
   * 11. TOP-LEVEL ENTRY POINT — single source of truth for the whole plan.
   *     Pipeline order matches the required architecture:
   *     CaseAnalyzer -> DevelopmentalAnalyzer -> NeedsPriorityEngine ->
   *     SaudiContextLayer -> EvidenceKnowledgeBase -> PlanSelector ->
   *     GuidanceSelector -> ReferralSafetyEngine -> PersonalizedPlan
   * ===================================================================== */
  function generatePersonalizedPlan(profile, lang) {
    // profile: { age, gender, grade:{en,ar}|string, interests:[strings],
    //            strengths:[strings], concernText: string }
    const caseSignals = CaseAnalyzer(profile);
    const devInfo = DevelopmentalAnalyzer(profile);
    const { priorities, strengths } = NeedsPriorityEngine(caseSignals, devInfo, profile);
    const saudiContext = SaudiContextLayer(profile, lang);
    const { days, explain } = PlanSelector(priorities, strengths, profile, lang, saudiContext);
    const guidanceKeys = GuidanceSelector(priorities);
    const usedDomains = Array.from(new Set([...priorities, ...days.map((d) => d.evidenceTag)]));
    const referral = ReferralSafetyEngine(caseSignals, profile, priorities, lang);

    // EVIDENCE PROVENANCE — when the verified KB is loaded, evidence is
    // built strictly from (a) evidenceSourceIds actually attached to the
    // activities selected this week and (b) sourceIds actually tied to the
    // referral tier/domain rule that triggered, filtered to
    // verified/verified_with_caveat only, deduplicated, never invented. If
    // that yields nothing (e.g. KB loaded but no activity matched), or the
    // KB failed to load, fall back to the original validated
    // EvidenceSelector exactly as before.
    let evidence;
    if (EXTERNAL_KB_STATUS === "loaded") {
      const ids = new Set();
      days.forEach((d) => (d.evidenceSourceIds || []).forEach((id) => ids.add(id)));
      if (referral.showReferral) {
        const topDomain = caseSignals.concernSignals[0] ? caseSignals.concernSignals[0].domain : null;
        const kbDomain = topDomain ? ENGINE_TO_KB_DOMAIN[topDomain] : null;
        kbReferralSourceIds(referral.tier, kbDomain).forEach((id) => ids.add(id));
      }
      const kbEvidence = Array.from(ids)
        .map((id) => KB_SOURCE_BY_ID[id])
        .filter((src) => src && (src.verificationStatus === "verified" || src.verificationStatus === "verified_with_caveat"))
        .map(kbSourceToLegacyShape);
      evidence = kbEvidence.length ? kbEvidence : EvidenceSelector(usedDomains);
    } else {
      evidence = EvidenceSelector(usedDomains);
    }

    const priorityLabels = priorities.map((p) => DOMAIN_BY_ID[p][lang]);
    const summary = lang === "ar"
      ? `في هذه المرحلة العمرية، عادة ما يكون الأطفال في طور ${devInfo.textAr}. بناءً على ما شاركته الأسرة، يبدو أن أبرز مجالات التركيز الحالية هي: ${priorityLabels.join("، ")}.`
      : `At this age, children are typically ${devInfo.textEn}. Based on what the family shared, the current focus areas appear to be: ${priorityLabels.join(", ")}.`;

    // DEFECT 2 FIX — Weekly Goals must be distinct developmental objectives,
    // not one bullet per day/activity instance. Derive exactly one goal per
    // distinct priority domain (its "introduction"-stage activity's goal),
    // in priority order, instead of slicing the raw 7-day sequence. Prefers
    // the KB's own developmentalGoal text for the domain when loaded (same
    // underlying goal text the KB's introduction activity already uses),
    // else the legacy KNOWLEDGE_BASE goal — never both, never a guess.
    const goals = priorities.slice(0, 5).map((domain) => {
      const kbDomain = EXTERNAL_KB_STATUS === "loaded" ? KB_DOMAIN_BY_ID[ENGINE_TO_KB_DOMAIN[domain]] : null;
      if (kbDomain && kbDomain.developmentalGoal) return kbDomain.developmentalGoal[lang];
      const introActivity = KNOWLEDGE_BASE.find((a) => a.targetNeeds[0] === domain && a.stage === "introduction")
        || KNOWLEDGE_BASE.find((a) => a.targetNeeds[0] === domain);
      return introActivity ? introActivity.goal[lang] : "";
    }).filter(Boolean);

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
      referralText: referral.referralText,
      showReferral: referral.showReferral,
      referralTier: referral.tier, // additive — not read by existing UI, safe
      culturalContext: saudiContext.metadata, // additive — Part B hook, not read by existing UI
      kbStatus: EXTERNAL_KB_STATUS, // additive — "loaded" | "failed" | "not_loaded", dev-facing only
      _explain: explain, // internal only — for testing/research, not prominent in UI
    };
  }

  const GTPersonalization = {
    NEED_DOMAINS, KNOWLEDGE_BASE, GUIDANCE_BANK,
    INTERNATIONAL_KNOWLEDGE, SAUDI_VERIFIED_KNOWLEDGE, EvidenceKnowledgeBase,
    SAUDI_CONTEXT_LEVELS, SaudiContextLayer, ReferralSafetyEngine,
    CaseAnalyzer, DevelopmentalAnalyzer, NeedsPriorityEngine, PlanSelector,
    GuidanceSelector, EvidenceSelector,
    generatePersonalizedPlan,
    // Saudi Verified Knowledge Base v1 integration — additive exports only.
    loadKnowledgeBase,
    ready: loadKnowledgeBase, // alias: callers can `await GTPersonalization.ready()`
    ENGINE_TO_KB_DOMAIN,
    getKbStatus: () => EXTERNAL_KB_STATUS,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = GTPersonalization;

  } else {
    root.GTPersonalization = GTPersonalization;
  }
})(typeof window !== "undefined" ? window : globalThis);
