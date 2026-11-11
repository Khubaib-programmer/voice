import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Check, ChevronRight, Copy, LogOut, Mic, MicOff, Pause, Play, Sparkles, Square, Volume2, WandSparkles, X } from "lucide-react";
import { LanguageSelect } from "./components/LanguageSelect";
import { supportedLanguages, type LanguageCode } from "./languages";
import { api, submitAudioRecording } from "./lib/api";
import { chooseRecordingMimeType, makeRecordingBlob, microphoneErrorMessage, recordingCapabilityError } from "./lib/recording";
import { createTranslatedUtterance, matchingVoice, missingVoiceMessage } from "./lib/speech";
import { canTranslate, detectionStatus, modelScoreLabel } from "./lib/detection";

type User = { id: string; email: string };
type Detection = {
  language: string;
  confidence: number;
  confidence_kind?: string;
  reason?: string | null;
  script?: { script?: string; indic_language_hints?: string[]; indic_ratio?: number };
};
type TranslationResult = {
  text: string;
  translatedText: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  detection: Detection;
};
type WorkState = "idle" | "transcribing" | "translating";

const languageName = (code: string) => supportedLanguages.find((language) => language.code === code)?.name ?? code;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("hi");
  const [text, setText] = useState("");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [detectionText, setDetectionText] = useState("");
  const [detectionBusy, setDetectionBusy] = useState(false);
  const [detectionError, setDetectionError] = useState("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [work, setWork] = useState<WorkState>("idle");
  const [requestingMicrophone, setRequestingMicrophone] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(Array(32).fill(0.08));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [speechState, setSpeechState] = useState<"idle" | "speaking" | "paused">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingStartedRef = useRef(0);
  const detectionSequence = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => undefined)
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const sequence = ++detectionSequence.current;
    if (!user || !text.trim()) {
      setDetection(null);
      setDetectionText("");
      setDetectionError("");
      setDetectionBusy(false);
      return;
    }
    if (detectionText === text) return;
    setDetection(null);
    setDetectionError("");
    setDetectionBusy(true);
    const timeout = window.setTimeout(() => {
      void api<{ detection: Detection }>("/api/detect", {
        method: "POST", body: JSON.stringify({ text }),
      }).then((data) => {
        if (sequence !== detectionSequence.current) return;
        setDetection(data.detection);
        setDetectionText(text);
      }).catch((cause) => {
        if (sequence === detectionSequence.current) setDetectionError(cause instanceof Error ? cause.message : "Language detection failed.");
      }).finally(() => {
        if (sequence === detectionSequence.current) setDetectionBusy(false);
      });
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [text, user, detectionText]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current?.state === "recording") {
        try { recorderRef.current.stop(); } catch { /* tracks are stopped below */ }
      }
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    let frame = 0;
    let lastPaint = 0;
    const samples = new Uint8Array(analyserRef.current?.fftSize ?? 0);
    const draw = (time: number) => {
      if (time - lastPaint > 55) {
        if (analyserRef.current && samples.length) {
          analyserRef.current.getByteTimeDomainData(samples);
          const band = Math.max(1, Math.floor(samples.length / 32));
          setWaveform(Array.from({ length: 32 }, (_, index) => {
            let energy = 0;
            for (let i = index * band; i < Math.min(samples.length, (index + 1) * band); i++) {
              const amplitude = (samples[i] - 128) / 128;
              energy += amplitude * amplitude;
            }
            return Math.min(1, Math.max(0.08, Math.sqrt(energy / band) * 2.8));
          }));
        }
        setRecordingSeconds(Math.floor((Date.now() - recordingStartedRef.current) / 1000));
        lastPaint = time;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [recording]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    setWork("translating");
    try {
      const data = await api<{ user: User }>(`/api/auth/${authMode}`, {
        method: "POST", body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      setPassword("");
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setWork("idle");
    }
  }

  async function signOut() {
    stopPlayback();
    try {
      await api("/api/auth/logout", { method: "POST" });
      setUser(null);
      clearWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign out could not be completed. Please retry.");
    }
  }

  function clearWorkspace() {
    setText("");
    setDetection(null);
    setDetectionText("");
    setDetectionError("");
    setResult(null);
    setError("");
    setNotice("");
  }

  function releaseAudioResources(stream = audioStreamRef.current) {
    stream?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
  }

  function stopRecording() {
    try {
      if (recorderRef.current?.state === "recording") {
        setWork("transcribing");
        recorderRef.current.stop();
      }
      else setError("The recorder is not active. Start a new recording and try again.");
    } catch {
      setError("The browser could not stop the recording. Check microphone access and try again.");
      setWork("idle");
      releaseAudioResources();
    }
    setRecording(false);
    setWaveform(Array(32).fill(0.08));
  }

  async function startRecording() {
    setError("");
    setNotice("");
    setResult(null);
    const capabilityError = recordingCapabilityError(window.isSecureContext, Boolean(navigator.mediaDevices?.getUserMedia), typeof window.MediaRecorder === "function");
    if (capabilityError) { setError(capabilityError); return; }
    setRequestingMicrophone(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      audioStreamRef.current = stream;
      const mimeType = chooseRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("This browser cannot record WebM/Opus or Ogg/Opus audio. Try Chrome, Edge, or Firefox.");
      if (window.AudioContext) {
        let context: AudioContext | undefined;
        try {
          context = new AudioContext();
          audioContextRef.current = context;
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          context.createMediaStreamSource(stream).connect(analyser);
          analyserRef.current = analyser;
        } catch {
          void context?.close();
          if (audioContextRef.current === context) audioContextRef.current = null;
          analyserRef.current = null;
          /* Optional waveform analyser; MediaRecorder still captures audio. */
        }
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      let recorderFailed = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (!mountedRef.current) { releaseAudioResources(stream); return; }
        if (recorderFailed) { setWork("idle"); releaseAudioResources(stream); return; }
        try {
          const blob = makeRecordingBlob(chunks, recorder.mimeType || mimeType);
          if (!blob.size) throw new Error("No audio was captured. Check that your microphone is unmuted, speak for a moment, and record again.");
          setWork("transcribing");
          setNotice("Sending audio securely for speech recognition…");
          void submitAudioRecording<{ text: string; detection: Detection }>(blob)
            .then((data) => {
              setText(data.text);
              setDetection(data.detection);
              setDetectionText(data.text);
              setDetectionError("");
              setResult(null);
              setNotice("Speech recognized. Review or edit the transcript before translating.");
            })
            .catch((cause) => setError(cause instanceof Error ? cause.message : "Speech recognition failed."))
            .finally(() => setWork("idle"));
        } catch (cause) {
          setWork("idle");
          setError(cause instanceof Error ? cause.message : "No audio was captured. Try recording again.");
        }
        releaseAudioResources(stream);
      };
      recorder.onerror = () => {
        recorderFailed = true;
        if (mountedRef.current) {
          setRecording(false);
          setWork("idle");
          setError("The browser encountered an audio recording error. Check microphone access and try again.");
        }
        releaseAudioResources(stream);
      };
      recorderRef.current = recorder;
      recordingStartedRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.start();
      setRecording(true);
      setNotice("Recording. Stop when you have finished speaking.");
    } catch (cause) {
      releaseAudioResources(stream);
      const message = cause instanceof Error && cause.name === "Error" && cause.message.startsWith("This browser cannot record")
        ? cause.message
        : microphoneErrorMessage(cause);
      if (mountedRef.current) setError(message);
    } finally {
      if (mountedRef.current) setRequestingMicrophone(false);
    }
  }

  async function translate() {
    setError("");
    setNotice("");
    if (!text.trim()) { setError("Type text or record a voice message first."); return; }
    if (!detection || detectionText !== text) { setError("Wait for language detection to finish before translating."); return; }
    if (detection.language === "unknown") { setError("The custom model marked this text unknown or ambiguous. Enter a longer, clearer sentence in Hindi, English, Tamil, or Odia."); return; }
    if (detection.language === targetLanguage) { setError("The detected source and target are the same. Choose a different target language."); return; }
    setWork("translating");
    try {
      const data = await api<TranslationResult>("/api/translate", {
        method: "POST",
        body: JSON.stringify({ text, targetLanguage }),
      });
      stopPlayback();
      setResult(data);
      setNotice("Translation ready. The result stays in this workspace only.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Translation could not be completed.");
    } finally {
      setWork("idle");
    }
  }

  async function copyTranslation() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.translatedText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { setError("Clipboard access was blocked by this browser."); }
  }

  function stopPlayback() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setSpeechState("idle");
  }

  function loadAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
    const synth = window.speechSynthesis;
    const current = synth.getVoices();
    if (current.length) return Promise.resolve(current);
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        synth.removeEventListener("voiceschanged", onVoices);
        resolve(synth.getVoices());
      }, 1500);
      const onVoices = () => {
        window.clearTimeout(timeout);
        synth.removeEventListener("voiceschanged", onVoices);
        resolve(synth.getVoices());
      };
      synth.addEventListener("voiceschanged", onVoices, { once: true });
    });
  }

  async function playTranslation() {
    if (!result) return;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setError("This browser does not support speech playback.");
      return;
    }
    stopPlayback();
    setError("");
    try {
      const voice = matchingVoice(await loadAvailableVoices(), result.targetLanguage);
      if (!voice) { setError(missingVoiceMessage(result.targetLanguage)); return; }
      const utterance = createTranslatedUtterance(result.translatedText, voice);
      utterance.onstart = () => { if (utteranceRef.current === utterance) setSpeechState("speaking"); };
      utterance.onend = () => { if (utteranceRef.current === utterance) setSpeechState("idle"); };
      utterance.onerror = (event) => {
        if (utteranceRef.current !== utterance || event.error === "canceled" || event.error === "interrupted") return;
        setSpeechState("idle");
        setError("Speech playback stopped unexpectedly. Check the selected system voice and try again.");
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Speech playback could not start.");
    }
  }

  function togglePlayback() {
    if (speechState === "speaking") {
      window.speechSynthesis.pause();
      setSpeechState("paused");
    } else if (speechState === "paused") {
      window.speechSynthesis.resume();
      setSpeechState("speaking");
    } else void playTranslation();
  }

  if (booting) return <Scene><div className="grid min-h-screen place-items-center text-warm-white"><AudioLines className="animate-pulse text-sand" /></div></Scene>;
  if (!user) return <AuthScreen {...{ authMode, setAuthMode, email, setEmail, password, setPassword, authError, working: work !== "idle", submitAuth }} />;

  const sameLanguage = Boolean(detection && detection.language !== "unknown" && detection.language === targetLanguage);
  const translateEnabled = canTranslate(text, detection, detectionText, targetLanguage);

  return <Scene>
    <main className="relative mx-auto min-h-screen max-w-6xl px-4 pb-16 pt-5 sm:px-8 lg:px-10 lg:pt-8">
      <header className="glass-nav flex items-center justify-between rounded-full px-3 py-2.5 sm:px-4">
        <Brand />
        <button onClick={() => void signOut()} className="glass-utility inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium transition"><LogOut size={14} /><span className="hidden sm:inline">Sign out</span></button>
      </header>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 mt-10 flex flex-col justify-between gap-6 sm:mt-14 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <p className="mb-4 flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[.28em] text-sand"><span className="h-1.5 w-1.5 rounded-full bg-purple shadow-[0_0_12px_#8B5CF6]" /> Voice studio</p>
          <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-[-.045em] text-warm-white sm:text-6xl">Say it once.<br />Hear it anywhere.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-sand">Hindi, English, Tamil, and Odia. The translation in front of you stays in this session.</p>
        </div>
        <p className="font-display text-[11px] uppercase tracking-[.18em] text-sand/80">Signed in as <span className="mt-1 block text-sm font-semibold normal-case tracking-normal text-warm-white">{user.email}</span></p>
      </motion.div>

      <section className="glass-stage overflow-hidden rounded-[32px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand/15 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="mark grid h-9 w-9 place-items-center rounded-2xl text-white"><WandSparkles size={16} /></div>
            <div>
              <p className="font-display text-sm font-bold text-warm-white">Translator</p>
              <p className="text-[11px] text-sand/80">Workspace</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sand/20 bg-warm-white/5 px-3 py-1.5 text-[11px] text-sand"><Sparkles size={13} className="text-purple" /> Custom language detection</div>
        </div>
        <div className="grid gap-5 p-4 sm:p-6">
          <div className="grid overflow-hidden rounded-[24px] border border-sand/15 md:grid-cols-2">
            <div className="glass-pane flex min-h-[320px] flex-col p-5 sm:p-7 md:border-r md:border-sand/15">
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="font-display text-[11px] font-semibold uppercase tracking-[.2em] text-sand">Your message</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-sand/70">{text.length.toLocaleString()} / 10,000</span>
                  <button onClick={() => { clearWorkspace(); stopPlayback(); }} disabled={!text && !result} className="text-[11px] font-medium text-sand transition hover:text-warm-white disabled:opacity-30">Clear</button>
                </div>
              </div>
              <textarea aria-label="Your message" value={text} maxLength={10_000} onChange={(event) => { setText(event.target.value); setDetection(null); setDetectionText(""); setResult(null); setError(""); stopPlayback(); }} placeholder="Type a message or record your voice…" className="field min-h-[150px] flex-1 resize-none px-4 py-3 text-[15px] leading-7 placeholder:text-sand/50 focus:ring-0" />
              <section aria-live="polite" className={`glass-detection mt-4 rounded-2xl px-4 py-3 ${detection?.language === "unknown" ? "is-unknown" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
                  <span className="font-medium text-warm-white">{detectionBusy ? "Detecting language…" : detectionStatus(detection)}</span>
                  {detection && <span className="text-sand">{modelScoreLabel(detection)}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-sand/75">
                  <span>Detection engine: Vaani Custom ML Model</span>
                  {detection?.script?.script && <span>Script: {detection.script.script}</span>}
                  {detection?.reason === "ambiguous" && <span>Low confidence is not treated as a language guess.</span>}
                </div>
                {detectionError && <p role="alert" className="mt-2 text-[11px] text-[#F3C7C2]">Detection failed: {detectionError}</p>}
                {sameLanguage && <p role="status" className="mt-2 text-[11px] text-[#DDD6FE]">The target matches the detected source. Choose a different target language.</p>}
              </section>
              <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
                <div className="flex min-w-0 flex-col gap-2">
                  <button
                    aria-pressed={recording}
                    disabled={work !== "idle" || requestingMicrophone}
                    onClick={() => recording ? stopRecording() : void startRecording()}
                    className={`inline-flex w-fit items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${recording ? "record-active" : "record-quiet"}`}
                  >
                    {recording ? <><MicOff size={14} /> Stop recording</> : requestingMicrophone ? <><Mic size={14} /> Waiting for microphone…</> : work === "transcribing" ? <><Mic size={14} /> Transcribing…</> : <><Mic size={14} /> Record voice</>}
                  </button>
                  {recording && (
                    <span className="flex items-center gap-2 font-mono text-[11px] text-[#DDD6FE]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple shadow-[0_0_10px_#8B5CF6]" />
                      REC {clock(recordingSeconds)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => void translate()}
                  disabled={work !== "idle" || recording || detectionBusy || !translateEnabled}
                  className="btn-forest inline-flex min-w-[158px] items-center justify-center gap-2 rounded-xl px-5 py-3 font-display text-sm font-bold transition"
                >
                  {work === "translating" ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-warm-white/35 border-t-warm-white" /> Translating…</> : work === "transcribing" ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-warm-white/35 border-t-warm-white" /> Transcribing…</> : <><WandSparkles size={15} /> Translate <ChevronRight size={15} /></>}
                </button>
              </div>
              {recording && <Waveform levels={waveform} />}
            </div>
            <div className="glass-pane flex min-h-[320px] flex-col p-5 sm:p-7">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="font-display text-[11px] font-semibold uppercase tracking-[.2em] text-sand">Translation</span>
                  <p className="mt-2 text-sm text-sand/80">{result ? `Target language: ${languageName(result.targetLanguage)}` : "The translated text will appear here."}</p>
                </div>
                <div className="w-full sm:w-52">
                  <LanguageSelect
                    id="target-language"
                    label="Translate to"
                    value={targetLanguage}
                    onChange={(value) => { setTargetLanguage(value); setResult(null); stopPlayback(); setError(""); }}
                  />
                </div>
              </div>
              <div className="field min-h-[150px] flex-1 px-4 py-3 text-[15px] leading-7 text-warm-white">
                {work === "translating" ? (
                  <div role="status" aria-label="Translation in progress" className="space-y-3 pt-2">
                    <div className="skeleton h-3 w-[88%]" />
                    <div className="skeleton h-3 w-[70%]" />
                    <div className="skeleton h-3 w-[54%]" />
                  </div>
                ) : result ? (
                  <AnimatePresence mode="wait">
                    <motion.p key={result.translatedText} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>{result.translatedText}</motion.p>
                  </AnimatePresence>
                ) : (
                  <p className="text-sand/55">Your translation will appear here.</p>
                )}
              </div>
              {result && (
                <PlaybackBar
                  speechState={speechState}
                  language={languageName(result.targetLanguage)}
                  copied={copied}
                  onToggle={togglePlayback}
                  onStop={stopPlayback}
                  onCopy={() => void copyTranslation()}
                />
              )}
            </div>
          </div>

          {error && (
            <div role="alert" className="status-error flex items-start justify-between gap-3 rounded-2xl px-4 py-3 text-xs leading-5">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button>
            </div>
          )}
          {notice && <p role="status" className="status-note rounded-2xl px-4 py-3 text-xs">{notice}</p>}
          <p className="px-1 text-[11px] leading-5 text-sand/75">Record naturally in Hindi, English, Tamil, or Odia. Whisper transcribes without a language hint; Odia recognition has not been independently verified. Vaani’s custom model detects the transcript language. Audio is processed for transcription and not stored.</p>
        </div>
      </section>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-sand/70">
        <span className="inline-flex items-center gap-1.5"><AudioLines size={13} /> Recording is temporary</span>
        <span className="inline-flex items-center gap-1.5"><Sparkles size={13} className="text-purple" /> No translation history</span>
      </div>
    </main>
  </Scene>;
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

function clock(totalSeconds: number) {
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function Scene({ children }: { children: ReactNode }) {
  return (
    <div className="smoke-scene text-warm-white">
      <div className="smoke-field" aria-hidden="true">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
        <span className="orb orb-d" />
      </div>
      {children}
    </div>
  );
}

function Waveform({ levels }: { levels: number[] }) {
  return (
    <div role="img" aria-label="Live microphone waveform" className="mt-4 flex h-12 items-center justify-center gap-[3px] overflow-hidden rounded-2xl border border-purple/40 bg-[#103A2B]/70 px-3">
      {levels.map((level, index) => (
        <motion.span key={index} className="w-1 rounded-full bg-purple" animate={{ height: `${Math.max(10, level * 36)}px`, opacity: 0.5 + level * 0.5 }} transition={{ duration: 0.08 }} />
      ))}
    </div>
  );
}

function PlaybackBar({ speechState, language, copied, onToggle, onStop, onCopy }: {
  speechState: "idle" | "speaking" | "paused";
  language: string;
  copied: boolean;
  onToggle: () => void;
  onStop: () => void;
  onCopy: () => void;
}) {
  const playing = speechState !== "idle";
  return (
    <div className="mt-5 border-t border-sand/15 pt-4">
      <div className="flex items-center gap-3">
        <button
          aria-label={speechState === "speaking" ? "Pause translated speech" : speechState === "paused" ? "Resume translated speech" : "Play translated speech"}
          onClick={onToggle}
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl transition ${playing ? "audio-control audio-live" : "audio-control"}`}
        >
          {speechState === "paused" ? <Play size={21} fill="currentColor" /> : speechState === "speaking" ? <Pause size={21} fill="currentColor" /> : <Volume2 size={22} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-warm-white">{speechState === "speaking" ? "Speaking translation" : speechState === "paused" ? "Playback paused" : "Listen to translation"}</div>
          <div className="mt-1 text-[11px] text-sand/75">{language} · browser speech voice</div>
          {playing && (
            <div className="mt-2 flex h-4 items-center gap-[3px]" aria-label="Translated speech playing">
              {Array.from({ length: 24 }, (_, index) => (
                <motion.span key={index} className="w-1 rounded-full bg-purple" animate={{ height: speechState === "speaking" ? [4, 7 + (index % 4) * 2, 4] : 4 }} transition={{ repeat: Infinity, duration: 0.55, delay: index * 0.02 }} />
              ))}
            </div>
          )}
        </div>
        {playing && (
          <button aria-label="Stop translated speech" onClick={onStop} className="icon-quiet grid h-10 w-10 place-items-center rounded-xl transition">
            <Square size={15} fill="currentColor" />
          </button>
        )}
        <button onClick={onCopy} className="icon-quiet grid h-10 w-10 place-items-center rounded-xl transition" aria-label="Copy translated text">
          {copied ? <Check size={15} className="text-[#DDD6FE]" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}

function AuthScreen(props: AuthProps) {
  return <Scene>
    <div className="grid min-h-screen place-items-center px-5 py-12">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-[440px]">
        <div className="mb-8 flex justify-center"><Brand /></div>
        <div className="glass-card rounded-[28px] p-7 sm:p-9">
          <div className="mb-7">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[.24em] text-sand">Your voice, understood</p>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-[-.04em] text-warm-white">{props.authMode === "login" ? "Welcome back." : "Create your account."}</h1>
            <p className="mt-2 text-sm leading-6 text-sand/85">{props.authMode === "login" ? "Sign in to open your private translator studio." : "Create an account for your private translator studio."}</p>
          </div>
          <form onSubmit={props.submitAuth} className="space-y-4">
            <label className="block font-display text-[11px] font-semibold uppercase tracking-[.16em] text-sand">
              Email address
              <input required type="email" autoComplete="email" value={props.email} onChange={(event) => props.setEmail(event.target.value)} className="field mt-2 px-4 py-3 font-sans text-sm normal-case tracking-normal" placeholder="you@example.com" />
            </label>
            <label className="block font-display text-[11px] font-semibold uppercase tracking-[.16em] text-sand">
              Password
              <input required minLength={10} maxLength={72} type="password" autoComplete={props.authMode === "login" ? "current-password" : "new-password"} value={props.password} onChange={(event) => props.setPassword(event.target.value)} className="field mt-2 px-4 py-3 font-sans text-sm normal-case tracking-normal" placeholder="10–72 characters" />
            </label>
            {props.authError && <p role="alert" className="status-error rounded-xl px-3 py-2.5 text-xs leading-5">{props.authError}</p>}
            <button disabled={props.working} className="btn-forest mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-display text-sm font-bold transition">
              {props.working ? "Please wait…" : props.authMode === "login" ? "Sign in" : "Create account"}
              <ChevronRight size={15} />
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-sand">{props.authMode === "login" ? "New to Vaani?" : "Already have an account?"} <button onClick={() => props.setAuthMode(props.authMode === "login" ? "signup" : "login")} className="ml-1 font-semibold text-[#DDD6FE] underline decoration-purple/70 underline-offset-4 hover:text-warm-white">{props.authMode === "login" ? "Create an account" : "Sign in"}</button></p>
        </div>
        <p className="mt-5 text-center text-[11px] leading-5 text-sand/75">Only your account stays. The words leave with you.</p>
      </motion.div>
    </div>
  </Scene>;
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <BrandSeal />
      <div>
        <p className="wordmark text-warm-white">Vaani</p>
        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[.22em] text-sand/80">Voice translator</p>
      </div>
    </div>
  );
}

function BrandSeal() {
  return (
    <svg className="brand-seal" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="vaaniSeal" x1="6" y1="4" x2="42" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C4B5FD" />
          <stop offset="1" stopColor="#6D28D9" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#vaaniSeal)" />
      <circle cx="24" cy="24" r="17.5" fill="none" stroke="rgba(250,248,242,.38)" strokeWidth="1.1" />
      <path d="M15 15.5 24 34 33 15.5" fill="none" stroke="#FAF8F2" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="34" r="1.35" fill="#FAF8F2" />
    </svg>
  );
}
