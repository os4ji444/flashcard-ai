
import React, { useState } from 'react';
import { FlashcardData } from '../types';
import { RotateCw, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface StudyCardProps {
  data: FlashcardData;
  onRate: (quality: number) => void; // 1: Again, 2: Hard, 3: Good, 4: Easy
}

export const StudyCard: React.FC<StudyCardProps> = ({ data, onRate }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto h-[600px]">
      {/* Card Area */}
      <div 
        className="group relative w-full h-[500px] cursor-pointer perspective-1000 mb-8"
        onClick={handleFlip}
      >
        <div 
          className={`relative h-full w-full shadow-2xl transition-all duration-500 transform-style-3d rounded-3xl ${
            isFlipped ? 'rotate-y-180' : ''
          }`}
        >
          {/* Front Face */}
          <div className="absolute h-full w-full backface-hidden rounded-3xl overflow-hidden bg-white border border-slate-200 flex flex-col">
             <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
               <img 
                 src={data.imageSrc} 
                 alt="Flashcard Front" 
                 className="max-h-full max-w-full object-contain rounded-xl shadow-sm"
               />
             </div>
             <div className="p-4 text-center text-slate-400 text-sm border-t border-slate-100">
                Click to reveal answer
             </div>
          </div>

          {/* Back Face */}
          <div className="absolute h-full w-full backface-hidden rotate-y-180 rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-8 flex flex-col items-center justify-center text-center shadow-xl border border-indigo-400">
              <h3 className="text-3xl font-bold mb-6 border-b-2 border-white/20 pb-4 w-full">
                {data.name}
              </h3>
              <p className="text-indigo-50 leading-relaxed text-xl overflow-y-auto max-h-[300px] custom-scrollbar">
                {data.description}
              </p>
          </div>
        </div>
      </div>

      {/* Controls Area (Only visible when flipped) */}
      <div className={`transition-opacity duration-300 w-full ${isFlipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="grid grid-cols-4 gap-4">
              <button 
                onClick={(e) => { e.stopPropagation(); onRate(1); setIsFlipped(false); }}
                className="flex flex-col items-center justify-center p-3 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors border border-red-200 shadow-sm"
              >
                  <span className="font-bold text-lg">Again</span>
                  <span className="text-xs text-red-500 font-medium">1m</span>
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); onRate(2); setIsFlipped(false); }}
                className="flex flex-col items-center justify-center p-3 bg-orange-100 text-orange-700 rounded-xl hover:bg-orange-200 transition-colors border border-orange-200 shadow-sm"
              >
                  <span className="font-bold text-lg">Hard</span>
                  <span className="text-xs text-orange-500 font-medium">2d</span>
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); onRate(3); setIsFlipped(false); }}
                className="flex flex-col items-center justify-center p-3 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition-colors border border-green-200 shadow-sm"
              >
                  <span className="font-bold text-lg">Good</span>
                  <span className="text-xs text-green-500 font-medium">4d</span>
              </button>

              <button 
                onClick={(e) => { e.stopPropagation(); onRate(4); setIsFlipped(false); }}
                className="flex flex-col items-center justify-center p-3 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-colors border border-blue-200 shadow-sm"
              >
                  <span className="font-bold text-lg">Easy</span>
                  <span className="text-xs text-blue-500 font-medium">7d</span>
              </button>
          </div>
      </div>
    </div>
  );
};
