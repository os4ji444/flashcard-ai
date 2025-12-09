
import { Deck, User, FlashcardData } from '../types';

// Helper to simulate network delay for realistic feel
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Constants ---
const STORAGE_KEY_USERS = 'flashcard-ai-users';
const DEMO_USER: User = {
  id: 'user-demo-global',
  email: 'demo@flashcard.ai',
  name: 'Demo User'
};
const DEMO_PASS = 'demo123';

const SAMPLE_CARD: FlashcardData = {
  id: 'card-sample-1',
  imageId: 'img-sample-1',
  imageSrc: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400', 
  name: 'Stethoscope',
  description: 'A medical instrument for listening to the action of someone\'s heart or breathing. It consists of a small disc-shaped resonator that is placed against the chest, and two tubes connected to earpieces.',
  status: 'completed',
  contextText: 'The physician used a stethoscope to auscultate the patient chest.',
  interval: 0,
  ease: 2.5,
  reps: 0,
  nextReview: Date.now()
};

const DEMO_DECK: Deck = {
  id: 'deck-demo-1',
  title: 'Medical Instruments (Sample)',
  createdAt: Date.now(),
  cards: [SAMPLE_CARD]
};

// --- User Management (Simulated Database) ---

export const getStoredUsers = (): any[] => {
  const users = localStorage.getItem(STORAGE_KEY_USERS);
  return users ? JSON.parse(users) : [];
};

export const registerUser = async (email: string, password: string, name: string): Promise<User> => {
  await delay(800); 
  const users = getStoredUsers();
  
  if (users.find((u: any) => u.email === email)) {
    throw new Error("Email already exists");
  }

  const newUser = {
    id: `user-${Date.now()}`,
    email,
    password, 
    name
  };

  users.push(newUser);
  localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
  
  const { password: _, ...safeUser } = newUser;
  return safeUser;
};

export const loginUser = async (email: string, password: string): Promise<User> => {
  await delay(800); 
  
  // 1. Check for Hardcoded Demo User (Works on ANY device)
  if (email.toLowerCase() === DEMO_USER.email && password === DEMO_PASS) {
      // Ensure demo user exists in local storage for consistency
      const users = getStoredUsers();
      if (!users.find((u: any) => u.id === DEMO_USER.id)) {
          users.push({ ...DEMO_USER, password: DEMO_PASS });
          localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
      }
      return DEMO_USER;
  }

  // 2. Check Local Storage
  const users = getStoredUsers();
  const user = users.find((u: any) => u.email === email && u.password === password);

  if (!user) {
    throw new Error("Invalid email or password. (Note: Accounts are local to this device unless you use the Demo account)");
  }

  const { password: _, ...safeUser } = user;
  return safeUser;
};

// --- Data Persistence (Scoped to User) ---

export const getUserDecks = (userId: string): Deck[] => {
  const key = `flashcard-ai-decks-${userId}`;
  const data = localStorage.getItem(key);
  
  // If it's the demo user and no data exists yet, seed it!
  if (!data && userId === DEMO_USER.id) {
      const seedData = [DEMO_DECK];
      localStorage.setItem(key, JSON.stringify(seedData));
      return seedData;
  }

  return data ? JSON.parse(data) : [];
};

export const saveUserDecks = (userId: string, decks: Deck[]) => {
  localStorage.setItem(`flashcard-ai-decks-${userId}`, JSON.stringify(decks));
};

// --- Export / Import (Manual Cloud Sync) ---

export const generateBackup = (userId: string): string => {
    const decks = getUserDecks(userId);
    const backup = {
        version: 1,
        timestamp: new Date().toISOString(),
        userId: userId,
        decks: decks
    };
    return JSON.stringify(backup, null, 2);
};

export const restoreBackup = (userId: string, jsonContent: string): Deck[] => {
    try {
        const backup = JSON.parse(jsonContent);
        if (!backup.decks || !Array.isArray(backup.decks)) {
            throw new Error("Invalid backup file format");
        }
        saveUserDecks(userId, backup.decks);
        return backup.decks;
    } catch (e: any) {
        throw new Error(e.message || "Failed to restore backup");
    }
};
