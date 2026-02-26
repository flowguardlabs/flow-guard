import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppMode = 'user' | 'dao';

interface AppModeState {
    mode: AppMode;
    setMode: (mode: AppMode) => void;
    toggleMode: () => void;
}

export const useAppMode = create<AppModeState>()(
    persist(
        (set) => ({
            mode: 'user',
            setMode: (mode) => set({ mode }),
            toggleMode: () => set((state) => ({ mode: state.mode === 'user' ? 'dao' : 'user' })),
        }),
        {
            name: 'flowguard-app-mode',
        }
    )
);
