import React, { useState, useEffect, useRef } from 'react';
import { useToast } from './ToastContext';

const INITIAL_PRICES = [
  { symbol: 'BTC', price: 64230.50, change: 2.4 },
  { symbol: 'ETH', price: 3450.20, change: 1.2 },
  { symbol: 'SOL', price: 145.80, change: -0.5 },
  { symbol: 'MATIC', price: 0.85, change: 4.1 },
  { symbol: 'LINK', price: 18.40, change: -1.2 },
  { symbol: 'USDC', price: 1.00, change: 0.01 },
];

const MOCK_THRESHOLDS: Record<string, number> = {
  BTC: 64300,
  SOL: 146,
  ETH: 3430 // Will trigger when ETH goes below or above depending on logic
};

export const CryptoTicker = () => {
  const [prices, setPrices] = useState(INITIAL_PRICES);
  const { addToast } = useToast();
  const lastNotified = useRef<Record<string, number>>({});

  useEffect(() => {
    const interval = setInterval(() => {
      setPrices(prev => {
        const notifications: Array<{ message: string; type: 'success' | 'warning' }> = [];
        const nextPrices = prev.map(coin => {
          // Higher fluctuation for demonstrating toast notification
          const flutter = (Math.random() - 0.5) * 1.5; 
          const newPrice = coin.price * (1 + flutter / 100);
          const newChange = coin.change + flutter;
          
          // Threshold check logic
          const threshold = MOCK_THRESHOLDS[coin.symbol];
          if (threshold) {
            const crossedUp = coin.price <= threshold && newPrice > threshold;
            const crossedDown = coin.price >= threshold && newPrice < threshold;
            
            const now = Date.now();
            const lastTime = lastNotified.current[coin.symbol] || 0;
            
            if ((crossedUp || crossedDown) && now - lastTime > 10000) {
              // cooldown 10s to prevent spam
              notifications.push({
                message: `WARNING: ${coin.symbol} crossed threshold of $${threshold}! (Current: $${newPrice.toFixed(2)})`,
                type: crossedUp ? 'success' : 'warning'
              });
              lastNotified.current[coin.symbol] = now;
            }
          }

          return {
            ...coin,
            price: newPrice,
            change: newChange
          };
        });

        if (notifications.length > 0) {
          setTimeout(() => {
            notifications.forEach(n => addToast(n.message, n.type));
          }, 0);
        }

        return nextPrices;
      });
    }, 3000); // Update every 3 seconds

    return () => clearInterval(interval);
  }, [addToast]);

  return (
    <div className="w-full bg-[#010409] border-b border-[#00f2ff]/20 py-1 overflow-hidden">
      <div className="flex animate-[ticker_30s_linear_infinite] whitespace-nowrap">
        {/* Render twice for continuous loop effect */}
        {[...prices, ...prices, ...prices].map((coin, i) => (
          <div key={`${coin.symbol}-${i}`} className="inline-flex items-center gap-2 mx-8 font-mono text-[10px]">
            <span className="text-[#00f2ff] font-bold">{coin.symbol}</span>
            <span className="text-slate-300">
              ${coin.price < 10 ? coin.price.toFixed(4) : coin.price.toFixed(2)}
            </span>
            <span className={coin.change >= 0 ? "text-green-500" : "text-red-500"}>
              {coin.change > 0 ? "+" : ""}{coin.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
