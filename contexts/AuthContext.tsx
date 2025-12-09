
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { loginUser, registerUser } from '../services/storageService';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  signup: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for active session
    const savedSession = localStorage.getItem('flashcard-ai-session');
    if (savedSession) {
      setUser(JSON.parse(savedSession));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, pass: string) => {
    const user = await loginUser(email, pass);
    setUser(user);
    localStorage.setItem('flashcard-ai-session', JSON.stringify(user));
  };

  const signup = async (email: string, pass: string, name: string) => {
    const user = await registerUser(email, pass, name);
    setUser(user);
    localStorage.setItem('flashcard-ai-session', JSON.stringify(user));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('flashcard-ai-session');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
