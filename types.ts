
export interface ExtractedImage {
  id: string;
  dataUrl: string; // Base64 or Blob URL
  pageIndex: number;
  contextText: string; // Text extracted from the page containing the image
}

export interface FlashcardData {
  id: string;
  imageId: string;
  imageSrc: string;
  name: string;
  description: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  contextText?: string;
  
  // Spaced Repetition System (SRS) fields
  nextReview?: number; // Timestamp for next review
  interval?: number;   // Current interval in days
  ease?: number;       // Ease factor (default 2.5)
  reps?: number;       // Number of successful repetitions
}

export interface Deck {
  id: string;
  title: string;
  createdAt: number;
  cards: FlashcardData[];
  ignoredImages?: ExtractedImage[];
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AIConfig {
  provider: 'google' | 'openai';
  modelName: string;
  apiKey: string;
  baseUrl: string;
  nickname?: string;
  useProxy?: boolean; // New field for CORS proxy
}

export enum AppStatus {
  AUTH = 'AUTH', // Login/Signup screen
  IDLE = 'IDLE', // Dashboard view
  EXTRACTING = 'EXTRACTING',
  REVIEW = 'REVIEW', // User selects valid images
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED', // Deck View
  STUDY = 'STUDY',
  ERROR = 'ERROR'
}

export interface ProcessingStats {
  totalImages: number;
  processedImages: number;
}
