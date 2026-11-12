export interface Narration {
  src: string;
  voice: string;
  duration: number;
  sections: { text: string; start: number }[];
}

export const normalizeNarrationText = (text: string) => text.replace(/\s+/g, ' ').trim();
