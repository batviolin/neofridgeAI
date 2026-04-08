/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Thermometer, 
  Plus, 
  Minus, 
  Trash2, 
  Mic, 
  MicOff, 
  Volume2, 
  AlertTriangle, 
  X,
  ShoppingBag,
  ChefHat,
  MessageSquare
} from 'lucide-react';
import { cn } from './lib/utils';
import { InventoryItem, FridgeState } from './types';
import { processVoiceCommand } from './services/gemini';

// --- SPEECH ENGINE HELPERS ---
function speak(text: string, onStart?: () => void, onEnd?: () => void) {
  window.speechSynthesis.cancel();
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }

  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.lang = 'en-US';
    
    utterance.onstart = () => {
      if (onStart) onStart();
    };

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = (event) => {
      console.error("Speech Error:", event);
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
  }, 100);
}

export default function App() {
  const [temperature, setTemperature] = useState(4);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [itemInput, setItemInput] = useState('');
  const [alertItem, setAlertItem] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<string>('');

  const recognitionRef = useRef<any>(null);
  const stateRef = useRef<FridgeState>({ temperature: 4, inventory: [] });
  const isListeningRef = useRef(false);
  const isProcessingRef = useRef(false);
  const isSpeakingRef = useRef(false);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = { temperature, inventory };
  }, [temperature, inventory]);

  // --- RECOGNITION CONTROL ---
  const startRecognition = useCallback(() => {
    if (isListeningRef.current && !isSpeakingRef.current && !isProcessingRef.current) {
      try {
        recognitionRef.current?.start();
      } catch (e) {
        // Already active
      }
    }
  }, []);

  // --- ACTIONS ---
  const changeTemp = useCallback((delta: number) => {
    setTemperature(prev => prev + delta);
  }, []);

  const setTempAbsolute = useCallback((val: number) => {
    setTemperature(val);
  }, []);

  const handleInventoryUpdate = useCallback((name: string, delta: number, isNew = false) => {
    const normalizedName = name.toLowerCase().trim();
    if (!normalizedName) return;

    setInventory(prev => {
      const existingIndex = prev.findIndex(i => i.name === normalizedName);
      let newInventory = [...prev];

      if (isNew && existingIndex === -1) {
        const newItem = { name: normalizedName, qty: Math.max(1, delta) };
        newInventory.push(newItem);
        if (newItem.qty === 1) setAlertItem(normalizedName);
      } else if (existingIndex !== -1) {
        const item = { ...newInventory[existingIndex] };
        item.qty += delta;
        
        if (item.qty <= 0) {
          newInventory.splice(existingIndex, 1);
        } else {
          newInventory[existingIndex] = item;
          if (item.qty === 1) setAlertItem(normalizedName);
        }
      } else {
        const newItem = { name: normalizedName, qty: Math.max(1, delta) };
        newInventory.push(newItem);
      }
      return newInventory;
    });
  }, []);

  const removeItem = useCallback((name: string) => {
    setInventory(prev => prev.filter(i => i.name !== name));
  }, []);

  const reportStatus = useCallback(() => {
    const { temperature: t, inventory: inv } = stateRef.current;
    const itemsStr = inv.map(i => `${i.qty} ${i.name}`).join(", ");
    const status = `Fridge is ${t} degrees. Items: ${itemsStr || "empty"}`;
    setLastResponse(status);
    speak(status, 
      () => { isSpeakingRef.current = true; }, 
      () => { 
        isSpeakingRef.current = false; 
        startRecognition();
      }
    );
  }, [startRecognition]);

  // --- GEMINI INTEGRATION ---
  const handleVoiceCommand = useCallback(async (transcript: string) => {
    setIsProcessing(true);
    isProcessingRef.current = true;
    recognitionRef.current?.stop();

    const result = await processVoiceCommand(transcript, stateRef.current);
    
    if (result.functionCalls) {
      for (const call of result.functionCalls) {
        if (call.name === 'changeTemperature') {
          const { delta, absolute } = call.args as any;
          if (absolute !== undefined) setTempAbsolute(absolute);
          else if (delta !== undefined) changeTemp(delta);
        } else if (call.name === 'updateInventory') {
          const { action, itemName, qty } = call.args as any;
          if (action === 'add') handleInventoryUpdate(itemName, qty || 1, true);
          else if (action === 'remove') removeItem(itemName);
          else if (action === 'update') handleInventoryUpdate(itemName, qty || 0);
        }
      }
    }

    if (result.text) {
      setLastResponse(result.text);
      speak(result.text, 
        () => { isSpeakingRef.current = true; },
        () => {
          isSpeakingRef.current = false;
          setIsProcessing(false);
          isProcessingRef.current = false;
          startRecognition();
        }
      );
    } else {
      setIsProcessing(false);
      isProcessingRef.current = false;
      startRecognition();
    }
  }, [changeTemp, setTempAbsolute, handleInventoryUpdate, removeItem, startRecognition]);

  // --- SPEECH RECOGNITION SETUP ---
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        handleVoiceCommand(transcript);
      };

      recognition.onend = () => {
        startRecognition();
      };

      recognitionRef.current = recognition;
    }

    return () => {
      recognitionRef.current?.stop();
    };
  }, [handleVoiceCommand, startRecognition]);

  const toggleListening = () => {
    if (!isListening) {
      setIsListening(true);
      isListeningRef.current = true;
      speak("I am listening. You can talk to me continuously now.", 
        () => { isSpeakingRef.current = true; },
        () => { 
          isSpeakingRef.current = false; 
          startRecognition();
        }
      );
    } else {
      setIsListening(false);
      isListeningRef.current = false;
      recognitionRef.current?.stop();
      speak("Voice assistant deactivated.", 
        () => { isSpeakingRef.current = true; },
        () => { isSpeakingRef.current = false; }
      );
    }
  };

  const closeAlert = () => {
    setAlertItem(null);
    speak("Alert dismissed.");
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-50 font-['Outfit'] flex items-center justify-center p-4 overflow-hidden">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -right-[10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -left-[10%] w-[50%] h-[50%] bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      {/* Low Stock Alert Overlay */}
      <AnimatePresence>
        {alertItem && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border-2 border-red-500/50 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl shadow-red-500/20"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-red-500 mb-2">Low Stock Alert</h2>
              <p className="text-slate-400 mb-6">
                Warning: You are running low on <span className="text-slate-100 font-semibold uppercase">{alertItem}</span>. 
                Only one remaining in the fridge.
              </p>
              <div className="flex flex-col gap-3">
                <a 
                  href={`https://batviolin.github.io/neofridge/?item=${encodeURIComponent(alertItem)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <ShoppingBag className="w-5 h-5" />
                  Order Now
                </a>
                <button 
                  onClick={closeAlert}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-6 rounded-xl transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-xl bg-slate-900/40 border border-slate-800 backdrop-blur-2xl rounded-[2.5rem] p-8 md:p-12 shadow-2xl"
      >
        <header className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
            NeoFridge
          </h1>
          <p className="text-slate-500 uppercase tracking-widest text-xs font-semibold">
            Smart Assistant AI
          </p>
        </header>

        {/* Temperature Control */}
        <section className="bg-slate-950/40 rounded-3xl p-6 mb-8 border border-slate-800/50">
          <div className="flex items-center justify-center gap-8">
            <button 
              onClick={() => changeTemp(-1)}
              className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-all active:scale-90"
            >
              <Minus className="w-6 h-6" />
            </button>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-slate-500 mb-1">
                <Thermometer className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-tighter">Internal</span>
              </div>
              <span className="text-5xl md:text-6xl font-bold tabular-nums">
                {temperature}°C
              </span>
            </div>
            <button 
              onClick={() => changeTemp(1)}
              className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-all active:scale-90"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </section>

        {/* Inventory Management */}
        <section className="mb-8">
          <div className="flex gap-2 mb-6">
            <input 
              type="text" 
              value={itemInput}
              onChange={(e) => setItemInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (handleInventoryUpdate(itemInput, 1, true), setItemInput(''))}
              placeholder="Add item (e.g. Milk)"
              className="flex-1 bg-slate-950/40 border border-slate-800 rounded-2xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
            />
            <button 
              onClick={() => {
                handleInventoryUpdate(itemInput, 1, true);
                setItemInput('');
              }}
              className="bg-gradient-to-br from-cyan-400 to-blue-500 text-slate-950 font-bold px-6 rounded-2xl hover:opacity-90 transition-opacity active:scale-95"
            >
              Add
            </button>
          </div>

          <div className="max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
            <AnimatePresence mode="popLayout">
              {inventory.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-8 text-slate-600 italic"
                >
                  Inventory is empty
                </motion.div>
              ) : (
                <div className="flex flex-col gap-3">
                  {inventory.map((item) => (
                    <motion.div 
                      key={item.name}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="bg-slate-800/30 border border-slate-800/50 rounded-2xl p-4 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          item.qty === 1 ? "bg-red-500 animate-pulse" : "bg-cyan-500"
                        )} />
                        <span className="font-medium capitalize">{item.name}</span>
                        <span className="text-slate-500 text-sm">Qty: {item.qty}</span>
                      </div>
                      <button 
                        onClick={() => removeItem(item.name)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* AI Response Area */}
        <AnimatePresence>
          {lastResponse && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl flex gap-3"
            >
              <MessageSquare className="w-5 h-5 text-cyan-500 shrink-0 mt-1" />
              <p className="text-sm text-slate-300 leading-relaxed">
                {lastResponse}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={reportStatus}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <Volume2 className="w-5 h-5" />
            Status
          </button>
          <button 
            onClick={toggleListening}
            disabled={isProcessing}
            className={cn(
              "font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95",
              isListening 
                ? "bg-red-500 text-white animate-pulse" 
                : "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
              isProcessing && "opacity-50 cursor-not-allowed"
            )}
          >
            {isProcessing ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : isListening ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
            {isProcessing ? "Thinking..." : isListening ? "Stop AI" : "Start AI"}
          </button>
        </div>

        {/* Quick AI Actions */}
        <div className="mt-6 flex justify-center gap-4">
          <button 
            onClick={() => handleVoiceCommand("Tell me a joke about food")}
            className="text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-wider"
          >
            <ChefHat className="w-3 h-3" />
            Joke
          </button>
          <button 
            onClick={() => handleVoiceCommand("Suggest a recipe based on my inventory")}
            className="text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-wider"
          >
            <ChefHat className="w-3 h-3" />
            Recipe
          </button>
        </div>
      </motion.div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
      `}</style>
    </div>
  );
}
