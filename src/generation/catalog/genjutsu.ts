import type { ModelEntry } from './types';
const shared={surface:'video',roles:{reference:8,video:1},settings:{resolution:{type:'enum',values:['480p','720p'],default:'720p'}}} as const;
export const genjutsuMotion:ModelEntry={...shared,id:'genjutsu-motion',label:'Genjutsu Motion Transfer'};
export const genjutsuSwap:ModelEntry={...shared,id:'genjutsu-swap',label:'Genjutsu Object Swap'};
