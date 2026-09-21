import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SavedSale } from './types';

const KEY = 'vends-moi-ca-v3-sales';
const OLD_KEY = 'vends-moi-ca-v2-sales';

export async function loadSales(): Promise<SavedSale[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);

    // Migration douce depuis la V2 : les anciennes estimations deviennent des brouillons.
    const old = await AsyncStorage.getItem(OLD_KEY);
    if (!old) return [];
    const parsed = JSON.parse(old) as any[];
    const migrated: SavedSale[] = parsed.map((x) => ({
      ...x,
      reference: x.reference ?? x.model ?? '',
      priceConfidence: x.priceConfidence ?? 0.5,
      detectedText: x.detectedText ?? [],
      identificationWarnings: x.identificationWarnings ?? [],
      negotiationFloor: x.negotiationFloor ?? Math.round((x.suggestedPrice ?? 0) * 0.9),
      demand: x.demand ?? 'moyenne',
      saleSpeedDaysLow: x.saleSpeedDaysLow ?? 3,
      saleSpeedDaysHigh: x.saleSpeedDaysHigh ?? 21,
      comparables: x.comparables ?? [],
      sellerTips: x.sellerTips ?? [],
      platformAdvice: x.platformAdvice ?? (x.platforms ?? []).map((name: string) => ({ name, score: 70, reason: 'Importé depuis la V2' })),
      shippingAdvice: x.shippingAdvice ?? '',
      updatedAt: x.createdAt ?? new Date().toISOString(),
      status: 'draft',
      askingPrice: x.suggestedPrice ?? 0,
    }));
    await saveSales(migrated);
    return migrated;
  } catch {
    return [];
  }
}

export async function saveSales(items: SavedSale[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}
