
import React, { useState } from 'react';
import { generateImagePro, editImageWithFlash, generateVeoVideo } from '../services/geminiService';

const NeuralStudio: React.FC = () => {
  const [mode, setMode] = useState<'create' | 'edit' | 'video'>('create');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [aspect, setAspect] = useState<'16:9' | '9:16'>('16:9');
  const [imageFile, setImageFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImageFile(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      if (mode === 'create') {
        const res = await generateImagePro(prompt, size);
        if (res) setOutput(res);
      } else if (mode === 'edit' && imageFile) {
        const base64 = imageFile.split(',')[1];
        const mime = imageFile.split(';')[0].split(':')[1];
        const res = await editImageWithFlash(base64, mime, prompt);
        if (res) setOutput(res);
      } else if (mode === 'video' && imageFile) {
        const base64 = imageFile.split(',')[1];
        const mime = imageFile.split(';')[0].split(':')[1];
        const res = await generateVeoVideo(base64, mime, prompt, aspect);
        if (res) setOutput(res);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-12 gap-8 h-full animate-in fade-in duration-1000">
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
        <div className="hologram-panel p-6 border-orange-500/30">
          <h2 className="text-sm font-black uppercase text-orange-400 tracking-widest mb-6">Neural_Forge_Controls</h2>
          <div className="flex gap-2 mb-6">
            {['create', 'edit', 'video'].map(m => (
              <button key={m} onClick={() => setMode(m as any)} className={`flex-1 text-[8px] font-black uppercase py-2 border ${mode === m ? 'border-orange-500 bg-orange-500/20' : 'border-slate-800'}`}>{m}</button>
            ))}
          </div>

          <div className="space-y-4">
            <textarea 
              value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="ENCODE_NEURAL_PROMPT..."
              className="w-full h-32 bg-slate-900 border border-slate-800 p-4 text-xs mono text-orange-400 focus:outline-none focus:border-orange-500"
            />
            
            {(mode === 'edit' || mode === 'video') && (
              <div className="space-y-2">
                <p className="text-[8px] mono text-slate-500 uppercase">Input_Asset:</p>
                <input type="file" onChange={handleFileChange} className="text-[8px] text-slate-500 mono" />
              </div>
            )}

            {mode === 'create' && (
              <div className="flex gap-2">
                {['1K', '2K', '4K'].map(s => (
                  <button key={s} onClick={() => setSize(s as any)} className={`flex-1 py-1 text-[8px] border ${size === s ? 'border-orange-500' : 'border-slate-800'}`}>{s}</button>
                ))}
              </div>
            )}

            {mode === 'video' && (
              <div className="flex gap-2">
                {['16:9', '9:16'].map(a => (
                  <button key={a} onClick={() => setAspect(a as any)} className={`flex-1 py-1 text-[8px] border ${aspect === a ? 'border-orange-500' : 'border-slate-800'}`}>{a}</button>
                ))}
              </div>
            )}

            <button onClick={handleGenerate} disabled={loading} className="w-full py-4 bg-orange-600 text-white font-black uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(255,157,0,0.3)] hover:bg-white hover:text-orange-600 transition-all">
              {loading ? 'PROCESSING_NEURAL_STREAMS...' : 'EXECUTE_GENERATION'}
            </button>
          </div>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-8">
        <div className="hologram-panel p-6 border-cyan-500/30 h-full flex items-center justify-center min-h-[500px]">
          {output ? (
            mode === 'video' ? (
              <video src={output} controls className="max-w-full max-h-full border border-cyan-500 shadow-lg" autoPlay loop />
            ) : (
              <img src={output} className="max-w-full max-h-full border border-cyan-500 shadow-lg" alt="Generated Output" />
            )
          ) : (
            <div className="flex flex-col items-center gap-4 opacity-20">
               <span className="text-6xl">✨</span>
               <p className="mono text-xs uppercase tracking-[0.5em]">Output_Hologram_Pending</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NeuralStudio;
