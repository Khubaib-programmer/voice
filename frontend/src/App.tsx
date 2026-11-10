import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp, AudioLines, Check, ChevronRight, CircleHelp, Clock3, Copy,
  Headphones, Languages, LogOut, Mic, MicOff, MoreHorizontal, Plus,
  Radio, Sparkles, Volume2, WandSparkles, X,
} from "lucide-react";
import { LanguageSelect } from "./components/LanguageSelect";
import { supportedLanguages, type LanguageCode } from "./languages";
import { api } from "./lib/api";

type User = { id: string; email: string };
type HistoryItem = {
  id: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  sourceText: string;
  translatedText: string;
  detectionLanguage?: string | null;
  createdAt: string;
};
type TranslationResult = {
  text: string;
  translatedText: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  detection: { language: string; confidence: number; reason?: string | null };
  transcription?: string;
};

const languageName = (code: string) => supportedLanguages.find((language) => language.code === code)?.name ?? code;
const shortTime = (value: string) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode>("en");
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("hi");
  const [text, setText] = useState("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [working, setWorking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const refreshHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const data = await api<{ translations: HistoryItem[] }>("/api/history?limit=30");
      setHistory(data.translations);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load translation history.");
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => undefined)
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  useEffect(() => () => {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    setWorking(true);
    try {
      const data = await api<{ user: User }>(`/api/auth/${authMode === "signup" ? "signup" : "login"}`, {
        method: "POST", body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      setPassword("");
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setWorking(false);
    }
  }

  async function signOut() {
    try { await api("/api/auth/logout", { method: "POST" }); } finally { setUser(null); setHistory([]); }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function toggleRecording() {
    setError("");
    setNotice("");
    if (recording) { stopRecording(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("This browser does not support microphone recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        stream.getTracks().forEach((track) => track.stop());
        setError("This browser cannot record WebM/Opus or Ogg/Opus audio required by the speech provider.");
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        setRecordedAudio(new Blob(chunks, { type: mimeType }));
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        setNotice("Recording ready. Select Translate to transcribe and translate it.");
      };
      recorderRef.current = recorder;
      audioStreamRef.current = stream;
      setRecordedAudio(null);
      setResult(null);
      recorder.start();
      setRecording(true);
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "NotAllowedError"
        ? "Microphone access was blocked. Allow microphone access and try again."
        : "Could not start the microphone. Check your browser permissions.");
    }
  }

  async function translate() {
    setError("");
    setNotice("");
    setWorking(true);
    try {
      let data: TranslationResult;
      if (recordedAudio) {
        const form = new FormData();
        form.append("audio", recordedAudio, `recording.${recordedAudio.type.includes("ogg") ? "ogg" : "webm"}`);
        form.append("sourceLanguage", sourceLanguage);
        form.append("targetLanguage", targetLanguage);
        data = await api<TranslationResult>("/api/translate/audio", { method: "POST", body: form });
      } else {
        if (!text.trim()) throw new Error("Enter text or record a voice message first.");
        data = await api<TranslationResult>("/api/translate", {
          method: "POST", body: JSON.stringify({ text, sourceLanguage, targetLanguage }),
        });
      }
      setText(data.text);
      setResult(data);
      setRecordedAudio(null);
      await refreshHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Translation could not be completed.");
    } finally {
      setWorking(false);
    }
  }

  function switchLanguages() {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    setResult(null);
  }

  async function copyTranslation() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.translatedText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Clipboard access was blocked by this browser.");
    }
  }

  async function playTranslation() {
    if (!result) return;
    setError("");
    try {
      const data = await api<{ audioContent: string; mimeType: string }>("/api/tts", {
        method: "POST", body: JSON.stringify({ text: result.translatedText, language: result.targetLanguage }),
      });
      const bytes = Uint8Array.from(atob(data.audioContent), (char) => char.charCodeAt(0));
      const audio = new Audio(URL.createObjectURL(new Blob([bytes], { type: data.mimeType })));
      audio.addEventListener("ended", () => URL.revokeObjectURL(audio.src), { once: true });
      await audio.play();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audio playback could not start.");
    }
  }

  function selectHistory(item: HistoryItem) {
    setSourceLanguage(item.sourceLanguage);
    setTargetLanguage(item.targetLanguage);
    setText(item.sourceText);
    setResult({
      text: item.sourceText,
      translatedText: item.translatedText,
      sourceLanguage: item.sourceLanguage,
      targetLanguage: item.targetLanguage,
      detection: { language: item.detectionLanguage ?? "unknown", confidence: 0 },
    });
    setRecordedAudio(null);
  }

  if (booting) return <div className="grid min-h-screen place-items-center bg-ink text-mint"><AudioLines className="animate-pulse" /></div>;
  if (!user) return <AuthScreen {...{ authMode, setAuthMode, email, setEmail, password, setPassword, authError, working, submitAuth }} />;

  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-52 -top-64 h-[34rem] w-[34rem] rounded-full bg-emerald-300/[0.045] blur-[120px]" />
        <div className="absolute -bottom-72 left-[24%] h-[30rem] w-[30rem] rounded-full bg-cyan-400/[0.035] blur-[120px]" />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-[270px] shrink-0 border-r border-white/[0.06] px-6 py-7 lg:flex lg:flex-col">
          <Brand />
          <button onClick={() => { setText(""); setResult(null); setRecordedAudio(null); }} className="mt-12 flex items-center justify-center gap-2 rounded-xl bg-mint px-4 py-3 text-sm font-semibold text-[#10231d] transition hover:bg-[#b5f1d9]">
            <Plus size={17} /> New translation
          </button>
          <div className="mt-10 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[.18em] text-slate-500">
            <span>Recent activity</span><MoreHorizontal size={16} />
          </div>
          <div className="mt-4 flex-1 space-y-1 overflow-y-auto pr-1">
            {loadingHistory && <p className="px-3 py-2 text-xs text-slate-500">Loading history…</p>}
            {!loadingHistory && history.length === 0 && <p className="px-3 py-3 text-xs leading-5 text-slate-600">Your saved translations will appear here.</p>}
            {history.map((item) => (
              <button key={item.id} onClick={() => selectHistory(item)} className="group w-full rounded-xl p-3 text-left transition hover:bg-white/[0.045]">
                <span className="flex items-center justify-between gap-2 text-xs font-medium text-slate-300">
                  <span>{languageName(item.sourceLanguage)} <span className="text-slate-600">→</span> {languageName(item.targetLanguage)}</span>
                  <span className="font-mono text-[10px] text-slate-600">{shortTime(item.createdAt)}</span>
                </span>
                <span className="mt-1.5 block truncate text-xs text-slate-500 group-hover:text-slate-400">{item.sourceText}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 border-t border-white/[0.07] pt-5">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full border border-mint/20 bg-mint/10 text-xs font-semibold text-mint">{user.email.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-300">{user.email}</p><p className="mt-1 text-[10px] uppercase tracking-widest text-slate-600">Personal workspace</p></div>
              <button title="Sign out" onClick={() => void signOut()} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-slate-200"><LogOut size={15} /></button>
            </div>
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 px-5 pb-12 pt-6 sm:px-8 lg:px-12 lg:pt-10 xl:px-16">
          <header className="flex items-center justify-between lg:hidden">
            <Brand compact />
            <button onClick={() => void signOut()} className="rounded-lg border border-line p-2 text-slate-400"><LogOut size={16} /></button>
          </header>
          <div className="mx-auto max-w-[1060px]">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-9 mt-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end lg:mt-3">
              <div>
                <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.2em] text-mint/75"><span className="h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_10px_#9ee7cb]" /> Voice workspace</div>
                <h1 className="text-3xl font-semibold tracking-[-.04em] text-white sm:text-[2.6rem]">Say it in any language.</h1>
                <p className="mt-2.5 max-w-xl text-sm leading-6 text-slate-500">A quieter, clearer way to move between Hindi, English, Tamil and Odia.</p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3.5 py-2 text-[11px] text-slate-500"><Radio size={13} className="text-mint/80" /> Audio is processed on request</div>
            </motion.div>

            <section className="overflow-hidden rounded-[24px] border border-white/[0.075] bg-panel/90 shadow-glow backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-7">
                <div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-mint/10 text-mint"><WandSparkles size={15} /></div><span className="text-sm font-medium text-slate-200">Live translation</span></div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500"><Sparkles size={13} className="text-mint/70" /> Custom language detection</div>
              </div>
              <div className="grid gap-5 px-5 py-6 sm:px-7">
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
                  <LanguageSelect id="source-language" label="From" value={sourceLanguage} onChange={(value) => { setSourceLanguage(value); setRecordedAudio(null); setResult(null); }} />
                  <button aria-label="Switch languages" onClick={switchLanguages} className="mb-0.5 grid h-11 w-11 place-items-center rounded-xl border border-line bg-[#111720] text-slate-500 transition hover:border-mint/30 hover:text-mint sm:mb-0"><ArrowDownUp size={16} /></button>
                  <LanguageSelect id="target-language" label="To" value={targetLanguage} onChange={(value) => { setTargetLanguage(value); setResult(null); }} />
                </div>
                <div className="grid overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0f15] md:grid-cols-2">
                  <div className="flex min-h-[255px] flex-col border-b border-white/[0.07] p-5 md:border-b-0 md:border-r sm:p-6">
                    <div className="mb-4 flex items-center justify-between"><span className="text-xs font-medium text-slate-400">Your message</span><span className="font-mono text-[10px] text-slate-600">{text.length.toLocaleString()} / 10,000</span></div>
                    <textarea value={text} maxLength={10_000} onChange={(event) => { setText(event.target.value); setRecordedAudio(null); setResult(null); }} placeholder="Type a message or record your voice…" className="min-h-[125px] flex-1 resize-none border-0 bg-transparent p-0 text-[15px] leading-7 text-slate-200 placeholder:text-slate-700 focus:ring-0" />
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button disabled={sourceLanguage === "or" && !recording} title={sourceLanguage === "or" && !recording ? "Odia voice input is not available with the configured provider." : undefined} onClick={() => void toggleRecording()} className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${recording ? "border-rose-400/25 bg-rose-400/10 text-rose-300" : "border-white/[0.08] bg-white/[0.025] text-slate-400 hover:border-mint/25 hover:text-mint"}`}>
                        {recording ? <><MicOff size={14} /> Stop recording</> : <><Mic size={14} /> Record voice</>}
                      </button>
                      {recording && <span className="flex items-center gap-2 text-[11px] text-rose-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" /> Recording</span>}
                      {!recording && recordedAudio && <span className="flex items-center gap-1.5 text-[11px] text-mint"><Check size={13} /> Voice ready</span>}
                    </div>
                  </div>
                  <div className="flex min-h-[255px] flex-col p-5 sm:p-6">
                    <div className="mb-4 flex items-center justify-between"><span className="text-xs font-medium text-slate-400">Translation</span>{result && <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500"><Languages size={12} /> {languageName(result.targetLanguage)}</span>}</div>
                    <div className="flex-1 text-[15px] leading-7 text-slate-200">
                      {working ? <div className="space-y-3 pt-2"><div className="skeleton h-3 w-[88%]" /><div className="skeleton h-3 w-[70%]" /><div className="skeleton h-3 w-[54%]" /></div> : result ? <AnimatePresence mode="wait"><motion.p key={result.translatedText} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>{result.translatedText}</motion.p></AnimatePresence> : <p className="text-slate-700">Your translation will appear here.</p>}
                    </div>
                    {result && <div className="mt-5 flex items-center gap-2 border-t border-white/[0.06] pt-4">
                      {result.targetLanguage === "or" ? <span title="Odia TTS is not available with the configured provider." className="inline-flex items-center gap-2 rounded-lg border border-white/[0.05] px-3 py-2 text-[11px] text-slate-600"><Volume2 size={14} /> Odia voice unavailable</span> : <button onClick={() => void playTranslation()} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-slate-400 transition hover:border-mint/25 hover:text-mint"><Volume2 size={14} /> Listen</button>}
                      <button onClick={() => void copyTranslation()} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] px-3 py-2 text-[11px] text-slate-400 transition hover:border-mint/25 hover:text-mint">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button>
                    </div>}
                  </div>
                </div>
                {result && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/[0.045] bg-white/[0.018] px-4 py-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1.5"><Sparkles size={12} className="text-mint/70" /> Detected: <b className="font-medium text-slate-300">{result.detection.language === "unknown" ? "Unknown / ambiguous" : languageName(result.detection.language)}</b></span>{result.detection.reason && <span className="text-slate-600">{result.detection.reason.replaceAll("_", " ")}</span>}{result.transcription && <span className="text-slate-600">Voice transcription complete</span>}</div>}
                {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-300/15 bg-rose-400/[0.055] px-4 py-3 text-xs leading-5 text-rose-200"><span>{error}</span><button onClick={() => setError("")}><X size={14} /></button></div>}
                {notice && <p role="status" className="text-xs text-slate-500">{notice}</p>}
                <div className="flex flex-col-reverse justify-between gap-3 pt-1 sm:flex-row sm:items-center">
                  <p className="max-w-md text-[10px] leading-4 text-slate-600"><CircleHelp size={12} className="mr-1 inline align-[-2px]" />Voice and translation require configured Google Cloud services. Text language detection uses the custom project model.{(sourceLanguage === "or" || targetLanguage === "or") && <span className="mt-1 block text-amber-300/70">Odia speech input and voice playback are unavailable with this provider.</span>}</p>
                  <button onClick={() => void translate()} disabled={working || recording} className="inline-flex min-w-[160px] items-center justify-center gap-2 rounded-xl bg-mint px-5 py-3 text-sm font-semibold text-[#10231d] transition hover:bg-[#b5f1d9] disabled:cursor-not-allowed disabled:opacity-50">
                    {working ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#173b31]/25 border-t-[#173b31]" /> Working…</> : <><WandSparkles size={15} /> Translate <ChevronRight size={15} /></>}
                  </button>
                </div>
              </div>
            </section>

            <section className="mt-5 grid gap-4 sm:grid-cols-3">
              <FeatureCard icon={<AudioLines size={16} />} title="Voice to text" text="Record from your browser microphone." />
              <FeatureCard icon={<Languages size={16} />} title="12 language directions" text="Move between four supported languages." />
              <FeatureCard icon={<Headphones size={16} />} title="Listen back" text="Play the translated voice output." />
            </section>
            <div className="mt-7 flex items-center justify-center gap-2 text-[10px] text-slate-700"><Clock3 size={12} /> History is saved to your account. Audio recordings are not stored.</div>
          </div>
        </main>
      </div>
    </div>
  );
}

type AuthProps = {
  authMode: "login" | "signup";
  setAuthMode: (mode: "login" | "signup") => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  authError: string;
  working: boolean;
  submitAuth: (event: FormEvent) => void;
};

function AuthScreen(props: AuthProps) {
  return <div className="relative grid min-h-screen place-items-center overflow-hidden bg-ink px-5 py-10 text-slate-100">
    <div className="absolute left-[15%] top-[7%] h-80 w-80 rounded-full bg-emerald-200/[0.07] blur-[120px]" />
    <div className="absolute bottom-[-10%] right-[5%] h-96 w-96 rounded-full bg-cyan-300/[0.05] blur-[130px]" />
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-[430px]">
      <div className="mb-9 flex justify-center"><Brand /></div>
      <div className="rounded-[24px] border border-white/[0.08] bg-panel/90 p-7 shadow-glow backdrop-blur sm:p-9">
        <div className="mb-7"><p className="text-[11px] font-medium uppercase tracking-[.2em] text-mint/75">Your voice, understood</p><h1 className="mt-3 text-2xl font-semibold tracking-tight">{props.authMode === "login" ? "Welcome back." : "Create your space."}</h1><p className="mt-2 text-sm text-slate-500">Sign in to translate and keep your history.</p></div>
        <form onSubmit={props.submitAuth} className="space-y-4">
          <label className="block text-xs font-medium text-slate-400">Email address<input required type="email" autoComplete="email" value={props.email} onChange={(event) => props.setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-[#0b0f15] px-4 py-3 text-sm text-slate-100 outline-none focus:border-mint/50 focus:ring-2 focus:ring-mint/10" placeholder="you@example.com" /></label>
          <label className="block text-xs font-medium text-slate-400">Password<input required minLength={10} maxLength={72} type="password" autoComplete={props.authMode === "login" ? "current-password" : "new-password"} value={props.password} onChange={(event) => props.setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-line bg-[#0b0f15] px-4 py-3 text-sm text-slate-100 outline-none focus:border-mint/50 focus:ring-2 focus:ring-mint/10" placeholder="10–72 characters" /></label>
          {props.authError && <p role="alert" className="rounded-lg border border-rose-300/15 bg-rose-400/[0.055] px-3 py-2.5 text-xs leading-5 text-rose-200">{props.authError}</p>}
          <button disabled={props.working} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 py-3 text-sm font-semibold text-[#10231d] transition hover:bg-[#b5f1d9] disabled:opacity-60">{props.working ? "Please wait…" : props.authMode === "login" ? "Sign in" : "Create account"}<ChevronRight size={15} /></button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">{props.authMode === "login" ? "New to Vaani?" : "Already have an account?"} <button onClick={() => props.setAuthMode(props.authMode === "login" ? "signup" : "login")} className="ml-1 font-medium text-mint hover:text-white">{props.authMode === "login" ? "Create an account" : "Sign in"}</button></p>
      </div>
      <p className="mt-5 text-center text-[10px] text-slate-700">Your account secures saved translations. Audio is processed without server-side storage.</p>
    </motion.div>
  </div>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-[14px] border border-mint/20 bg-mint/[0.08] text-mint"><AudioLines size={20} strokeWidth={1.8} /></div><div><p className="text-[15px] font-semibold tracking-[-.03em] text-white">vaani<span className="text-mint">.</span></p>{!compact && <p className="mt-0.5 text-[9px] uppercase tracking-[.18em] text-slate-600">Voice translator</p>}</div></div>;
}

function FeatureCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-white/[0.055] bg-white/[0.018] p-4"><div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-white/[0.045] text-mint/80">{icon}</div><h2 className="text-xs font-medium text-slate-300">{title}</h2><p className="mt-1.5 text-[11px] leading-5 text-slate-600">{text}</p></div>;
}
