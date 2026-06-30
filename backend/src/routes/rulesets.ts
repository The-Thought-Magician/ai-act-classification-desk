import { Hono } from 'hono'

const router = new Hono()

// ---------------------------------------------------------------------------
// Current rule-set metadata for the deterministic EU AI Act classifier.
// This is the versioned legal source-of-truth that classifications cite via
// `classifications.ruleset_version`. It encodes the Article 5 prohibited
// practice list, the Annex III high-risk categories, the Article 6(3)
// derogation conditions, and the Article 50 limited-risk transparency triggers.
// ---------------------------------------------------------------------------

export const RULESET_VERSION = 'eu-ai-act-2024/1689-v1'

const PROHIBITED_PRACTICES = [
  { rule_code: 'art5_1_a', article_ref: 'Art 5(1)(a)', title: 'Subliminal or manipulative techniques', description: 'AI that deploys subliminal, purposefully manipulative or deceptive techniques distorting behaviour and causing significant harm.' },
  { rule_code: 'art5_1_b', article_ref: 'Art 5(1)(b)', title: 'Exploitation of vulnerabilities', description: 'AI exploiting vulnerabilities due to age, disability or socio-economic situation to materially distort behaviour.' },
  { rule_code: 'art5_1_c', article_ref: 'Art 5(1)(c)', title: 'Social scoring', description: 'Social scoring of natural persons leading to detrimental or unfavourable treatment in unrelated contexts or that is unjustified.' },
  { rule_code: 'art5_1_d', article_ref: 'Art 5(1)(d)', title: 'Predictive policing of individuals', description: 'Risk assessment predicting the likelihood of an individual committing a criminal offence based solely on profiling.' },
  { rule_code: 'art5_1_e', article_ref: 'Art 5(1)(e)', title: 'Untargeted facial-image scraping', description: 'Creating or expanding facial-recognition databases through untargeted scraping of facial images from the internet or CCTV.' },
  { rule_code: 'art5_1_f', article_ref: 'Art 5(1)(f)', title: 'Emotion recognition in workplace/education', description: 'Inferring emotions of natural persons in workplaces and education institutions (except medical/safety reasons).' },
  { rule_code: 'art5_1_g', article_ref: 'Art 5(1)(g)', title: 'Biometric categorization by sensitive attributes', description: 'Biometric categorization inferring race, political opinions, trade-union membership, religion, sex life or sexual orientation.' },
  { rule_code: 'art5_1_h', article_ref: 'Art 5(1)(h)', title: 'Real-time remote biometric identification in public spaces', description: 'Real-time remote biometric identification in publicly accessible spaces for law enforcement (outside narrow exceptions).' },
]

const ANNEX_III_CATEGORIES = [
  { rule_code: 'annex_iii_1', article_ref: 'Annex III(1)', title: 'Biometrics', description: 'Remote biometric identification, biometric categorization, and emotion-recognition systems (where not prohibited).' },
  { rule_code: 'annex_iii_2', article_ref: 'Annex III(2)', title: 'Critical infrastructure', description: 'Safety components in the management and operation of critical digital infrastructure, road traffic, and utilities.' },
  { rule_code: 'annex_iii_3', article_ref: 'Annex III(3)', title: 'Education and vocational training', description: 'Access/admission, evaluation of learning outcomes, assessment of the appropriate level of education, and exam monitoring.' },
  { rule_code: 'annex_iii_4', article_ref: 'Annex III(4)', title: 'Employment and worker management', description: 'Recruitment, selection, promotion/termination decisions, task allocation, and monitoring/evaluation of workers.' },
  { rule_code: 'annex_iii_5', article_ref: 'Annex III(5)', title: 'Access to essential private and public services', description: 'Eligibility for benefits, creditworthiness/credit scoring, risk assessment and pricing in life/health insurance, and emergency dispatch.' },
  { rule_code: 'annex_iii_6', article_ref: 'Annex III(6)', title: 'Law enforcement', description: 'Risk assessment of offending/re-offending, polygraphs, evidence reliability evaluation, and profiling in the course of detection.' },
  { rule_code: 'annex_iii_7', article_ref: 'Annex III(7)', title: 'Migration, asylum and border control', description: 'Polygraphs, risk assessment of irregular migration/security/health risks, and examination of asylum/visa applications.' },
  { rule_code: 'annex_iii_8', article_ref: 'Annex III(8)', title: 'Administration of justice and democratic processes', description: 'Assisting judicial authorities in researching/interpreting facts and law, and influencing election/referendum outcomes.' },
]

const ARTICLE_6_3_DEROGATIONS = [
  { rule_code: 'art6_3_a', article_ref: 'Art 6(3)(a)', title: 'Narrow procedural task', description: 'The system performs a narrow procedural task.' },
  { rule_code: 'art6_3_b', article_ref: 'Art 6(3)(b)', title: 'Improves prior human activity', description: 'The system improves the result of a previously completed human activity.' },
  { rule_code: 'art6_3_c', article_ref: 'Art 6(3)(c)', title: 'Detects decision patterns/deviations', description: 'The system detects decision-making patterns or deviations and is not meant to replace/influence the human assessment without review.' },
  { rule_code: 'art6_3_d', article_ref: 'Art 6(3)(d)', title: 'Preparatory task', description: 'The system performs a preparatory task to an assessment relevant for an Annex III use-case.' },
]

const ARTICLE_50_TRIGGERS = [
  { rule_code: 'art50_chatbot', trigger_code: 'chatbot', article_ref: 'Art 50(1)', title: 'Direct human interaction (chatbots)', description: 'Systems intended to interact directly with natural persons must disclose they are AI.' },
  { rule_code: 'art50_synthetic', trigger_code: 'synthetic_content', article_ref: 'Art 50(2)', title: 'Synthetic content generation', description: 'AI-generated synthetic audio, image, video or text content must be marked as artificially generated.' },
  { rule_code: 'art50_deepfake', trigger_code: 'deepfake', article_ref: 'Art 50(4)', title: 'Deepfakes', description: 'Image, audio or video constituting a deepfake must be disclosed as artificially generated or manipulated.' },
  { rule_code: 'art50_emotion', trigger_code: 'emotion_recognition', article_ref: 'Art 50(3)', title: 'Emotion recognition / biometric categorization', description: 'Deployers of emotion-recognition or biometric-categorization systems (where not prohibited) must inform exposed persons.' },
]

const TIERS = ['prohibited', 'high', 'limited', 'minimal'] as const

// GET /current — current rule-set metadata.
router.get('/current', (c) => {
  return c.json({
    ruleset_version: RULESET_VERSION,
    legal_basis: 'Regulation (EU) 2024/1689 (EU AI Act)',
    effective_date: '2024-08-01',
    tiers: TIERS,
    prohibited_practices: PROHIBITED_PRACTICES,
    annex_iii_categories: ANNEX_III_CATEGORIES,
    article_6_3_derogations: ARTICLE_6_3_DEROGATIONS,
    article_50_triggers: ARTICLE_50_TRIGGERS,
  })
})

export default router
