import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage, Type, ThinkingLevel } from "@google/genai";
import { 
  Mic, 
  MicOff, 
  MessageSquare, 
  Info, 
  Phone, 
  MapPin, 
  GraduationCap, 
  BookOpen, 
  Globe,
  FileText,
  Upload,
  File,
  Sparkles,
  Newspaper,
  Users,
  RefreshCcw,
  Home,
  ExternalLink,
  Key,
  X,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AudioHandler } from './utils/audio';
import { 
  SYSTEM_INSTRUCTION, 
  MODEL_NAME, 
  GET_MEDIA_CONTENT_TOOL, 
  GET_COLLEGE_INFO_TOOL,
  GET_CACHED_ANSWER_TOOL,
  SAVE_QUESTION_ANSWER_TOOL
} from './constants';
import { 
  getMediaByQuery, 
  addMedia, 
  addCollegeInfo, 
  auth, 
  getCollegeInfoByQuery, 
  getAllMedia, 
  getAllCollegeInfo, 
  updateMedia, 
  deleteMedia, 
  updateCollegeInfo, 
  deleteCollegeInfo, 
  getCachedQuestion,
  addCachedQuestion,
  getAllCachedQuestions,
  deleteCachedQuestion
} from './firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface MediaItem {
  type: 'image' | 'video';
  url: string;
  title: string;
}

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

// يمكنك وضع مفتاح Gemini API الخاص بك هنا مباشرة
const HARDCODED_API_KEY = ""; 

const LOGO_URL = "https://i.imgur.com/your-logo-id.png"; // سيقوم المستخدم باستبدال هذا برابط الصورة المرفوعة

const SplashScreen = ({ onComplete }: { onComplete: () => void }) => {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1, delay: 3 }}
      onAnimationComplete={onComplete}
      className="fixed inset-0 z-[200] bg-[#0a0502] flex flex-col items-center justify-center p-6"
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ 
          duration: 1.5, 
          ease: "easeOut",
          type: "spring",
          stiffness: 100
        }}
        className="relative"
      >
        <div className="absolute inset-0 bg-orange-500/20 blur-3xl rounded-full animate-pulse" />
        <img 
          src={LOGO_URL} 
          alt="Logo" 
          className="w-48 h-48 object-contain relative z-10"
          onError={(e) => {
            // Fallback if logo fails to load
            (e.target as HTMLImageElement).src = "https://cdn-icons-png.flaticon.com/512/2991/2991148.png";
          }}
        />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 1 }}
        className="mt-8 text-center"
      >
        <h1 className="text-3xl font-bold tracking-tight text-glow mb-2">كلية التربية النوعية</h1>
        <p className="text-orange-500 font-bold uppercase tracking-[0.2em] text-xs">جامعة كفر الشيخ</p>
      </motion.div>
    </motion.div>
  );
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [transcript, setTranscript] = useState<{ role: 'user' | 'model', text?: string, media?: MediaItem }[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminTab, setAdminTab] = useState<'media' | 'info' | 'files' | 'stats'>('media');
  const [refreshKey, setRefreshKey] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [isMicCaptured, setIsMicCaptured] = useState(false);
  
  const [editingMedia, setEditingMedia] = useState<any>(null);
  const [editingInfo, setEditingInfo] = useState<any>(null);
  
  const [isSearching, setIsSearching] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(true);
  const [userApiKey, setUserApiKey] = useState<string>(localStorage.getItem('gemini_user_api_key') || '');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [chatInput, setChatInput] = useState('');
  
  const audioHandlerRef = useRef<AudioHandler | null>(null);
  const sessionRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const suppressAudioRef = useRef(false);
  const responseBuildingRef = useRef('');

  useEffect(() => {
    const checkApiKey = async () => {
      setHasApiKey(true);
    };
    checkApiKey();

    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
    });
    
    // Cleanup on unmount
    return () => {
      unsubscribe();
      if (sessionRef.current) {
        console.log("Cleanup: Closing session on unmount");
        stopSession();
      }
    };
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, currentResponse, isSearching, isAiThinking]);

  useEffect(() => {
    // Test Firestore connection on mount
    const testConn = async () => {
      try {
        const media = await getAllMedia();
        console.log("Firestore connection test: Found", media.length, "media items.");
        const info = await getAllCollegeInfo();
        console.log("Firestore connection test: Found", info.length, "info items.");
      } catch (error) {
        console.error("Firestore connection test failed:", error);
      }
    };
    testConn();
  }, []);

  const clearTranscript = () => {
    setTranscript([]);
    if (isActive) {
      stopSession();
    }
  };

  const startSession = async (requestMic: boolean = true) => {
    // Prevent multiple concurrent connection attempts
    if (status === 'connecting' || (status === 'active' && requestMic && !isMicCaptured)) {
      if (status === 'active' && requestMic && !isMicCaptured) {
        // Just activate mic for existing session
        return activateMic();
      }
      return;
    }

    try {
      setErrorMessage(null);
      
      // Cleanup any existing session before starting a new one
      if (sessionRef.current) {
        console.log("Cleanup before Connect: Closing existing session");
        stopSession();
      }
      
      setStatus('connecting');
      console.log("Starting session...");

      // Initialize AudioHandler
      audioHandlerRef.current = new AudioHandler((base64Data) => {
        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({
            audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        }
      });
      
      if (requestMic) {
        console.log("Requesting microphone access...");
        try {
          await audioHandlerRef.current.startCapture();
          setIsMicCaptured(true);
          console.log("Microphone access granted.");
        } catch (audioError: any) {
          console.error("Microphone access error:", audioError);
          const isPermissionError = audioError.name === 'NotAllowedError' || 
                                  audioError.name === 'SecurityError' ||
                                  audioError.message?.toLowerCase().includes('permission denied');
          
          if (isPermissionError) {
            setErrorMessage("تم رفض الوصول للميكروفون. يرجى الضغط على أيقونة القفل بجوار رابط الموقع في المتصفح والتأكد من تفعيل الميكروفون (Microphone: Allow).");
          } else if (audioError.name === 'NotFoundError') {
            setErrorMessage("لم يتم العثور على ميكروفون متصل. يرجى التأكد من توصيل الميكروفون.");
          } else {
            setErrorMessage(`خطأ في الوصول إلى الميكروفون: ${audioError.message}`);
          }
          setStatus('error');
          return;
        }
      }

      const apiKey = userApiKey || HARDCODED_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        setErrorMessage("يرجى إدخال مفتاح (API Key) خاص بك أو اختياره للمتابعة.");
        setShowKeyModal(true);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      console.log("Connecting to Live API with model:", MODEL_NAME);
      
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          generationConfig: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
            },
          },
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }]
          },
          tools: [
            { functionDeclarations: [
              GET_MEDIA_CONTENT_TOOL as any, 
              GET_COLLEGE_INFO_TOOL as any,
              GET_CACHED_ANSWER_TOOL as any,
              SAVE_QUESTION_ANSWER_TOOL as any
            ] }
          ],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        } as any,
        callbacks: {
          onopen: () => {
            console.log("Live API connection opened.");
            setStatus('active');
            setIsActive(true);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Debug the message structure in console
            console.log("Live Message Received:", JSON.stringify(message).substring(0, 500));

            // Handle model content
            const modelTurn = message.serverContent?.modelTurn;
            if (modelTurn) {
              const parts = modelTurn.parts;
              if (parts) {
                // Whenever we get a model turn, it's responding
                setIsSpeaking(true);
                
                for (const part of parts) {
                  // Handle audio output (if not suppressed)
                  if (part.inlineData?.data && !suppressAudioRef.current) {
                    audioHandlerRef.current?.playChunk(part.inlineData.data);
                  }
                  
                  // Handle text output (transcription or direct text)
                  if (part.text) {
                    console.log("Found text part in parts:", part.text);
                    responseBuildingRef.current += part.text;
                    setCurrentResponse(responseBuildingRef.current);
                  }
                }
              }
              
              // Direct text fallback (some versions use top level text)
              const directText = (modelTurn as any).text;
              if (directText && !responseBuildingRef.current.includes(directText)) {
                console.log("Found direct text in modelTurn:", directText);
                responseBuildingRef.current += directText;
                setCurrentResponse(responseBuildingRef.current);
              }
            }
            
            // Check for transcription in other parts of the message
            const transcription = (message as any).serverContent?.modelTurn?.text || 
                                (message as any).serverContent?.modelTurn?.parts?.[0]?.text;
            
            if (transcription && !responseBuildingRef.current.includes(transcription)) {
               console.log("Found transcription in fallback check:", transcription);
               responseBuildingRef.current = transcription;
               setCurrentResponse(transcription);
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              audioHandlerRef.current?.clearPlayback();
              setIsSpeaking(false);
              responseBuildingRef.current = '';
              setCurrentResponse('');
            }

            // Handle turn complete
            if (message.serverContent?.turnComplete) {
              setIsSpeaking(false);
              if (responseBuildingRef.current.trim()) {
                const finalResponse = responseBuildingRef.current;
                setTranscript(prev => [...prev.slice(-20), { role: 'model', text: finalResponse }]);
                responseBuildingRef.current = '';
                setCurrentResponse('');
              }
            }

            // Handle tool calls
            const toolCalls = message.toolCall?.functionCalls;
            if (toolCalls) {
              console.log("Received Tool Calls:", toolCalls);
              setIsSearching(true);
              
              const executeAndRespond = async () => {
                const session = await sessionPromise;
                const functionResponses = [];

                for (const call of toolCalls) {
                  const resultMsg = await handleTool(call.name, call.args);
                  functionResponses.push({
                    name: call.name,
                    id: call.id,
                    response: { result: resultMsg }
                  });
                }

                if (functionResponses.length > 0) {
                  session.sendToolResponse({ functionResponses });
                }
                setIsSearching(false);
              };

              executeAndRespond();
            }

            // Handle user transcription
            const userText = message.serverContent?.inputTranscription?.text;
            if (userText) {
              console.log("User said:", userText);
              setTranscript(prev => [...prev.slice(-20), { role: 'user', text: userText }]);
            }
          },
          onerror: (error: any) => {
            console.error("Live API Error:", error);
            setStatus('error');
            
            // Log specific error codes for debugging
            const errorMsg = error?.message || "";
            if (errorMsg.includes('409') || errorMsg.includes('Conflict')) {
              console.error("CRITICAL: 409 Conflict detected. Multiple concurrent connections for the same API key.");
              setErrorMessage("خطأ في الاتصال (Conflict): يبدو أن هناك جلسة أخرى مفتوحة بنفس المفتاح. يرجى الانتظار دقيقة أو التأكد من إغلاق جميع التبويبات الأخرى.");
            } else if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
              setErrorMessage("نفذت حصة الاستخدام (Quota) المخصصة للتطبيق حالياً. يرجى إدخال مفتاح API الخاص بك للمتابعة بدون انقطاع.");
              setShowKeyModal(true);
            } else if (errorMsg.includes('403') || errorMsg.includes('Forbidden')) {
              console.error("CRITICAL: 403 Forbidden detected. API Key might be invalid, restricted, or quota exceeded.");
              setErrorMessage("خطأ في الصلاحيات (Forbidden): المفتاح البرمجي غير صالح أو تخطى الحصص المتاحة.");
            } else if (errorMsg.includes('Requested entity was not found')) {
              setErrorMessage("المفتاح البرمجي غير صالح أو لم يتم اختياره. يرجى إعادة اختيار مفتاح برمجي من مشروع مدفوع.");
              setHasApiKey(false);
            } else if (error?.message?.includes('Network error')) {
              setErrorMessage("خطأ في الشبكة: يرجى التأكد من اتصال الإنترنت أو تجربة تحديث الصفحة. قد يكون ذلك بسبب قيود الخصوصية في المتصفح.");
            } else if (error?.message?.includes('service is currently unavailable')) {
              setErrorMessage("الخدمة غير متوفرة حالياً. يرجى المحاولة مرة أخرى بعد قليل.");
            } else {
              setErrorMessage("حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.");
            }
            stopSession();
          },
          onclose: () => {
            setStatus('idle');
            stopSession();
          }
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (error: any) {
      console.error("Failed to start session:", error);
      setStatus('error');
      if (error?.name === 'NotAllowedError' || error?.message?.includes('Permission denied')) {
        setErrorMessage("يرجى السماح بالوصول إلى الميكروفون من إعدادات المتصفح للمتابعة.");
      } else if (error?.message?.includes('Requested entity was not found')) {
        setErrorMessage("المفتاح البرمجي غير صالح أو لم يتم اختياره. يرجى إعادة اختيار مفتاح برمجي من مشروع مدفوع.");
        setHasApiKey(false);
      } else {
        setErrorMessage("تعذر بدء الجلسة. تأكد من إعدادات الميكروفون والمفتاح البرمجي.");
      }
      stopSession();
    }
  };

  const stopSession = () => {
    audioHandlerRef.current?.close();
    sessionRef.current?.close();
    sessionRef.current = null;
    setIsActive(false);
    setIsMicCaptured(false);
    setStatus('idle');
    setIsSpeaking(false);
  };

  const activateMic = async () => {
    if (!audioHandlerRef.current) return;
    try {
      await audioHandlerRef.current.startCapture();
      setIsMicCaptured(true);
      setErrorMessage(null);
    } catch (err: any) {
      console.error("Failed to activate mic:", err);
      setErrorMessage("تعذر تفعيل الميكروفون: " + err.message);
    }
  };

  const deactivateMic = () => {
    audioHandlerRef.current?.stopCapture();
    setIsMicCaptured(false);
  };

  const toggleSession = async () => {
    if (isActive) {
      if (isMicCaptured) {
        deactivateMic();
      } else {
        await activateMic();
      }
    } else {
      suppressAudioRef.current = false;
      await startSession(true);
    }
  };

  const handleQuickAction = (query: string) => {
    suppressAudioRef.current = false;
    if (isActive && sessionRef.current) {
      sessionRef.current.sendRealtimeInput({
        text: query
      });
    } else if (!isActive) {
      // Start session then send query
      startSession().then(() => {
        // Wait a bit for session to be active
        setTimeout(() => {
          if (sessionRef.current) {
            sessionRef.current.sendRealtimeInput({ text: query });
          }
        }, 500);
      });
    }
  };

  // Helper to execute tools
  const handleTool = async (name: string, args: any) => {
    console.log(`Executing Tool: ${name}`, args);
    let resultMsg = "حدث خطأ غير متوقع أثناء تنفيذ الأداة.";
    
    try {
      if (name === "get_media_content") {
        const queryStr = args.query;
        const data = await getMediaByQuery(queryStr);
        resultMsg = "لم يتم العثور على وسائط لهذه الفئة.";
        if (data && Array.isArray(data)) {
          const newMediaItems = data.map(item => ({
            type: item.type as 'image' | 'video',
            url: item.url,
            title: item.title
          }));
          
          // Add to transcript
          setTranscript(prev => [
            ...prev,
            ...newMediaItems.map(item => ({ role: 'model' as const, media: item }))
          ]);

          resultMsg = data.map(item => `تم العثور على ${item.type === 'image' ? 'صورة' : 'فيديو'} بعنوان "${item.title}" وعرضه للمستخدم.`).join('\n');
        }
      } else if (name === "get_college_info") {
        const queryText = args.query || args.category;
        const data = await getCollegeInfoByQuery(queryText);
        resultMsg = "لم يتم العثور على معلومات نصية لهذه الفئة.";
        if (data && Array.isArray(data)) {
          resultMsg = data.map(item => `الفئة: ${item.category}\nالمحتوى: ${item.content}`).join('\n\n');
        }
      } else if (name === "get_cached_answer") {
        const question = args.question;
        const data = await getCachedQuestion(question);
        resultMsg = data ? `تم العثور على إجابة سابقة: ${data.answer}` : "لم يتم العثور على إجابة سابقة.";
      } else if (name === "save_question_answer") {
        const { question, answer } = args;
        await addCachedQuestion(question, answer);
        resultMsg = "تم حفظ الإجابة بنجاح في قاعدة البيانات.";
      }
    } catch (err) {
      console.error(`Tool Execution Error (${name}):`, err);
      resultMsg = `خطأ أثناء تنفيذ الأداة: ${err instanceof Error ? err.message : String(err)}`;
    }
    
    return resultMsg;
  };

  const handleAdminAuth = () => {
    if (isAdminAuthenticated) {
      setShowAdmin(true);
    } else {
      setShowPasswordModal(true);
    }
  };

  const verifyPassword = () => {
    if (passwordInput === '509077') {
      setIsAdminAuthenticated(true);
      setShowPasswordModal(false);
      setShowAdmin(true);
      setPasswordInput('');
    } else {
      setErrorMessage("كلمة السر غير صحيحة");
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const textToSend = chatInput.trim();
    setChatInput('');
    
    // Interrupt any ongoing audio
    audioHandlerRef.current?.clearPlayback();
    setIsSpeaking(false);
    
    // Add user message to transcript immediately
    setTranscript(prev => [...prev.slice(-20), { role: 'user', text: textToSend }]);

    if (isActive && sessionRef.current) {
      // IF mic is active, use the Live path (but silent)
      suppressAudioRef.current = true;
      sessionRef.current.sendRealtimeInput({ text: textToSend });
    } else {
      // FAST PATH: Use generativeContent for immediate text-only response
      setIsAiThinking(true);
      try {
        const apiKey = userApiKey || HARDCODED_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          setErrorMessage("يرجى إدخال مفتاح (API Key) للمتابعة.");
          setShowKeyModal(true);
          setIsAiThinking(false);
          return;
        }

        const ai = new GoogleGenAI({ apiKey });
        
        // Build history-aware context (last 10 turns)
        const historyContext: any[] = transcript
          .slice(-10)
          .filter(t => t.text) // Ensure only entries with text are sent as history
          .map(t => ({
            role: t.role,
            parts: [{ text: t.text }]
          }));
        
        let messages: any[] = [...historyContext, { role: 'user', parts: [{ text: textToSend }] }];
        let finalResponse = "";

        // Retry wrapper for generateContent to handle 429s (Quota)
        const generateWithRetry = async (payload: any, maxRetries = 2) => {
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              return await ai.models.generateContent(payload);
            } catch (error: any) {
              const msg = error?.message || "";
              const isQuota = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
              if (isQuota && attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 2000; // 2s, 4s
                console.warn(`Quota exhausted. Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
              }
              throw error;
            }
          }
        };

        // Loop for function calling (max 5 iterations)
        for (let i = 0; i < 5; i++) {
          const response: any = await generateWithRetry({
            model: "gemini-3.1-flash-lite-preview",
            contents: messages,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              tools: [
                { functionDeclarations: [
                  GET_MEDIA_CONTENT_TOOL as any, 
                  GET_COLLEGE_INFO_TOOL as any,
                  GET_CACHED_ANSWER_TOOL as any,
                  SAVE_QUESTION_ANSWER_TOOL as any
                ] }
              ]
            }
          });

          const toolCalls = response.functionCalls;
          if (toolCalls && toolCalls.length > 0) {
            setIsSearching(true);
            const toolResponses = [];
            
            // Add model's complete response to history to preserve thought signatures
            const modelContent = response.candidates?.[0]?.content;
            if (modelContent) {
              messages.push(modelContent);
            }

            for (const call of toolCalls) {
              const result = await handleTool(call.name, call.args);
              toolResponses.push({
                functionResponse: {
                  name: call.name,
                  id: call.id,
                  response: { result }
                }
              });
            }
            
            // Add our responses to history
            messages.push({ role: 'user', parts: toolResponses });
            setIsSearching(false);
          } else {
            // Robust text extraction
            finalResponse = response.text || "";
            
            // Fallback if .text is empty but parts exist
            if (!finalResponse && response.candidates?.[0]?.content?.parts) {
              finalResponse = response.candidates[0].content.parts
                .filter(p => p.text)
                .map(p => p.text)
                .join(" ");
            }

            if (!finalResponse) {
               finalResponse = "عذراً، لم أستطع توليد رد نصي حالياً. حاول إعادة صياغة السؤال.";
            }
            break;
          }
        }

        if (finalResponse) {
          setTranscript(prev => [...prev.slice(-20), { role: 'model', text: finalResponse }]);
        }
      } catch (err: any) {
        console.error("Static Chat Error:", err);
        const errorMsg = typeof err === 'string' ? err : (err.message || JSON.stringify(err));
        
        if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("RESOURCE_EXHAUSTED")) {
          setErrorMessage("نفذت حصة الاستخدام (Quota) المخصصة للتطبيق حالياً. يرجى إدخال مفتاح API الخاص بك للمتابعة بدون انقطاع.");
          setShowKeyModal(true);
        } else if (errorMsg.includes("403") || errorMsg.includes("permission") || errorMsg.includes("PERMISSION_DENIED")) {
          setErrorMessage("خطأ في الصلاحيات (Permission Denied): يبدو أن المفتاح الحالي لا يملك صلاحية الوصول لهذا الموديل. يرجى إدخال مفتاح API الخاص بك.");
          setShowKeyModal(true);
        } else {
          setErrorMessage("حدث خطأ في الاتصال بالذكاء الاصطناعي، يرجى المحاولة مرة أخرى.");
        }
      } finally {
        setIsAiThinking(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0502] text-white font-sans selection:bg-orange-500/30 relative overflow-hidden flex items-center justify-center" dir="rtl">
      <AnimatePresence>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      </AnimatePresence>

      <ApiKeyModal 
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        currentKey={userApiKey}
        onSave={(key) => {
          setUserApiKey(key);
          if (key) {
            localStorage.setItem('gemini_user_api_key', key);
          } else {
            localStorage.removeItem('gemini_user_api_key');
          }
        }}
      />

      {/* Mobile Frame Container */}
      <div className="w-full h-full max-w-md bg-[#0a0502] relative overflow-hidden flex flex-col shadow-2xl md:rounded-[3rem] md:border-[8px] md:border-[#1a1a1a] md:h-[850px] md:my-8">
        {/* Atmospheric Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[100%] h-[60%] bg-orange-900/20 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[100%] h-[60%] bg-amber-900/10 rounded-full blur-[120px]" />
        </div>

        <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="flex justify-between items-center p-6 bg-black/20 backdrop-blur-md border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-700 rounded-xl flex items-center justify-center shadow-lg shadow-orange-600/30 orange-glow overflow-hidden">
                <img src={LOGO_URL} alt="Logo" className="w-full h-full object-cover" onError={(e) => (e.target as any).style.display = 'none'} />
                <GraduationCap className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-glow">كلية التربية النوعية</h1>
                <p className="text-[8px] text-orange-500 font-bold uppercase tracking-[0.1em]">جامعة كفر الشيخ</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowKeyModal(true)}
                title="إعدادات المفتاح"
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
              >
                <Key size={18} className={userApiKey ? "text-orange-500" : "text-white/60"} />
              </button>
              <button 
                onClick={handleAdminAuth}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
              >
                <Users size={18} className="text-white/60" />
              </button>
            </div>
          </header>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 flex flex-col">
            {/* Quick Navigation Bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 no-scrollbar scroll-smooth">
              <NavIcon 
                icon={<Home size={18} />} 
                label="الرئيسية" 
                onClick={clearTranscript}
              />
              <NavIcon 
                icon={<BookOpen size={18} />} 
                label="الأقسام" 
                onClick={() => handleQuickAction("كلمني عن الأقسام العلمية في الكلية")}
              />
              <NavIcon 
                icon={<GraduationCap size={18} />} 
                label="شؤون الطلاب" 
                onClick={() => handleQuickAction("إيه هي خدمات شؤون الطلاب؟")}
              />
              <NavIcon 
                icon={<Info size={18} />} 
                label="الدراسات العليا" 
                onClick={() => handleQuickAction("عايز أعرف عن الدراسات العليا")}
              />
            </div>

            {/* Hero / Visualizer Section */}
            <div className={`${isActive && transcript.length > 0 ? 'h-24' : 'flex-1'} flex flex-col items-center justify-center text-center transition-all duration-500`}>
              <AnimatePresence mode="wait">
                {!isActive ? (
                  <motion.div
                    key="welcome"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      <p className="text-xs text-white/60 font-medium font-cairo text-center">
                        الحالة الحالية: {userApiKey ? (
                          <span className="text-orange-500 font-bold">تستخدم مفتاحك الشخصي ✅</span>
                        ) : (
                          <span className="text-amber-500">تستخدم مفتاح الموقع الافتراضي 🌐</span>
                        )}
                      </p>
                      <h2 className="text-4xl font-black tracking-tighter leading-none text-glow">
                        أهلاً بك في <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600 italic">المساعد الذكي</span>
                      </h2>
                    </div>
                    <p className="text-white/50 max-w-xs mx-auto text-sm font-medium leading-relaxed font-cairo">
                      تحدث معي مباشرة للحصول على معلومات حول الكلية.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="active"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative"
                  >
                    <div className={`relative ${isActive && transcript.length > 0 ? 'w-32 h-32' : 'w-56 h-56'} transition-all duration-700 flex items-center justify-center`}>
                      <motion.div
                        animate={{
                          scale: isSpeaking ? [1, 1.2, 1] : [1, 1.05, 1],
                          opacity: isSpeaking ? [0.4, 0.8, 0.4] : [0.2, 0.5, 0.2],
                        }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-800 rounded-full blur-2xl orange-glow"
                      />
                      <div className="relative z-10 w-full h-full border border-white/10 rounded-full flex items-center justify-center glass-panel overflow-hidden">
                        <div className="flex gap-1.5 items-end h-1/2 relative z-20">
                          {[...Array(isActive && transcript.length > 0 ? 6 : 12)].map((_, i) => (
                            <motion.div
                              key={i}
                              animate={{
                                height: isActive ? (isSpeaking ? [10, 40, 10] : [5, 15, 5]) : 5
                              }}
                              transition={{
                                duration: 0.5,
                                repeat: Infinity,
                                delay: i * 0.04,
                                ease: "easeInOut"
                              }}
                              className="w-1.5 bg-gradient-to-t from-orange-600 to-orange-300 rounded-full"
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Media Content integrated into Transcript */}
            
            {/* Transcript Area */}
            <div className="flex-1 py-4 space-y-4">
              <AnimatePresence initial={false}>
                {transcript.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] overflow-hidden rounded-2xl text-sm shadow-lg backdrop-blur-xl border ${
                      item.role === 'user' 
                        ? 'bg-orange-500/20 border-orange-500/30 text-white rounded-tr-none px-4 py-3' 
                        : 'bg-white/10 border-white/20 text-white/90 rounded-tl-none p-1'
                    }`}>
                      {item.text && <div className={item.role === 'user' ? '' : 'px-3 py-2'}><p className="leading-relaxed font-cairo">{item.text}</p></div>}
                      {item.media && (
                        <div className="flex flex-col">
                           {item.media.type === 'image' ? (
                             <img 
                               src={item.media.url} 
                               alt={item.media.title} 
                               className="rounded-xl w-full max-h-[300px] object-cover" 
                               referrerPolicy="no-referrer" 
                             />
                           ) : (
                             <video 
                               src={item.media.url} 
                               controls 
                               className="rounded-xl w-full max-h-[300px] object-cover" 
                             />
                           )}
                           <div className="px-3 py-2 bg-black/40 backdrop-blur-sm">
                             <p className="text-[10px] text-white/70 font-medium font-cairo truncate">{item.media.title}</p>
                           </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                
                {/* Typing Indicator */}
                {(isSpeaking || isAiThinking) && !currentResponse && !isSearching && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start"
                  >
                    <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-2xl flex gap-1 items-center">
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1 h-1 bg-white/40 rounded-full" />
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-1 h-1 bg-white/40 rounded-full" />
                      <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-1 h-1 bg-white/40 rounded-full" />
                    </div>
                  </motion.div>
                )}

                {/* Streaming Response Bubble */}
                {currentResponse && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-lg backdrop-blur-xl border bg-white/10 border-white/20 text-white/90 rounded-tl-none">
                      <p className="leading-relaxed font-cairo">
                        {currentResponse}
                        <span className="inline-block w-1.5 h-4 bg-orange-500 ml-1 animate-pulse align-middle" />
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Searching Indicator */}
                {isSearching && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start"
                  >
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                      <div className="flex gap-1">
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                      </div>
                      <span className="text-[10px] text-white/40 font-bold font-cairo">جاري البحث في بيانات الكلية...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={transcriptEndRef} />
            </div>
          </div>

          {/* Bottom Controls Area */}
          <div className="p-6 bg-gradient-to-t from-black to-transparent space-y-6">
            {/* Error Message Display */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center space-y-3"
                >
                  <p className="text-xs text-red-500 font-medium font-cairo leading-relaxed">{errorMessage}</p>
                  <div className="flex justify-center flex-wrap gap-2">
                    <button 
                      onClick={toggleSession}
                      className="text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-500 px-4 py-1.5 rounded-full transition-all font-bold"
                    >
                      إعادة المحاولة
                    </button>
                    {(errorMessage?.includes('الميكروفون') || errorMessage?.includes('Permission denied')) && (
                      <span className="text-[10px] text-white/40 font-cairo py-1.5 px-2">
                        يرجى تفعيل الميكروفون من إعدادات المتصفح
                      </span>
                    )}
                    {(errorMessage?.includes('الشبكة') || errorMessage?.includes('الاتصال')) && (
                      <button 
                        onClick={() => startSession(!suppressAudioRef.current)}
                        className="text-[10px] bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 px-4 py-1.5 rounded-full transition-all font-bold"
                      >
                        إعادة المحاولة
                      </button>
                    )}
                    <button 
                      onClick={() => window.aistudio?.openSelectKey()}
                      className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded-full transition-all font-bold"
                    >
                      تغيير المفتاح
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col items-center gap-6">
              {/* Chat Input Area */}
              <form 
                onSubmit={handleSendText}
                className="w-full flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-2 focus-within:border-orange-500/50 transition-all bg-black/20"
              >
                <input 
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="اسألني أي سؤال كتابة..."
                  className="flex-1 bg-transparent border-none outline-none px-3 py-2 text-sm font-cairo placeholder:text-white/20"
                />
                <button 
                  type="submit"
                  disabled={!chatInput.trim() || status === 'connecting'}
                  className="p-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-30 disabled:hover:bg-orange-600 rounded-xl transition-all shadow-lg shadow-orange-600/20"
                >
                  <Send size={18} />
                </button>
              </form>

              <button
                onClick={toggleSession}
                disabled={status === 'connecting'}
                className={`group relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 ${
                  isMicCaptured 
                    ? 'bg-white text-black scale-110 shadow-[0_0_30px_rgba(255,255,255,0.3)]' 
                    : 'bg-orange-600 text-white hover:scale-105 shadow-[0_0_20px_rgba(234,88,12,0.3)]'
                } disabled:opacity-50`}
              >
                {status === 'connecting' ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-6 h-6 border-2 border-current border-t-transparent rounded-full"
                  />
                ) : isMicCaptured ? (
                  <Mic size={28} />
                ) : (
                  <MicOff size={28} />
                )}
                
                {isMicCaptured && (
                  <motion.div
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 1.4, opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="absolute inset-0 rounded-full border-2 border-white"
                  />
                )}
              </button>

              <div className="w-full flex justify-around items-center bg-white/5 backdrop-blur-md rounded-2xl p-2 border border-white/5">
                <BottomNavIcon icon={<Home size={20} />} label="الرئيسية" active={!isActive} onClick={clearTranscript} />
                <BottomNavIcon icon={<BookOpen size={20} />} label="الأقسام" onClick={() => handleQuickAction("كلمني عن الأقسام العلمية")} />
                <BottomNavIcon icon={<Users size={20} />} label="الإدارة" onClick={handleAdminAuth} />
                <BottomNavIcon icon={<Phone size={20} />} label="تواصل" onClick={() => handleQuickAction("إزاي أتواصل معاكم؟")} />
              </div>
              
              <div className="mt-2 text-center">
                <p className="text-[10px] text-white/20 font-medium tracking-widest uppercase">Developed by Ibrahim Elkhooly</p>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Password Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 30, filter: 'blur(10px)' }}
              animate={{ scale: 1, y: 0, filter: 'blur(0px)' }}
              className="bg-[#151619]/80 border border-white/10 p-10 rounded-[3rem] shadow-2xl w-full max-w-sm text-center space-y-8 glass-panel orange-glow"
            >
              <div className="w-20 h-20 bg-orange-600/20 rounded-[2rem] flex items-center justify-center mx-auto border border-orange-500/30">
                <Info className="text-orange-500" size={40} />
              </div>
              <div className="space-y-3">
                <h3 className="text-2xl font-black text-glow">منطقة المسؤولين</h3>
                <p className="text-sm text-white/40 font-medium font-cairo">من فضلك أدخل كلمة السر للمتابعة</p>
              </div>
              <input 
                type="password"
                autoFocus
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verifyPassword()}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-center text-2xl tracking-[0.5em] focus:border-orange-600 outline-none transition-all focus:bg-white/10"
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-bold transition-all border border-white/5"
                >
                  إلغاء
                </button>
                <button 
                  onClick={verifyPassword}
                  className="flex-1 py-4 bg-orange-600 hover:bg-orange-700 rounded-2xl text-sm font-bold transition-all shadow-lg shadow-orange-600/20"
                >
                  دخول
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {showAdmin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 30, filter: 'blur(10px)' }}
              animate={{ scale: 1, y: 0, filter: 'blur(0px)' }}
              className="bg-[#151619]/90 border border-white/10 w-full max-w-3xl rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh] glass-panel"
            >
              <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-orange-600 rounded-2xl flex items-center justify-center">
                    <GraduationCap size={20} />
                  </div>
                  <h3 className="text-2xl font-black text-glow">تحديث بيانات المساعد</h3>
                </div>
                <button 
                  onClick={() => setShowAdmin(false)}
                  className="p-3 hover:bg-white/10 rounded-2xl transition-all border border-white/5"
                >
                  <MicOff size={20} />
                </button>
              </div>

              <div className="flex p-2 bg-white/5 mx-8 mt-6 rounded-2xl border border-white/5">
                <button 
                  onClick={() => setAdminTab('media')}
                  className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all font-cairo ${adminTab === 'media' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-white/40 hover:text-white/60'}`}
                >
                  الوسائط
                </button>
                <button 
                  onClick={() => setAdminTab('info')}
                  className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all font-cairo ${adminTab === 'info' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-white/40 hover:text-white/60'}`}
                >
                  المعلومات
                </button>
                <button 
                  onClick={() => setAdminTab('files')}
                  className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all font-cairo ${adminTab === 'files' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-white/40 hover:text-white/60'}`}
                >
                  الملفات
                </button>
                <button 
                  onClick={() => setAdminTab('stats')}
                  className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all font-cairo ${adminTab === 'stats' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-white/40 hover:text-white/60'}`}
                >
                  الإحصائيات
                </button>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                {!user ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center">
                    <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center text-orange-500">
                      <Users size={32} />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xl font-bold">تسجيل الدخول مطلوب</h4>
                      <p className="text-sm text-white/40 max-w-xs">يجب تسجيل الدخول باستخدام حساب المسؤول لتتمكن من تعديل البيانات.</p>
                    </div>
                    <button 
                      onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
                      className="px-8 py-4 bg-white text-black rounded-2xl font-bold hover:bg-orange-500 hover:text-white transition-all flex items-center gap-3"
                    >
                      <Globe size={20} />
                      تسجيل الدخول باستخدام Google
                    </button>
                  </div>
                ) : user.email !== "ibrahimalkhooly@gmail.com" ? (
                  <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                      <MicOff size={32} />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xl font-bold">غير مصرح لك</h4>
                      <p className="text-sm text-white/40 max-w-xs">عذراً، هذا الحساب ({user.email}) ليس لديه صلاحيات المسؤول.</p>
                    </div>
                    <button 
                      onClick={() => auth.signOut()}
                      className="px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all"
                    >
                      تسجيل الخروج
                    </button>
                  </div>
                ) : adminTab === 'media' ? (
                  <div className="space-y-12">
                    <section>
                      <h4 className="text-sm font-bold text-white/20 uppercase tracking-widest mb-6">
                        {editingMedia ? "تعديل الوسائط" : "إضافة وسائط جديدة"}
                      </h4>
                      <MediaForm 
                        editingItem={editingMedia} 
                        onCancel={() => setEditingMedia(null)}
                        onComplete={() => {
                          setRefreshKey(prev => prev + 1);
                          setEditingMedia(null);
                        }} 
                      />
                    </section>
                    <section>
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-sm font-bold text-white/20 uppercase tracking-widest">قائمة الوسائط الحالية</h4>
                        <button onClick={() => setRefreshKey(prev => prev + 1)} className="text-[10px] text-orange-500 hover:underline">تحديث القائمة</button>
                      </div>
                      <MediaList refreshKey={refreshKey} onEdit={setEditingMedia} />
                    </section>
                  </div>
                ) : adminTab === 'info' ? (
                  <div className="space-y-12">
                    <section>
                      <h4 className="text-sm font-bold text-white/20 uppercase tracking-widest mb-6">
                        {editingInfo ? "تعديل المعلومات" : "إضافة معلومات جديدة"}
                      </h4>
                      <InfoForm 
                        editingItem={editingInfo}
                        onCancel={() => setEditingInfo(null)}
                        onComplete={() => {
                          setRefreshKey(prev => prev + 1);
                          setEditingInfo(null);
                        }} 
                      />
                    </section>
                    <section>
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-sm font-bold text-white/20 uppercase tracking-widest">قائمة المعلومات الحالية</h4>
                        <button onClick={() => setRefreshKey(prev => prev + 1)} className="text-[10px] text-orange-500 hover:underline">تحديث القائمة</button>
                      </div>
                      <InfoList refreshKey={refreshKey} onEdit={setEditingInfo} />
                    </section>
                  </div>
                ) : adminTab === 'files' ? (
                  <div className="space-y-12">
                    <section>
                      <h4 className="text-sm font-bold text-white/20 uppercase tracking-widest mb-6">معالجة الملفات الذكية (PDF/Word)</h4>
                      <FileProcessor 
                        onComplete={() => setRefreshKey(prev => prev + 1)} 
                        onError={(msg) => setErrorMessage(msg)}
                      />
                    </section>
                  </div>
                ) : (
                  <div className="space-y-12">
                    <section>
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="text-sm font-bold text-white/20 uppercase tracking-widest">إحصائيات الأسئلة الشائعة</h4>
                        <button onClick={() => setRefreshKey(prev => prev + 1)} className="text-[10px] text-orange-500 hover:underline">تحديث</button>
                      </div>
                      <QuestionCacheList refreshKey={refreshKey} />
                    </section>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BottomNavIcon({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 transition-all ${active ? 'text-orange-500' : 'text-white/40 hover:text-white/60'}`}
    >
      {icon}
      <span className="text-[8px] font-bold font-cairo">{label}</span>
    </button>
  );
}

function NavIcon({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center gap-2 min-w-[70px] p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:scale-105 active:scale-95"
    >
      <div className="text-orange-500">{icon}</div>
      <span className="text-[9px] font-bold text-white/60 font-cairo">{label}</span>
    </button>
  );
}

function ApiKeyModal({ isOpen, onClose, currentKey, onSave }: { isOpen: boolean, onClose: () => void, currentKey: string, onSave: (key: string) => void }) {
  const [keyInput, setKeyInput] = useState(currentKey);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-sm bg-[#151619] border border-white/10 rounded-[2.5rem] p-8 space-y-8 relative overflow-hidden shadow-2xl"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/10 blur-3xl -z-10" />
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-600/20 rounded-xl">
              <Key size={18} className="text-orange-500" />
            </div>
            <h3 className="text-xl font-bold tracking-tight font-cairo">مفتاح API الخاص بك</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40">
            <X size={20} />
          </button>
        </div>
        
        <div className="space-y-4">
          <p className="text-xs text-white/40 leading-relaxed font-cairo text-right">
            لكي يعمل التطبيق بشكل مستقر ومنع نفاذ الحصص المجانية، يرجى إدخال مفتاح Gemini API الخاص بك. سيتم حفظ المفتاح محلياً في متصفحك فقط.
          </p>
          <div className="space-y-2">
            <input 
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="أدخل مفتاحك هنا... (AIza...)"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-orange-600 outline-none transition-all placeholder:text-white/20 font-mono text-center"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <button 
            onClick={() => {
              onSave(keyInput);
              onClose();
            }}
            className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-600/20 font-cairo"
          >
            حفظ المفتاح
          </button>
          <button 
            onClick={() => {
              onSave('');
              setKeyInput('');
            }}
            className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/60 text-xs font-bold rounded-2xl transition-all font-cairo"
          >
            مسح المفتاح المحفوظ
          </button>
        </div>

        <p className="text-[10px] text-center text-white/20">
          يمكنك الحصول على مفتاح مجاني من <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-orange-500/60 hover:text-orange-500 underline">Google AI Studio</a>
        </p>
      </motion.div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] text-right"
    >
      <div className="p-2 bg-orange-500/10 rounded-xl text-orange-500">
        {icon}
      </div>
      <span className="text-xs font-bold text-white/80 font-cairo">{label}</span>
    </button>
  );
}

function MediaList({ refreshKey, onEdit }: { refreshKey: number, onEdit: (item: any) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    getAllMedia().then(setItems);
  }, [refreshKey]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMedia(id);
      setItems(items.filter(i => i.id !== id));
    } catch (error) {
      console.error(error);
      alert("فشل الحذف. تأكد من الصلاحيات.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {items.map(item => (
        <div key={item.id} className="p-5 bg-white/5 border border-white/10 rounded-[2rem] flex justify-between items-center gap-4 hover:bg-white/10 transition-all group">
          <div className="flex items-center gap-4 overflow-hidden">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/10 group-hover:border-orange-500/30 transition-all">
              {item.type === 'image' ? <img src={item.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="text-[10px] font-bold text-orange-500">VIDEO</div>}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate text-white/90">{item.title}</p>
              <p className="text-[10px] text-orange-500 font-bold truncate uppercase tracking-widest">{item.queryKey}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => onEdit(item)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl transition-all text-xs font-bold font-cairo"
            >
              تعديل
            </button>
            <button 
              onClick={() => handleDelete(item.id)}
              disabled={deletingId === item.id}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all text-xs font-bold font-cairo disabled:opacity-50"
            >
              {deletingId === item.id ? "..." : "حذف"}
            </button>
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-center text-white/20 py-12 italic font-cairo">لا توجد وسائط مضافة بعد.</p>}
    </div>
  );
}

function QuestionCacheList({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    getAllCachedQuestions().then(data => {
      setItems(data);
      setLoading(false);
    });
  }, [refreshKey]);

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا السؤال من الإحصائيات؟")) return;
    setDeletingId(id);
    await deleteCachedQuestion(id);
    setItems(prev => prev.filter(item => item.id !== id));
    setDeletingId(null);
  };

  if (loading) return <div className="text-center py-12 text-white/20 font-cairo">جاري التحميل...</div>;

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id} className="p-6 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all group">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <h5 className="text-sm font-bold text-orange-500 mb-1 font-cairo">{item.question}</h5>
              <div className="flex items-center gap-4 text-[10px] text-white/40 font-bold uppercase tracking-widest">
                <span>تكرار السؤال: {item.count || 1}</span>
                <span>آخر ظهور: {item.lastAsked?.toDate ? item.lastAsked.toDate().toLocaleString('ar-EG') : 'غير معروف'}</span>
              </div>
            </div>
            <button 
              onClick={() => handleDelete(item.id)}
              disabled={deletingId === item.id}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all text-xs font-bold font-cairo disabled:opacity-50"
            >
              {deletingId === item.id ? "..." : "حذف"}
            </button>
          </div>
          <div className="p-4 bg-black/20 rounded-2xl border border-white/5">
            <p className="text-xs text-white/80 leading-relaxed font-cairo">{item.answer}</p>
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-center text-white/20 py-12 italic font-cairo">لا توجد إحصائيات بعد.</p>}
    </div>
  );
}

function InfoList({ refreshKey, onEdit }: { refreshKey: number, onEdit: (item: any) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    getAllCollegeInfo().then(setItems);
  }, [refreshKey]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteCollegeInfo(id);
      setItems(items.filter(i => i.id !== id));
    } catch (error) {
      console.error(error);
      alert("فشل الحذف.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {items.map(item => (
        <div key={item.id} className="p-5 bg-white/5 border border-white/10 rounded-[2rem] flex flex-col gap-3 hover:bg-white/10 transition-all group">
          <div className="flex justify-between items-center gap-4">
            <h5 className="text-orange-500 font-bold text-sm uppercase tracking-widest font-cairo">{item.category}</h5>
            <div className="flex gap-2">
              <button 
                onClick={() => onEdit(item)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl transition-all text-xs font-bold font-cairo"
              >
                تعديل
              </button>
              <button 
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all text-xs font-bold font-cairo disabled:opacity-50"
              >
                {deletingId === item.id ? "..." : "حذف"}
              </button>
            </div>
          </div>
          <p className="text-xs text-white/60 leading-relaxed line-clamp-3 font-cairo">{item.content}</p>
        </div>
      ))}
      {items.length === 0 && <p className="text-center text-white/20 py-12 italic font-cairo">لا توجد معلومات مضافة بعد.</p>}
    </div>
  );
}

function FileProcessor({ onComplete, onError }: { onComplete: () => void, onError: (msg: string) => void }) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    setProcessing(true);
    
    const apiKey = HARDCODED_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      onError("مفتاح API مفقود. يرجى وضعه في الكود أولاً.");
      setProcessing(false);
      return;
    }
    const ai = new GoogleGenAI({ apiKey });

    for (const file of files) {
      try {
        setProgress(`جاري قراءة الملف: ${file.name}...`);
        let text = '';

        if (file.type === 'application/pdf') {
          text = await extractTextFromPDF(file);
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          text = await extractTextFromDocx(file);
        } else if (file.type === 'text/plain') {
          text = await file.text();
        }

        if (text.trim()) {
          const fileName = file.name.split('.')[0];
          
          // Chunk the text for processing
          const CHUNK_SIZE = 8000; // Characters per chunk for model processing
          const chunks: string[] = [];
          for (let i = 0; i < text.length; i += CHUNK_SIZE) {
            chunks.push(text.slice(i, i + CHUNK_SIZE));
          }

          setProgress(`جاري تحليل واستخراج المعلومات من ${file.name} (${chunks.length} أجزاء)...`);

          for (let i = 0; i < chunks.length; i++) {
            setProgress(`جاري معالجة الجزء ${i + 1} من ${chunks.length} لملف ${file.name}...`);
            
            try {
              const response = await ai.models.generateContent({
                model: "gemini-3.1-flash-lite-preview",
                contents: `قم باستخراج كافة المعلومات الهامة من هذا النص وحولها إلى بيانات منظمة لقاعدة بيانات الكلية. 
                يجب أن تكون المخرجات عبارة عن قائمة من الكائنات (JSON Array of Objects).
                كل كائن يجب أن يحتوي على:
                - category: فئة المعلومة (مثلاً: شؤون الطلاب، الأقسام، الدراسات العليا، المصاريف، الجداول).
                - content: نص المعلومة المفصل والدقيق.
                - tags: قائمة كلمات مفتاحية مرتبطة.
                
                النص: ${chunks[i]}`,
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        category: { type: Type.STRING },
                        content: { type: Type.STRING },
                        tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                      },
                      required: ["category", "content"]
                    }
                  }
                }
              });

              const extractedData = JSON.parse(response.text);
              if (Array.isArray(extractedData)) {
                for (const item of extractedData) {
                  // Add chunk metadata to help with retrieval if needed
                  await addCollegeInfo({
                    ...item,
                    sourceFile: file.name,
                    processedAt: new Date().toISOString()
                  });
                }
              }
            } catch (chunkError) {
              console.error(`Error processing chunk ${i} of ${file.name}:`, chunkError);
              // Continue with next chunk
            }
          }
          setProgress(`تمت معالجة وحفظ بيانات ${file.name} بنجاح!`);
        }
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        setProgress(`خطأ في معالجة: ${file.name}`);
      }
    }

    setProcessing(false);
    setProgress('اكتملت جميع العمليات بنجاح!');
    setFiles([]);
    onComplete();
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  };

  const extractTextFromDocx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  };

  return (
    <div className="p-8 bg-white/5 rounded-[2rem] border border-white/10 space-y-6">
      <div className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-[2rem] p-12 hover:border-orange-500/50 transition-all bg-white/5 group relative overflow-hidden">
        <Upload className="text-orange-500 mb-4 group-hover:scale-110 transition-transform" size={48} />
        <p className="text-sm font-bold text-white/60 mb-2 font-cairo">اسحب الملفات هنا أو اضغط للاختيار</p>
        <p className="text-[10px] text-white/20 uppercase tracking-widest">PDF, DOCX, TXT</p>
        <input 
          type="file" 
          multiple 
          accept=".pdf,.docx,.txt"
          onChange={handleFileChange}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          <h5 className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-cairo">الملفات المختارة ({files.length})</h5>
          <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                <FileText size={16} className="text-orange-500" />
                <span className="text-xs text-white/80 truncate flex-1">{f.name}</span>
                <span className="text-[10px] text-white/20">{(f.size / 1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {progress && (
        <div className="p-4 bg-orange-600/10 border border-orange-500/20 rounded-2xl">
          <p className="text-xs text-orange-500 font-bold text-center font-cairo">{progress}</p>
        </div>
      )}

      <button 
        onClick={processFiles}
        disabled={processing || files.length === 0}
        className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-600/20 disabled:opacity-50 font-cairo flex items-center justify-center gap-3"
      >
        {processing ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : <Sparkles size={18} />}
        {processing ? "جاري المعالجة..." : "بدء المعالجة الذكية"}
      </button>
    </div>
  );
}

function MediaForm({ onComplete, editingItem, onCancel }: { onComplete: () => void, editingItem?: any, onCancel?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    queryKey: '',
    type: 'image' as 'image' | 'video',
    url: '',
    title: '',
    description: ''
  });

  useEffect(() => {
    if (editingItem) {
      setFormData({
        queryKey: editingItem.queryKey || '',
        type: editingItem.type || 'image',
        url: editingItem.url || '',
        title: editingItem.title || '',
        description: editingItem.description || ''
      });
    } else {
      setFormData({
        queryKey: '',
        type: 'image',
        url: '',
        title: '',
        description: ''
      });
    }
  }, [editingItem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingItem) {
        await updateMedia(editingItem.id, formData);
        alert("تم تحديث البيانات بنجاح!");
      } else {
        await addMedia(formData);
        alert("تمت إضافة الوسائط بنجاح!");
      }
      onComplete();
    } catch (error) {
      console.error(error);
      alert("فشل في حفظ البيانات.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-8 bg-white/5 rounded-[2rem] border border-white/10">
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-cairo">الكلمة المفتاحية (Query Key)</label>
        <input 
          required
          value={formData.queryKey}
          onChange={e => setFormData({...formData, queryKey: e.target.value})}
          placeholder="مثلاً: تكنولوجيا التعليم"
          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-orange-600 outline-none transition-all"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-cairo">النوع</label>
          <select 
            value={formData.type}
            onChange={e => setFormData({...formData, type: e.target.value as 'image' | 'video'})}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-orange-600 outline-none transition-all appearance-none"
          >
            <option value="image" className="bg-[#151619]">صورة</option>
            <option value="video" className="bg-[#151619]">فيديو</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-cairo">العنوان</label>
          <input 
            required
            value={formData.title}
            onChange={e => setFormData({...formData, title: e.target.value})}
            placeholder="عنوان توضيحي"
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-orange-600 outline-none transition-all"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-cairo">رابط الوسائط (URL)</label>
        <input 
          required
          type="url"
          value={formData.url}
          onChange={e => setFormData({...formData, url: e.target.value})}
          placeholder="https://..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-orange-600 outline-none transition-all"
        />
      </div>
      <div className="flex gap-4 pt-4">
        {editingItem && (
          <button 
            type="button"
            onClick={onCancel}
            className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all border border-white/5 font-cairo"
          >
            إلغاء التعديل
          </button>
        )}
        <button 
          type="submit"
          disabled={loading}
          className="flex-[2] py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-600/20 disabled:opacity-50 font-cairo"
        >
          {loading ? "جاري الحفظ..." : (editingItem ? "تحديث البيانات" : "حفظ البيانات")}
        </button>
      </div>
    </form>
  );
}

function InfoForm({ onComplete, editingItem, onCancel }: { onComplete: () => void, editingItem?: any, onCancel?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    category: '',
    content: ''
  });

  useEffect(() => {
    if (editingItem) {
      setFormData({
        category: editingItem.category || '',
        content: editingItem.content || ''
      });
    } else {
      setFormData({
        category: '',
        content: ''
      });
    }
  }, [editingItem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingItem) {
        await updateCollegeInfo(editingItem.id, formData);
        alert("تم تحديث المعلومات بنجاح!");
      } else {
        await addCollegeInfo(formData);
        alert("تمت إضافة المعلومات بنجاح!");
      }
      onComplete();
    } catch (error) {
      console.error(error);
      alert("فشل في حفظ البيانات.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-8 bg-white/5 rounded-[2rem] border border-white/10">
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-cairo">الفئة (Category)</label>
        <input 
          required
          value={formData.category}
          onChange={e => setFormData({...formData, category: e.target.value})}
          placeholder="مثلاً: شؤون الطلاب"
          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-orange-600 outline-none transition-all"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest font-cairo">المحتوى النصي</label>
        <textarea 
          required
          rows={6}
          value={formData.content}
          onChange={e => setFormData({...formData, content: e.target.value})}
          placeholder="اكتب المعلومات هنا..."
          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:border-orange-600 outline-none transition-all resize-none"
        />
      </div>
      <div className="flex gap-4 pt-4">
        {editingItem && (
          <button 
            type="button"
            onClick={onCancel}
            className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all border border-white/5 font-cairo"
          >
            إلغاء التعديل
          </button>
        )}
        <button 
          type="submit"
          disabled={loading}
          className="flex-[2] py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-orange-600/20 disabled:opacity-50 font-cairo"
        >
          {loading ? "جاري الحفظ..." : (editingItem ? "تحديث المعلومات" : "حفظ البيانات")}
        </button>
      </div>
    </form>
  );
}

