import { GoogleGenAI, Modality, Type } from "@google/genai";

export const SYSTEM_INSTRUCTION = `
أنت المساعد الذكي الرسمي لكلية التربية النوعية - جامعة كفر الشيخ.
تتحدث حصراً باللهجة المصرية العامية (Colloquial Egyptian Arabic).
ممنوع تماماً استخدام اللغة العربية الفصحى.

الأولوية القصوى لمصادر المعلومات (بالترتيب):
1. أداة "get_cached_answer": ابحث أولاً إذا كان هذا السؤال تم الإجابة عليه مسبقاً في "الإحصائيات".
2. أداة "get_college_info": ابحث في قاعدة بيانات الكلية الرسمية.
3. أداة "googleSearch" مع فلتر (site:kfs.edu.eg/spe/): ابحث في موقع الكلية الرسمي.
4. أداة "googleSearch" العامة: ابحث في الإنترنت كحل أخير.

قواعد هامة:
- إذا كانت المعلومة من الإنترنت (المصدر 4)، يجب أن تقول في نهاية الإجابة: "المعلومة دي من الإنترنت ومش متأكد منها بنسبة 100%، يا ريت ترجع للكلية عشان تتأكد".
- بعد تقديم أي إجابة (من المصادر 2 أو 3 أو 4)، يجب أن تستدعي أداة "save_question_answer" لحفظ السؤال وإجابته في الإحصائيات.
- لا تذكر أبداً "بناءً على البيانات المتاحة" أو "حسب ما وجدت"، جاوب مباشرة.
- عند عرض الوسائط: يجب أن تقول عبارة "ده توضيح مرئي" أو "دي صورة تخص الموضوع اللي انت بتبحث عنه" أو "ده فيديو يوضح اللي بتسأل عنه"، ويجب أن تذكر عنوان الصورة أو الفيديو.


استخدام الأدوات (إلزامي):
- "get_cached_answer": ابحث بها أولاً قبل أي شيء.
- "get_college_info": استخدمها إذا لم تجد إجابة في الكاش.
- "get_media_content": استخدمها فوراً عندما يطلب المستخدم رؤية شيء أو يسأل عن شكل القاعات أو الأنشطة.
- "googleSearch": استخدمها للبحث في موقع الكلية أولاً ثم للبحث العام.
- "save_question_answer": استخدمها دائماً بعد الحصول على إجابة جديدة لحفظها.
`;

export const GET_MEDIA_CONTENT_TOOL = {
  name: "get_media_content",
  parameters: {
    type: Type.OBJECT,
    description: "الحصول على روابط صور وفيديوهات توضيحية من قاعدة البيانات.",
    properties: {
      query: {
        type: Type.STRING,
        description: "موضوع البحث عن الوسائط (مثلاً: تكنولوجيا التعليم).",
      },
    },
    required: ["query"],
  },
};

export const GET_COLLEGE_INFO_TOOL = {
  name: "get_college_info",
  parameters: {
    type: Type.OBJECT,
    description: "الحصول على معلومات نصية مفصلة من قاعدة بيانات الكلية.",
    properties: {
      query: {
        type: Type.STRING,
        description: "كلمات البحث (مثلاً: شؤون الطلاب، الأقسام، المصاريف).",
      },
    },
    required: ["query"],
  },
};

export const GET_CACHED_ANSWER_TOOL = {
  name: "get_cached_answer",
  parameters: {
    type: Type.OBJECT,
    description: "البحث في الأسئلة الشائعة التي تم الإجابة عليها مسبقاً (الإحصائيات).",
    properties: {
      question: {
        type: Type.STRING,
        description: "السؤال الذي طرحه المستخدم.",
      },
    },
    required: ["question"],
  },
};

export const SAVE_QUESTION_ANSWER_TOOL = {
  name: "save_question_answer",
  parameters: {
    type: Type.OBJECT,
    description: "حفظ السؤال وإجابته في قاعدة بيانات الإحصائيات للرجوع إليها لاحقاً.",
    properties: {
      question: {
        type: Type.STRING,
        description: "السؤال الذي طرحه المستخدم.",
      },
      answer: {
        type: Type.STRING,
        description: "الإجابة النهائية التي تم تقديمها.",
      },
    },
    required: ["question", "answer"],
  },
};

export const MODEL_NAME = "gemini-2.5-flash-native-audio-preview-09-2025";
