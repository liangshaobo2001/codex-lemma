import { create } from 'zustand';

/** Which settings section to show when the settings view opens, so other views can deep-link into it. */
export const useSettingsNavStore = create<{
  section: string | null;
  openSection: (section: string) => void;
  consume: () => string | null;
}>((set, get) => ({
  section: null,
  openSection: (section) => set({ section }),
  consume: () => {
    const { section } = get();
    if (section) set({ section: null });
    return section;
  },
}));
