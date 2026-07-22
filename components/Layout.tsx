
import React, { useState, useEffect } from 'react';
import { signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
import { CryptoTicker } from './CryptoTicker';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u);
      if (u) {
         try {
           const userRef = doc(db, 'users', u.uid);
           const userSnap = await getDoc(userRef);
           if (!userSnap.exists()) {
             await setDoc(userRef, {
               email: u.email || '',
               name: u.displayName || 'Unknown',
               createdAt: serverTimestamp(),
               updatedAt: serverTimestamp()
             });
           }
         } catch(e) {
           console.error("Error creating user", e);
         }
      }
    });
    return unsub;
  }, []);

  const handleConnectWallet = async () => {
    setIsConnecting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
    }
    setIsConnecting(false);
  };

  return (
    <div className="h-screen w-screen flex flex-col relative overflow-hidden bg-[#010409]">
      <CryptoTicker />
      {/* Background HUD Layer is handled in index.html styles */}
      
      {/* Top Header Information - Matching Screenshot */}
      <div className="absolute top-8 left-0 w-full px-10 py-8 flex justify-between items-start z-[100]">
        <div className="flex flex-col gap-0.5 pointer-events-none">
          <div className="text-[12px] text-[#00f2ff] font-bold tracking-widest uppercase hud-font">CORE_DIAGNOSTICS: V8.4.1</div>
          <div className="text-[9px] text-slate-500 font-mono tracking-tighter uppercase opacity-80">IP: 213.0.4.10 // NEURAL_LINK: ACTIVE</div>
        </div>
        <div className="flex gap-8 items-start">
          {/* Web3 Wallet Connect */}
          <div className="flex flex-col items-end pt-1">
            {!user ? (
              <button 
                onClick={handleConnectWallet}
                disabled={isConnecting}
                className="px-4 py-1.5 border border-[#39ff14]/50 bg-[#39ff14]/10 text-[#39ff14] text-[10px] font-black font-mono uppercase tracking-widest hover:bg-[#39ff14] hover:text-black transition-all flex items-center gap-2 shadow-[0_0_10px_rgba(57,255,20,0.2)]"
              >
                {isConnecting ? (
                  <>
                    <span className="w-2 h-2 rounded-full border-2 border-current border-t-transparent animate-spin"></span>
                    SYNCING_NODE...
                  </>
                ) : (
                   'CONNECT_WALLET'
                )}
              </button>
            ) : (
              <div className="flex items-center gap-4 bg-slate-900/80 border border-[#00f2ff]/30 px-4 py-2 pointer-events-none">
                 <div className="flex flex-col items-end border-r border-[#00f2ff]/30 pr-4">
                    <span className="text-[9px] text-[#00f2ff] font-mono tracking-widest uppercase">USER</span>
                    <span className="text-xs font-black text-white font-mono">{user.displayName}</span>
                 </div>
                 <div className="flex items-center gap-2 pl-2">
                    <div className="w-2 h-2 bg-[#39ff14] rounded-full animate-pulse shadow-[0_0_5px_#39ff14]"></div>
                    <span className="text-[10px] text-slate-300 font-mono tracking-widest">{user.email}</span>
                 </div>
              </div>
            )}
          </div>

          <div className="text-right flex flex-col items-end pointer-events-none">
            <div className="text-[12px] text-[#00f2ff] font-bold uppercase tracking-[0.4em] mb-1 hud-font">ROUNDBLOCK COMMAND</div>
            <div className="text-5xl brand-font font-black text-white tracking-widest drop-shadow-[0_0_15px_rgba(0,242,255,0.4)]">NEURAL_CONSOLE</div>
            <div className="text-[10px] text-slate-400 mt-1 uppercase font-mono tracking-widest opacity-80">NODE: 7721-OMEGA</div>
          </div>
        </div>
      </div>

      {/* Left Vertical Navigation Sidebar */}
      <div className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col gap-6 z-50">
        {[
          { id: 'daily', icon: '📊', name: 'Dashboard' },
          { id: 'weekly', icon: '🏆', name: 'Lobby' },
          { id: 'comms', icon: '🎙️', name: 'Draft Room' },
          { id: 'crypto', icon: '✨', name: 'Intelligence' },
          { id: 'neural', icon: '🧠', name: 'Neural Studio' },
          { id: 'architecture', icon: '🏗️', name: 'Architecture' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group relative flex items-center justify-center transition-all duration-300 ${activeTab === tab.id ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
          >
            <div className={`w-16 h-16 flex items-center justify-center rounded-xl border-2 transition-all ${activeTab === tab.id ? `border-[#00f2ff] bg-cyan-500/10 shadow-[0_0_25px_rgba(0,242,255,0.3)]` : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}`}>
              <span className="text-2xl">{tab.icon}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Main Command Center Content */}
      <main className="flex-1 mt-32 mb-20 ml-36 mr-12 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto pr-6 custom-scroll">
          {children}
        </div>
      </main>

      {/* Footer System Status Ticker - Matching Screenshot */}
      <div className="absolute bottom-8 left-36 right-12 flex justify-between items-end z-50 pointer-events-none">
        <div className="flex gap-16">
           <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-mono tracking-widest mb-1">LATENCY</span>
              <span className="text-[#00f2ff] font-bold text-xl font-mono">12ms</span>
           </div>
           <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-mono tracking-widest mb-1">ETH_GWEI</span>
              <span className="text-[#ff00ff] font-bold text-xl font-mono">12</span>
           </div>
        </div>
        <div className="text-right flex flex-col items-end">
           <span className="text-[10px] text-slate-600 uppercase font-mono tracking-[0.3em] whitespace-nowrap">ROUND_BLOCK // ENCRYPTED_LINK_02</span>
        </div>
      </div>
    </div>
  );
};

export default Layout;
