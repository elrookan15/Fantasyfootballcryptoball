
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { collection, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { encodeAudio, decodeAudio, decodeAudioData, startChat } from '../services/geminiService';

const Comms: React.FC = () => {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState('OFFLINE');
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Chat State
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  useEffect(() => {
    if (!chatRef.current) {
      chatRef.current = startChat("You are the RoundBlock Command neural co-pilot. Keep responses tactical and brief.");
    }
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (user) {
         const q = query(collection(db, `users/${user.uid}/chats`), orderBy('createdAt', 'asc'));
         const unsubSnap = onSnapshot(q, (snap) => {
            const msgs = snap.docs.map(d => ({
              id: d.id,
              user: d.data().role === 'user' ? (user.displayName || '7721-OMEGA') : 'SYSTEM_AI',
              text: d.data().text,
              time: d.data().createdAt ? new Date(d.data().createdAt.toMillis()).toLocaleTimeString('en-US', { hour12: false }) : '...',
              isSystem: d.data().role === 'system'
            }));
            setMessages(msgs);
         });
         return () => unsubSnap();
      } else {
         setMessages([]);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !auth.currentUser) return;
    const text = inputValue;
    setInputValue('');
    
    // Add User Message
    const userMsgId = Date.now().toString() + "-u";
    await setDoc(doc(db, `users/${auth.currentUser.uid}/chats/${userMsgId}`), {
      text, role: 'user', createdAt: serverTimestamp()
    });

    // Send to Gemini
    try {
      if (!chatRef.current) return;
      const res = await chatRef.current.sendMessage({ message: text });
      const modelMsgId = Date.now().toString() + "-m";
      await setDoc(doc(db, `users/${auth.currentUser.uid}/chats/${modelMsgId}`), {
        text: res.text, role: 'model', createdAt: serverTimestamp()
      });
    } catch(err) {
      console.error(err);
    }
  };

  const startSession = async () => {
    setStatus('ESTABLISHING_LINK...');
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          setStatus('LINK_ESTABLISHED');
          const source = audioContextRef.current!.createMediaStreamSource(stream);
          const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            sessionPromise.then(session => {
              session.sendRealtimeInput({ media: { data: encodeAudio(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
            });
          };
          source.connect(processor);
          processor.connect(audioContextRef.current!.destination);
        },
        onmessage: async (msg) => {
          const base64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64) {
            const ctx = outputAudioContextRef.current!;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
            const buffer = await decodeAudioData(decodeAudio(base64), ctx, 24000, 1);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(source);
          }
          if (msg.serverContent?.interrupted) {
            sourcesRef.current.forEach(s => s.stop());
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          }
        },
        onerror: () => setStatus('LINK_FAILURE'),
        onclose: () => {
          setStatus('OFFLINE');
          setActive(false);
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        systemInstruction: 'You are the RoundBlock Command neural co-pilot. Keep responses tactical and brief.'
      }
    });

    sessionRef.current = sessionPromise;
    setActive(true);
  };

  const stopSession = () => {
    if (sessionRef.current) sessionRef.current.then((s: any) => s.close());
    audioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    setActive(false);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full animate-in fade-in pb-10">
      
      {/* League Chat Panel */}
      <div className="hologram-panel p-6 border-[#00f2ff]/30 flex flex-col h-full max-h-[600px] overflow-hidden">
        <div className="corner-tl border-[#00f2ff]"></div>
        
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#00f2ff]/20">
           <div>
             <h2 className="text-sm font-black uppercase text-[#00f2ff] tracking-[0.4em]">ENCRYPTED_LEAGUE_CHAT</h2>
             <div className="flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00f2ff] animate-pulse"></span>
                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">MEMBERS ONLY - OMEGA LEAGUE // ID: #8F4A</span>
             </div>
           </div>
           <div className="text-[10px] text-slate-500 font-mono flex gap-2">
             <span>MEMBERS: <span className="text-white font-bold">12</span></span>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll pr-4 space-y-4 mb-4">
          {messages.map(msg => (
             <div key={msg.id} className={`flex flex-col ${msg.isSystem ? 'items-center my-6' : ''}`}>
               {msg.isSystem ? (
                 <div className="px-4 py-1.5 border border-[#ff00ff]/30 bg-[#ff00ff]/10">
                   <span className="text-[9px] font-bold text-[#ff00ff] font-mono tracking-widest">{msg.text}</span>
                 </div>
               ) : (
                 <div className="bg-slate-900/40 border border-slate-800 p-3 relative group">
                   <div className="flex justify-between items-end mb-1">
                     <span className={`text-[10px] font-black tracking-widest ${msg.user === '7721-OMEGA' ? 'text-[#39ff14]' : 'text-slate-300'}`}>{msg.user}</span>
                     <span className="text-[8px] font-mono text-slate-600">{msg.time}</span>
                   </div>
                   <p className="text-[11px] font-mono text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">{msg.text}</p>
                 </div>
               )}
             </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="relative mt-auto">
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="[TRANSMIT MESSAGE...]"
            className="w-full bg-[#010409] border border-slate-700 text-[10px] font-mono text-white p-4 focus:outline-none focus:border-[#00f2ff] transition-all"
          />
          <button 
            type="submit"
            disabled={!inputValue.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-[#00f2ff]/10 text-[#00f2ff] border border-[#00f2ff]/30 text-[10px] font-black tracking-widest hover:bg-[#00f2ff] hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent"
          >
            SEND
          </button>
        </form>
      </div>

      {/* Neural AI Link Panel */}
      <div className="hologram-panel p-12 border-green-500/30 flex flex-col items-center justify-center max-h-[600px]">
        <div className="relative mb-12">
          <div className={`w-48 h-48 rounded-full border-4 border-dashed border-green-500/40 flex items-center justify-center ${active ? 'animate-[spin_10s_linear_infinite]' : ''}`}>
             <div className={`w-32 h-32 rounded-full border-2 border-green-500 flex items-center justify-center ${active ? 'glow-green animate-pulse' : 'opacity-20'}`}>
                <span className="text-4xl">{active ? '🧠' : '🎙️'}</span>
             </div>
          </div>
          {active && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-green-500/10 rounded-full animate-ping"></div>}
        </div>

        <div className="text-center space-y-4">
          <h2 className="text-xl font-black uppercase text-glow-green tracking-[0.3em]">{status}</h2>
          <p className="font-mono text-[10px] text-slate-500 max-w-xs mx-auto">NEURAL_LINK ENABLES LOW-LATENCY BIO-COMMAND SYNC FOR RAPID DRAFTING DECISIONS.</p>
          
          <button 
            onClick={active ? stopSession : startSession}
            className={`mt-8 px-12 py-4 font-black uppercase tracking-[0.4em] transition-all border-2 ${active ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-green-500 text-green-500 bg-green-500/10 hover:bg-green-500 hover:text-black'}`}
          >
            {active ? 'DISCONNECT' : 'INITIALIZE_SYNC'}
          </button>
        </div>
      </div>
      
    </div>
  );
};

export default Comms;
