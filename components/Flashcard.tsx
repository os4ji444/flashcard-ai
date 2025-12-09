
import React, { useState } from 'react';
import { FlashcardData } from '../types';
import { RotateCw, Loader2, Edit2, Trash2, AlertCircle } from 'lucide-react';

interface FlashcardProps {
  data: FlashcardData;
  onEdit?: (card: FlashcardData) => void;
  onDelete?: (cardId: string) => void;
}

export const Flashcard: React.FC<FlashcardProps> = ({ data, onEdit, onDelete }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    if (data.status === 'completed') {
      setIsFlipped(!isFlipped);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    e.preventDefault();
    if (onEdit) onEdit(data);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDelete) onDelete(data.id);
  };

  return (
    <div 
      className="group relative h-80 w-full cursor-pointer perspective-1000"
      onClick={handleFlip}
    >
      <div 
        className={`relative h-full w-full shadow-xl transition-all duration-500 transform-style-3d rounded-2xl ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        {/* Front Face */}
        <div className="absolute h-full w-full backface-hidden rounded-2xl overflow-hidden bg-white border border-slate-200">
           
           {/* Image Container */}
           <div className="h-full w-full flex items-center justify-center p-4 bg-slate-50">
             {data.imageSrc ? (
               <img 
                 src={data.imageSrc} 
                 alt="Flashcard Front" 
                 className="max-h-full max-w-full object-contain rounded-lg shadow-sm"
               />
             ) : (
               <div className="text-slate-400 italic">No image</div>
             )}
           </div>
           
           {/* Loading Overlay */}
           {data.status === 'generating' && (
             <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white backdrop-blur-sm z-10">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <span className="text-sm font-medium">Identifying...</span>
             </div>
           )}

           {/* Error Overlay */}
           {data.status === 'error' && (
             <div className="absolute inset-0 bg-red-50/90 flex flex-col items-center justify-center text-red-600 backdrop-blur-sm p-4 text-center z-10">
                <AlertCircle className="w-8 h-8 mb-2" />
                <span className="text-sm font-medium">Generation Failed</span>
                <span className="text-xs mt-1 text-red-500">Retry available above</span>
             </div>
           )}

           {/* Hint icon */}
           {data.status === 'completed' && (
             <div className="absolute bottom-3 right-3 bg-white/80 p-2 rounded-full shadow-sm text-slate-600 z-10">
               <RotateCw size={16} />
             </div>
           )}

           {/* Action Buttons - Rendered LAST to be on top of everything */}
           {(data.status === 'completed' || data.status === 'error') && (
               <div className="absolute top-2 right-2 flex gap-2 z-50">
                   {onEdit && (
                       <button 
                        onClick={handleEdit} 
                        className="p-2 bg-white rounded-full shadow-md text-slate-600 hover:text-indigo-600 border border-slate-100 transition-colors flex items-center justify-center hover:scale-110 transform duration-200"
                        title="Edit Card"
                        type="button"
                       >
                           <Edit2 size={16} />
                       </button>
                   )}
                   {onDelete && (
                       <button 
                        onClick={handleDelete} 
                        className="p-2 bg-white rounded-full shadow-md text-slate-600 hover:text-red-600 border border-slate-100 transition-colors flex items-center justify-center hover:scale-110 transform duration-200"
                        title="Delete Card"
                        type="button"
                       >
                           <Trash2 size={16} />
                       </button>
                   )}
               </div>
           )}
        </div>

        {/* Back Face */}
        <div className="absolute h-full w-full backface-hidden rotate-y-180 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6 flex flex-col items-center justify-center text-center shadow-xl border border-indigo-400">
            {data.status === 'completed' ? (
              <>
                <h3 className="text-2xl font-bold mb-4 border-b-2 border-white/20 pb-2 w-full">
                  {data.name}
                </h3>
                <p className="text-indigo-50 leading-relaxed text-lg overflow-y-auto custom-scrollbar">
                  {data.description}
                </p>
              </>
            ) : (
               <div className="flex flex-col items-center">
                 <span className="text-white/80">Analysis Pending</span>
               </div>
            )}
        </div>
      </div>
    </div>
  );
};
