
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Sparkles, AlertCircle, Loader2, Key, Trash2, Globe, PlayCircle, ArrowLeft, Folder, Plus, RefreshCw, Edit2, Check, Download, Upload as UploadIcon, HardDriveDownload, Eye, CheckSquare, Square, BrainCircuit, Settings, X, Save, EyeOff, RotateCcw, Wrench, Image as ImageIcon, FileCheck, Presentation } from 'lucide-react';
import { extractImagesFromPdf, convertPdfPagesToImages, createPptxFromPdf } from './services/pdfService';
import { extractImagesFromPptx } from './services/pptxService';
import { generateFlashcardContent } from './services/geminiService';
import { getUserDecks, saveUserDecks, generateBackup, restoreBackup } from './services/storageService';
import { Flashcard } from './components/Flashcard';
import { StudyCard } from './components/StudyCard';
import { CardEditor } from './components/CardEditor';
import { AppStatus, ExtractedImage, FlashcardData, ProcessingStats, Deck, AIConfig } from './types';
import JSZip from 'jszip';

// Constant ID for local-only usage
const GUEST_USER_ID = 'guest-user';

const MODEL_PRESETS = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
];

export default function App() {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  
  const [stats, setStats] = useState<ProcessingStats>({ totalImages: 0, processedImages: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<string>('French');
  
  // AI Config State
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
    const saved = localStorage.getItem('flashcard-ai-config');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error("Failed to parse saved config", e);
        }
    }
    // Backward compatibility or default
    const oldModel = localStorage.getItem('flashcard-ai-model');
    return {
        provider: 'google',
        modelName: oldModel || 'gemini-2.5-flash',
        apiKey: '',
        baseUrl: ''
    };
  });
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  
  // New Modals
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Review Mode State
  const [extractedCandidates, setExtractedCandidates] = useState<ExtractedImage[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());

  // Study Mode State
  const [studyQueue, setStudyQueue] = useState<FlashcardData[]>([]);
  const [currentStudyIndex, setCurrentStudyIndex] = useState(0);

  // Editor State
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeCardToEdit, setActiveCardToEdit] = useState<FlashcardData | undefined>(undefined);

  // Rename Deck State
  const [isEditingDeckTitle, setIsEditingDeckTitle] = useState(false);
  const [deckTitleInput, setDeckTitleInput] = useState('');

  // Ref to track processing
  const processingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived state for the currently active deck
  const activeDeck = decks.find(d => d.id === activeDeckId) || null;

  // Load User Data (Guest)
  useEffect(() => {
    const userDecks = getUserDecks(GUEST_USER_ID);
    setDecks(userDecks);
  }, []);

  // Save User Data (Guest)
  useEffect(() => {
    if (decks.length >= 0) {
      saveUserDecks(GUEST_USER_ID, decks);
    }
  }, [decks]);

  // Sync title input when deck changes
  useEffect(() => {
      if (activeDeck) {
          setDeckTitleInput(activeDeck.title);
      }
  }, [activeDeckId, activeDeck?.title]);

  // Persist AI config
  useEffect(() => {
    localStorage.setItem('flashcard-ai-config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  // --- Confirmation Logic ---
  const requestConfirm = (title: string, message: string, onConfirm: () => void) => {
      setConfirmDialog({ isOpen: true, title, message, onConfirm });
  };
  
  const handleConfirmAction = () => {
      try {
        confirmDialog.onConfirm();
      } catch (e) {
        console.error("Confirmation action failed", e);
      } finally {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
  };

  // --- Backup / Restore ---
  const handleExportData = () => {
      try {
          const backupJson = generateBackup(GUEST_USER_ID);
          const blob = new Blob([backupJson], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `flashcard-ai-backup-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (err: any) {
          alert("Failed to export data: " + err.message);
      }
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const content = e.target?.result as string;
              const restoredDecks = restoreBackup(GUEST_USER_ID, content);
              setDecks(restoredDecks);
              alert("Data restored successfully!");
              setStatus(AppStatus.IDLE);
              setActiveDeckId(null);
          } catch (err: any) {
              alert("Failed to import: " + err.message);
          }
          // Reset input
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };

  // --- Deck & File Actions ---

  const processFile = async (file: File) => {
    const fileType = file.name.split('.').pop()?.toLowerCase();
    
    if (fileType !== 'pdf' && fileType !== 'pptx') {
      setErrorMsg('Please upload a valid PDF or PPTX file.');
      return;
    }

    // Create a new Deck for this upload
    const newDeckId = `deck-${Date.now()}`;
    const newDeck: Deck = {
      id: newDeckId,
      title: file.name,
      createdAt: Date.now(),
      cards: []
    };

    try {
      setDecks(prev => [...prev, newDeck]);
      setActiveDeckId(newDeckId);
      setStatus(AppStatus.EXTRACTING);
      setErrorMsg(null);
      setStats({ totalImages: 0, processedImages: 0 });

      let images: ExtractedImage[] = [];

      if (fileType === 'pdf') {
          images = await extractImagesFromPdf(file);
      } else if (fileType === 'pptx') {
          images = await extractImagesFromPptx(file);
      }

      if (images.length === 0) {
        setErrorMsg(`No suitable images found in ${file.name}. Try converting PDF to PPTX using the Tools menu first.`);
        setStatus(AppStatus.IDLE);
        setDecks(prev => prev.filter(d => d.id !== newDeckId));
        setActiveDeckId(null);
        return;
      }

      setExtractedCandidates(images);
      
      const autoSelected = new Set<string>();
      images.forEach(img => autoSelected.add(img.id));
      
      setSelectedCandidateIds(autoSelected);
      setStatus(AppStatus.REVIEW);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to process file.');
      setStatus(AppStatus.ERROR);
      setDecks(prev => prev.filter(d => d.id !== newDeckId));
      setActiveDeckId(null);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        await processFile(file);
    }
  };

  const handleStartGeneration = () => {
      if (!activeDeckId) return;

      const selected = extractedCandidates.filter(img => selectedCandidateIds.has(img.id));
      const ignored = extractedCandidates.filter(img => !selectedCandidateIds.has(img.id));
      
      if (selected.length === 0) {
          alert("Please select at least one image to generate flashcards.");
          return;
      }

      // Initialize Flashcards
      const newCards: FlashcardData[] = selected.map(img => ({
        id: img.id,
        imageId: img.id,
        imageSrc: img.dataUrl,
        name: '',
        description: '',
        status: 'pending',
        contextText: img.contextText,
        interval: 0,
        ease: 2.5,
        reps: 0,
        nextReview: Date.now()
      }));

      // Update the deck with new cards AND ignored images
      setDecks(prev => prev.map(d => d.id === activeDeckId ? { 
          ...d, 
          cards: newCards,
          ignoredImages: ignored
      } : d));
      
      setStats({ totalImages: newCards.length, processedImages: 0 });
      setStatus(AppStatus.GENERATING);

      processQueue(newCards, activeDeckId);
  };

  const processQueue = async (cardsToProcess: FlashcardData[], deckId: string) => {
    if (processingRef.current) return;
    processingRef.current = true;

    // REDUCED BATCH SIZE TO 1 to prevent Rate Limiting
    const BATCH_SIZE = 1; 
    let currentBatch = [...cardsToProcess];
    
    const updateDeckCards = (updater: (cards: FlashcardData[]) => FlashcardData[]) => {
        setDecks(prevDecks => prevDecks.map(d => {
            if (d.id === deckId) {
                return { ...d, cards: updater(d.cards) };
            }
            return d;
        }));
    };

    for (let i = 0; i < currentBatch.length; i += BATCH_SIZE) {
        const batch = currentBatch.slice(i, i + BATCH_SIZE);
        
        const promises = batch.map(async (card) => {
            updateDeckCards(cards => cards.map(c => c.id === card.id ? { ...c, status: 'generating' } : c));
            
            const content = await generateFlashcardContent(card.imageSrc, card.contextText, targetLanguage, aiConfig);
            
            if (content.isValid === false) {
                 // Move to ignoredImages instead of just deleting
                 setDecks(prevDecks => prevDecks.map(d => {
                    if (d.id === deckId) {
                        // Attempt to reconstruct simple ExtractedImage
                        let pIndex = 0;
                        const parts = card.id.split('-');
                        if (card.id.startsWith('pptx-') && parts.length >= 2) {
                            pIndex = parseInt(parts[1]) || 0;
                        } else {
                            pIndex = parseInt(parts[0]) || 0;
                        }

                        const ignoredImg: ExtractedImage = {
                            id: card.id,
                            dataUrl: card.imageSrc,
                            pageIndex: pIndex,
                            contextText: card.contextText || ''
                        };

                        return { 
                            ...d, 
                            cards: d.cards.filter(c => c.id !== card.id),
                            ignoredImages: [...(d.ignoredImages || []), ignoredImg]
                        };
                    }
                    return d;
                }));
            } else if (content.name === 'Error') {
                updateDeckCards(cards => cards.map(c => c.id === card.id ? {
                    ...c,
                    name: 'Generation Failed',
                    description: content.description,
                    status: 'error' as const
                } : c));
            } else {
                updateDeckCards(cards => {
                     const isDuplicate = cards.some(c => 
                        c.status === 'completed' && 
                        c.id !== card.id && 
                        c.name.toLowerCase().trim() === content.name.toLowerCase().trim()
                    );

                    if (isDuplicate) {
                         return cards.filter(c => c.id !== card.id);
                    } else {
                         return cards.map(c => c.id === card.id ? {
                            ...c,
                            name: content.name,
                            description: content.description,
                            status: 'completed' as const
                        } : c);
                    }
                });
            }
            
            setStats(prev => ({ ...prev, processedImages: prev.processedImages + 1 }));
        });

        await Promise.all(promises);
    }

    setStatus(AppStatus.COMPLETED);
    processingRef.current = false;
  };

  // --- CRUD & Utils ---
  const openAddCard = () => { setActiveCardToEdit(undefined); setEditorOpen(true); };
  const openEditCard = (card: FlashcardData) => { setActiveCardToEdit(card); setEditorOpen(true); };
  
  const handleSaveCard = (cardData: Partial<FlashcardData>) => {
    if (!activeDeck) return;
    setDecks(prevDecks => prevDecks.map(deck => {
      if (deck.id === activeDeck.id) {
        let updatedCards = [...deck.cards];
        if (activeCardToEdit) {
          updatedCards = updatedCards.map(c => c.id === activeCardToEdit.id ? { ...c, ...cardData } as FlashcardData : c);
        } else {
          updatedCards.push({
            id: `manual-${Date.now()}`,
            imageId: `img-${Date.now()}`,
            imageSrc: cardData.imageSrc || '',
            name: cardData.name || '',
            description: cardData.description || '',
            status: 'completed',
            contextText: '',
            interval: 0, ease: 2.5, reps: 0, nextReview: Date.now()
          });
        }
        return { ...deck, cards: updatedCards };
      }
      return deck;
    }));
  };

  const handleRecoverImage = (img: ExtractedImage) => {
      if (!activeDeck) return;

      // 1. Create a new card from the ignored image
      const newCard: FlashcardData = {
          id: img.id,
          imageId: img.id,
          imageSrc: img.dataUrl,
          name: 'Recovered Image',
          description: 'Edit this card to add details.',
          status: 'completed',
          contextText: img.contextText,
          interval: 0,
          ease: 2.5,
          reps: 0,
          nextReview: Date.now()
      };

      // 2. Update deck: Add to cards, Remove from ignoredImages
      setDecks(prev => prev.map(d => {
          if (d.id === activeDeck.id) {
              return {
                  ...d,
                  cards: [...d.cards, newCard],
                  ignoredImages: d.ignoredImages?.filter(i => i.id !== img.id)
              };
          }
          return d;
      }));

      // 3. Close recovery modal and open editor for this card
      setShowRecoveryModal(false);
      setActiveCardToEdit(newCard);
      setEditorOpen(true);
  };

  const handleDeleteCard = (cardId: string) => {
    if (!activeDeckId) return;
    requestConfirm(
        "Delete Card?",
        "Are you sure you want to delete this flashcard? This cannot be undone.",
        () => {
             setDecks(prev => prev.map(d => d.id === activeDeckId ? { ...d, cards: d.cards.filter(c => c.id !== cardId) } : d));
        }
    );
  };

  const handleDeleteDeck = (e: React.MouseEvent, deckId: string) => {
      e.stopPropagation(); e.preventDefault(); e.nativeEvent.stopImmediatePropagation();
      requestConfirm(
          "Delete Deck?",
          "Are you sure you want to delete this entire deck and all its cards? This cannot be undone.",
          () => {
              setDecks(prev => prev.filter(d => d.id !== deckId));
              if (activeDeckId === deckId) { setActiveDeckId(null); setStatus(AppStatus.IDLE); }
          }
      );
  };

  const handleEditDeckFromDashboard = (e: React.MouseEvent, deck: Deck) => {
      e.stopPropagation(); e.preventDefault(); e.nativeEvent.stopImmediatePropagation();
      setActiveDeckId(deck.id); setStatus(AppStatus.COMPLETED); setDeckTitleInput(deck.title); setIsEditingDeckTitle(true);
  };

  const handleSaveDeckTitle = () => {
      if (!activeDeck) return;
      const newTitle = deckTitleInput.trim() || activeDeck.title;
      setDecks(prev => prev.map(d => d.id === activeDeck.id ? { ...d, title: newTitle } : d));
      setIsEditingDeckTitle(false);
  };

  const handleRetryErrors = () => {
      if (!activeDeck) return;
      const errorCards = activeDeck.cards.filter(c => c.status === 'error');
      if (errorCards.length === 0) return;
      setStatus(AppStatus.GENERATING);
      processQueue(errorCards, activeDeck.id);
  };

  // --- Study Logic ---
  const startStudySession = () => {
      if (!activeDeck) return;
      const now = Date.now();
      const dueCards = activeDeck.cards.filter(c => c.status === 'completed' && (!c.nextReview || c.nextReview <= now));
      const sessionCards = dueCards.length > 0 ? dueCards : activeDeck.cards.filter(c => c.status === 'completed');
      if (sessionCards.length === 0) { alert("No cards available to study yet!"); return; }
      setStudyQueue(sessionCards); setCurrentStudyIndex(0); setStatus(AppStatus.STUDY);
  };

  const handleRateCard = (quality: number) => {
      if (!activeDeck) return;
      const currentCard = studyQueue[currentStudyIndex];
      let { interval = 0, reps = 0, ease = 2.5 } = currentCard;
      if (quality === 1) { reps = 0; interval = 1; }
      else {
          reps += 1;
          if (reps === 1) interval = 1; else if (reps === 2) interval = 6; else interval = Math.round(interval * ease);
          if (quality === 2) ease = Math.max(1.3, ease - 0.2);
          if (quality === 4) ease = ease + 0.15;
      }
      const nextReview = Date.now() + (interval * 24 * 60 * 60 * 1000);
      const updatedCard = { ...currentCard, interval, reps, ease, nextReview };
      setDecks(prev => prev.map(d => d.id === activeDeck.id ? { ...d, cards: d.cards.map(c => c.id === currentCard.id ? updatedCard : c) } : d));
      if (currentStudyIndex < studyQueue.length - 1) setCurrentStudyIndex(prev => prev + 1);
      else { alert("Session Complete!"); setStatus(AppStatus.COMPLETED); }
  };

  const handleApiKeyChange = async () => {
      const aiStudio = (window as any).aistudio;
      if (aiStudio) try { await aiStudio.openSelectKey(); } catch (e) { console.error(e); }
      else alert("API Key selection is managed by the hosting platform.");
  };

  const handleBackToDashboard = () => { setActiveDeckId(null); setStatus(AppStatus.IDLE); setIsEditingDeckTitle(false); };

  const handleModelSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (val === 'custom-config') {
          setIsSettingsOpen(true);
      } else {
          // Preset selection (Google)
          setAiConfig(prev => ({ ...prev, provider: 'google', modelName: val }));
      }
  };

  // --- COMPONENTS ---

  const ConfirmDialog = () => {
      if (!confirmDialog.isOpen) return null;
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200 pointer-events-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col scale-100 opacity-100 border border-slate-100">
                <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmDialog.title}</h3>
                    <p className="text-sm text-slate-500">{confirmDialog.message}</p>
                </div>
                <div className="flex border-t border-slate-100">
                    <button 
                        onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                        className="flex-1 py-3 text-slate-600 font-medium hover:bg-slate-50 transition-colors border-r border-slate-100 active:bg-slate-100"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleConfirmAction}
                        className="flex-1 py-3 text-red-600 font-bold hover:bg-red-50 transition-colors active:bg-red-100"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
      );
  };

  const RecoveryModal = () => {
      if (!showRecoveryModal || !activeDeck) return null;
      
      const ignored = activeDeck.ignoredImages || [];

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[85vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <EyeOff size={20} className="text-slate-500" />
                            Recover Hidden Images
                        </h2>
                        <p className="text-sm text-slate-500">
                            These images were detected but not selected (or rejected by AI). Click 'Recover' to add them to your deck.
                        </p>
                    </div>
                    <button onClick={() => setShowRecoveryModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    {ignored.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <EyeOff size={48} className="mb-4 opacity-50" />
                            <p>No hidden images found.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {ignored.map(img => (
                                <div key={img.id} className="relative group bg-white rounded-xl overflow-hidden border border-slate-200 hover:shadow-md transition-all">
                                    <div className="aspect-square bg-slate-50 p-4 flex items-center justify-center">
                                        <img src={img.dataUrl} alt="Ignored Candidate" className="max-w-full max-h-full object-contain" />
                                    </div>
                                    <div className="p-3 border-t border-slate-100 bg-white flex items-center justify-between">
                                        <div className="text-xs font-semibold text-slate-500 uppercase">
                                            Page {img.pageIndex}
                                        </div>
                                        <button 
                                            onClick={() => handleRecoverImage(img)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors"
                                        >
                                            <RotateCcw size={14} /> Recover
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
      );
  };

  const ToolsModal = () => {
    const [conversionStatus, setConversionStatus] = useState<'idle' | 'processing' | 'done'>('idle');
    const [progress, setProgress] = useState(0);

    if (!isToolsOpen) return null;

    const handlePdfToPptx = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setConversionStatus('processing');
        setProgress(0);

        try {
            // 1. Convert
            const blob = await createPptxFromPdf(file, (curr, total) => {
                setProgress(Math.round((curr / total) * 100));
            });
            
            // 2. Auto-process as a "File Upload"
            const pptxFile = new File([blob], file.name.replace('.pdf', '.pptx'), { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
            
            // Close modal first
            setIsToolsOpen(false);
            setConversionStatus('idle');

            // Trigger main processing
            await processFile(pptxFile);
            
            alert("PDF converted to PowerPoint successfully! Now scanning for images...");

        } catch (err: any) {
            console.error(err);
            alert("Conversion failed: " + err.message);
            setConversionStatus('idle');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Wrench size={20} className="text-indigo-600" />
                        PDF Tools
                    </h2>
                    <button onClick={() => setIsToolsOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>
                
                <div className="p-6">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
                        <h3 className="font-semibold text-blue-800 mb-1 flex items-center gap-2">
                            <AlertCircle size={18} /> Fix Extraction Issues
                        </h3>
                        <p className="text-sm text-blue-700">
                            If standard PDF extraction misses images, use this tool. It will scan the PDF and recreate it as a PowerPoint file where <b>text and images are separated</b> into distinct, editable elements.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors relative group">
                            {conversionStatus === 'idle' ? (
                                <>
                                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Presentation size={24} />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-800">Convert PDF to Deck (via PPTX)</h3>
                                    <p className="text-slate-500 text-sm mt-1 mb-4">
                                        Separates text and images automatically.
                                    </p>
                                    <div className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-sm">
                                        Select PDF File
                                    </div>
                                    <input 
                                        type="file" 
                                        accept=".pdf"
                                        onChange={handlePdfToPptx}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                </>
                            ) : (
                                <div className="py-4">
                                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
                                    <h3 className="font-bold text-slate-800">
                                        {conversionStatus === 'processing' ? `Analyzing Page ${progress}%...` : 'Finalizing...'}
                                    </h3>
                                    <p className="text-slate-500 text-sm mt-2">Extracting distinct elements...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
  };

  const AISettingsModal = () => {
    if (!isSettingsOpen) return null;
    
    // Local state for form
    const [localConfig, setLocalConfig] = useState<AIConfig>(aiConfig);

    const handleSave = () => {
        setAiConfig(localConfig);
        setIsSettingsOpen(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Settings size={20} className="text-indigo-600" />
                        AI Settings
                    </h2>
                    <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Provider Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-3">AI Provider</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button" 
                                onClick={() => setLocalConfig({ ...localConfig, provider: 'google' })}
                                className={`px-4 py-3 rounded-xl border-2 font-medium transition-all text-sm ${localConfig.provider === 'google' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                            >
                                Google Gemini
                            </button>
                            <button 
                                type="button"
                                onClick={() => setLocalConfig({ ...localConfig, provider: 'openai' })}
                                className={`px-4 py-3 rounded-xl border-2 font-medium transition-all text-sm ${localConfig.provider === 'openai' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                            >
                                External API
                            </button>
                        </div>
                    </div>

                    {localConfig.provider === 'google' ? (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Model Name</label>
                            <input 
                                type="text" 
                                value={localConfig.modelName}
                                onChange={e => setLocalConfig({...localConfig, modelName: e.target.value})}
                                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="gemini-2.5-flash"
                            />
                            <p className="text-xs text-slate-500 mt-2">
                                Uses the API Key managed by the app/session. Enter a custom model name here if needed.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
                                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                Use any OpenAI-compatible API (OpenAI, Groq, DeepSeek, LocalAI, etc.)
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
                                <input 
                                    type="text" 
                                    value={localConfig.baseUrl}
                                    onChange={e => setLocalConfig({...localConfig, baseUrl: e.target.value})}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="https://api.openai.com/v1"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                                <input 
                                    type="password" 
                                    value={localConfig.apiKey}
                                    onChange={e => setLocalConfig({...localConfig, apiKey: e.target.value})}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="sk-..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Model Name</label>
                                <input 
                                    type="text" 
                                    value={localConfig.modelName}
                                    onChange={e => setLocalConfig({...localConfig, modelName: e.target.value})}
                                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="gpt-4o"
                                />
                            </div>
                        </div>
                    )}

                    <div className="pt-4 flex justify-end gap-3">
                        <button 
                            onClick={() => setIsSettingsOpen(false)}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSave}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2"
                        >
                            <Save size={18} /> Save Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
  };

  // Review Screen
  const renderReviewScreen = () => {
      const selectedCount = selectedCandidateIds.size;
      const toggleSelect = (id: string) => {
          const newSet = new Set(selectedCandidateIds);
          if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
          setSelectedCandidateIds(newSet);
      };

      const toggleAll = () => {
          if (selectedCount === extractedCandidates.length) {
              setSelectedCandidateIds(new Set());
          } else {
              const all = new Set<string>();
              extractedCandidates.forEach(c => all.add(c.id));
              setSelectedCandidateIds(all);
          }
      };
      
      const handleDeleteCandidate = (e: React.MouseEvent, id: string) => {
          e.stopPropagation();
          setExtractedCandidates(prev => prev.filter(c => c.id !== id));
          setSelectedCandidateIds(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
          });
      };

      return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Review Detected Images</h2>
                    <p className="text-slate-500 mt-1">
                        Found {extractedCandidates.length} potential images. Select the ones you want to generate cards for.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={toggleAll}
                        className="text-indigo-600 font-medium hover:text-indigo-800 transition-colors"
                    >
                        {selectedCount === extractedCandidates.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button 
                        onClick={handleStartGeneration}
                        disabled={selectedCount === 0}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <Sparkles size={18} />
                        Generate {selectedCount} Cards
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {extractedCandidates.map(img => {
                    const isSelected = selectedCandidateIds.has(img.id);
                    return (
                        <div 
                            key={img.id}
                            onClick={() => toggleSelect(img.id)}
                            className={`relative group bg-white rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${isSelected ? 'border-indigo-500 shadow-md ring-2 ring-indigo-100' : 'border-slate-200 opacity-80 hover:opacity-100'}`}
                        >
                            <div className="absolute top-2 left-2 z-10">
                                {isSelected ? (
                                    <div className="bg-indigo-600 text-white p-1 rounded-md shadow-sm">
                                        <CheckSquare size={18} />
                                    </div>
                                ) : (
                                    <div className="bg-white text-slate-400 p-1 rounded-md shadow-sm border border-slate-200">
                                        <Square size={18} />
                                    </div>
                                )}
                            </div>

                            <div className="absolute top-2 right-2 z-10 flex gap-1 bg-white/95 backdrop-blur-sm p-1 rounded-lg border border-slate-200 shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                 <button 
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-slate-100 transition-colors"
                                    onClick={(e) => { e.stopPropagation(); /* Placeholder for edit if needed later */ }}
                                    title="Edit"
                                 >
                                     <Edit2 size={16} />
                                 </button>
                                 <div className="w-px bg-slate-200 my-0.5"></div>
                                 <button 
                                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                    onClick={(e) => handleDeleteCandidate(e, img.id)}
                                    title="Delete"
                                 >
                                     <Trash2 size={16} />
                                 </button>
                            </div>

                            <div className="aspect-square bg-slate-50 p-4 flex items-center justify-center">
                                <img src={img.dataUrl} alt="Candidate" className="max-w-full max-h-full object-contain" />
                            </div>

                            <div className="p-3 border-t border-slate-100 bg-white">
                                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                                    Page {img.pageIndex}
                                </div>
                                <div className="text-xs text-slate-600 line-clamp-2 h-8 leading-tight">
                                    {img.contextText ? img.contextText.substring(0, 100) : <span className="italic text-slate-400">No text context found</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      );
  };

  // 1. DASHBOARD VIEW (IDLE)
  const renderDashboard = () => (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6">
              <div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Your Decks</h2>
                <p className="text-slate-500 mt-2 text-lg">Manage your study collections.</p>
              </div>

              <div className="flex gap-3">
                   {/* Backup Controls */}
                   <button 
                      onClick={handleExportData}
                      className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all font-medium shadow-sm"
                      title="Export all data to JSON"
                   >
                       <Download size={20} /> <span className="hidden sm:inline">Export</span>
                   </button>
                   <button 
                      onClick={handleImportClick}
                      className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all font-medium shadow-sm"
                      title="Import data from JSON"
                   >
                       <UploadIcon size={20} /> <span className="hidden sm:inline">Import</span>
                   </button>
                   <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImportFile}
                      accept=".json"
                      className="hidden"
                   />

                   <div className="relative group cursor-pointer">
                      <input 
                          type="file" 
                          accept=".pdf,.pptx"
                          onChange={handleFileUpload}
                          className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                      />
                      <button className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg font-semibold">
                          <Plus size={20} /> Create New Deck
                      </button>
                  </div>
              </div>
          </div>

          {decks.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                  <div className="mx-auto w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-4">
                      <Folder size={32} />
                  </div>
                  <h3 className="text-xl font-medium text-slate-800">No decks yet</h3>
                  <p className="text-slate-500 mt-2 mb-6">Upload a PDF or PPTX to create your first flashcard deck.</p>
                  <p className="text-sm text-slate-400">Supports automatic instrument recognition</p>
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {decks.map(deck => {
                      const cardCount = deck.cards.length;
                      const completedCount = deck.cards.filter(c => c.status === 'completed').length;
                      const dueCount = deck.cards.filter(c => c.status === 'completed' && (!c.nextReview || c.nextReview <= Date.now())).length;
                      
                      return (
                          <div 
                              key={deck.id}
                              onClick={() => { setActiveDeckId(deck.id); setStatus(AppStatus.COMPLETED); }}
                              className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all cursor-pointer relative overflow-hidden"
                          >
                              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                                  <button 
                                    onClick={(e) => handleEditDeckFromDashboard(e, deck)} 
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="p-2 bg-white/90 shadow-sm border border-slate-100 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-full transition-colors"
                                    title="Rename Deck"
                                  >
                                      <Edit2 size={18} />
                                  </button>
                                  <button 
                                    onClick={(e) => handleDeleteDeck(e, deck.id)} 
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="p-2 bg-white/90 shadow-sm border border-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                                    title="Delete Deck"
                                  >
                                      <Trash2 size={18} />
                                  </button>
                              </div>

                              <div className="flex items-start gap-4 mb-6">
                                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                                      <Folder size={24} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <h3 className="font-bold text-lg text-slate-900 truncate pr-6">{deck.title}</h3>
                                      <p className="text-sm text-slate-500 mt-1">
                                          Created {new Date(deck.createdAt).toLocaleDateString()}
                                      </p>
                                  </div>
                              </div>
                              
                              <div className="flex items-center justify-between text-sm border-t border-slate-100 pt-4">
                                  <div className="flex items-center gap-2 text-slate-600">
                                      <FileText size={16} />
                                      <span>{cardCount} Cards</span>
                                  </div>
                                  {cardCount > 0 && (
                                      <div className={`flex items-center gap-1.5 font-medium ${dueCount > 0 ? 'text-indigo-600' : 'text-green-600'}`}>
                                          {dueCount > 0 ? (
                                              <><Sparkles size={14} /> {dueCount} Due</>
                                          ) : (
                                              <><Sparkles size={14} /> All Caught Up</>
                                          )}
                                      </div>
                                  )}
                              </div>
                          </div>
                      );
                  })}
              </div>
          )}
      </div>
  );

  // 2. ACTIVE DECK VIEW
  const renderActiveDeck = () => {
      if (!activeDeck) return null;
      
      const hasErrors = activeDeck.cards.some(c => c.status === 'error');
      // Always allow access to hidden list if it exists, even if empty (so users know it's there)
      const ignoredCount = activeDeck.ignoredImages ? activeDeck.ignoredImages.length : 0;

      return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <button onClick={handleBackToDashboard} className="p-2 -ml-2 text-slate-400 hover:text-slate-800 rounded-lg transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        {isEditingDeckTitle ? (
                            <div className="flex items-center gap-2">
                                <input 
                                    autoFocus
                                    type="text"
                                    value={deckTitleInput}
                                    onChange={(e) => setDeckTitleInput(e.target.value)}
                                    onBlur={handleSaveDeckTitle}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveDeckTitle()}
                                    className="text-2xl font-bold text-slate-900 border-b-2 border-indigo-500 outline-none bg-transparent px-1 min-w-[200px]"
                                />
                                <button onMouseDown={handleSaveDeckTitle} className="text-green-600 p-1 hover:bg-green-50 rounded-full">
                                    <Check size={20} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 group">
                                <h2 className="text-2xl font-bold text-slate-900 cursor-pointer" onClick={() => { setDeckTitleInput(activeDeck.title); setIsEditingDeckTitle(true); }}>
                                    {activeDeck.title}
                                </h2>
                                <button 
                                    onClick={() => { setDeckTitleInput(activeDeck.title); setIsEditingDeckTitle(true); }}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-full hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Edit2 size={18} />
                                </button>
                            </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                             <span>{activeDeck.cards.length} cards</span>
                             <span>•</span>
                             <span className={activeDeck.cards.filter(c => c.status === 'completed' && (!c.nextReview || c.nextReview <= Date.now())).length > 0 ? 'text-indigo-600 font-medium' : ''}>
                                {activeDeck.cards.filter(c => c.status === 'completed' && (!c.nextReview || c.nextReview <= Date.now())).length} to review
                             </span>
                        </div>
                    </div>
                </div>

                {status === AppStatus.COMPLETED && (
                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                         <button
                            onClick={() => setShowRecoveryModal(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors shadow-sm font-medium"
                            title="View ignored or rejected images"
                         >
                            <EyeOff size={18} /> <span className="hidden sm:inline">Hidden ({ignoredCount})</span>
                         </button>

                         {hasErrors && (
                             <button 
                                onClick={handleRetryErrors}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-red-100 text-red-700 border border-red-200 rounded-lg hover:bg-red-200 transition-colors shadow-sm font-medium"
                             >
                                <RefreshCw size={18} /> Retry Failed
                             </button>
                         )}

                        <button 
                           onClick={openAddCard}
                           className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium"
                        >
                           <Plus size={18} /> Add Card
                        </button>

                        {activeDeck.cards.length > 0 && (
                             <button 
                                onClick={startStudySession}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
                             >
                                <PlayCircle size={18} /> Study Deck
                             </button>
                        )}
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            {(status === AppStatus.EXTRACTING || status === AppStatus.GENERATING) && (
                <div className="mb-8 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                             {status === AppStatus.EXTRACTING ? (
                                 <div className="flex items-center gap-2 text-indigo-600 font-medium">
                                    <Loader2 className="animate-spin" size={18} /> Extracting images...
                                 </div>
                             ) : (
                                 <div className="font-semibold text-slate-800">
                                    Identifying Instruments ({targetLanguage})...
                                 </div>
                             )}
                        </div>
                        <span className="text-sm text-slate-500 font-mono">
                            {stats.processedImages} / {stats.totalImages}
                        </span>
                    </div>
                    {status === AppStatus.GENERATING && (
                       <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                            style={{ width: `${(stats.processedImages / Math.max(stats.totalImages, 1)) * 100}%` }}
                          ></div>
                       </div>
                    )}
                </div>
            )}

            {/* Error */}
            {errorMsg && (
                <div className="mb-8 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex items-center gap-3">
                    <AlertCircle />
                    {errorMsg}
                </div>
            )}

            {/* Grid */}
            {activeDeck.cards.length > 0 ? (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                    {activeDeck.cards.map((card) => (
                        <Flashcard 
                            key={card.id} 
                            data={card} 
                            onEdit={openEditCard}
                            onDelete={handleDeleteCard}
                        />
                    ))}
                </div>
            ) : (
                status === AppStatus.COMPLETED && (
                    <div className="text-center py-20 text-slate-400">
                        No cards in this deck.
                    </div>
                )
            )}
        </div>
      );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Global Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={handleBackToDashboard}>
            <div className="bg-indigo-600 p-2 rounded-lg shadow-sm">
               <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 hidden sm:block">
              FlashCardAI
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
             {status !== AppStatus.STUDY && status !== AppStatus.REVIEW && (
                <>
                 <div className="flex items-center bg-slate-100 rounded-lg px-2 border border-slate-200">
                    <BrainCircuit size={16} className="text-slate-500 ml-1" />
                    <select 
                        value={aiConfig.provider === 'openai' || !MODEL_PRESETS.some(p => p.value === aiConfig.modelName) ? 'custom-config' : aiConfig.modelName}
                        onChange={handleModelSelectChange}
                        className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 py-1.5 pl-2 pr-8 cursor-pointer outline-none w-40"
                    >
                        {MODEL_PRESETS.map(preset => (
                            <option key={preset.value} value={preset.value}>{preset.label}</option>
                        ))}
                        <option value="custom-config">External / Custom...</option>
                    </select>
                 </div>
                 
                 <button 
                     onClick={() => setIsToolsOpen(true)}
                     className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                     title="PDF Tools"
                 >
                     <Wrench size={20} />
                 </button>

                 <button 
                     onClick={() => setIsSettingsOpen(true)}
                     className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                     title="AI Settings"
                 >
                     <Settings size={20} />
                 </button>

                 <div className="flex items-center bg-slate-100 rounded-lg px-2 border border-slate-200">
                    <Globe size={16} className="text-slate-500 ml-1" />
                    <select 
                        value={targetLanguage} 
                        onChange={(e) => setTargetLanguage(e.target.value)}
                        className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 py-1.5 pl-2 pr-8 cursor-pointer outline-none"
                    >
                        <option value="French">Français</option>
                        <option value="English">English</option>
                        <option value="Spanish">Español</option>
                        <option value="German">Deutsch</option>
                    </select>
                 </div>
                </>
             )}

             <button
               onClick={handleApiKeyChange}
               className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-200"
               title="Configure Gemini API Key"
             >
                <Key size={16} /> <span className="hidden sm:inline">Google Key</span>
             </button>
          </div>
        </div>
      </header>

      <main>
        {status === AppStatus.STUDY ? (
             <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
                <div className="flex items-center justify-between mb-8">
                     <button 
                        onClick={() => setStatus(AppStatus.COMPLETED)}
                        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium"
                     >
                        <ArrowLeft size={20} /> Stop Session
                     </button>
                     <div className="text-slate-500 font-medium">
                        Card {currentStudyIndex + 1} of {studyQueue.length}
                     </div>
                </div>

                <div className="max-w-3xl mx-auto">
                    {studyQueue[currentStudyIndex] && (
                        <StudyCard 
                            data={studyQueue[currentStudyIndex]} 
                            onRate={handleRateCard} 
                        />
                    )}
                </div>
            </div>
        ) : status === AppStatus.REVIEW ? (
            renderReviewScreen()
        ) : activeDeckId ? (
            renderActiveDeck()
        ) : (
            renderDashboard()
        )}
      </main>

      {/* Settings Modal */}
      <AISettingsModal />
      
      {/* Tools Modal */}
      <ToolsModal />

      {/* Recovery Modal */}
      <RecoveryModal />
      
      {/* Confirm Dialog */}
      <ConfirmDialog />

      {/* Editor Modal */}
      <CardEditor 
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        initialData={activeCardToEdit}
        onSave={handleSaveCard}
      />
    </div>
  );
}
