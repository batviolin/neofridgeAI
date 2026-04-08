export interface InventoryItem {
  name: string;
  qty: number;
}

export interface FridgeState {
  temperature: number;
  inventory: InventoryItem[];
}

export type FridgeAction = 
  | { type: 'SET_TEMP'; payload: number }
  | { type: 'ADD_ITEM'; payload: { name: string; qty: number } }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QTY'; payload: { name: string; delta: number } };
