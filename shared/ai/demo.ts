import type { AnalyzeResult } from './types';

export function makeDemoResult(): AnalyzeResult {
  return {
    objectName: 'Perceuse-visseuse sans fil',
    brand: 'Bosch Professional',
    model: 'GSR 18V-55',
    reference: 'GSR 18V-55',
    category: 'Bricolage',
    condition: 'Très bon état visuel',
    confidence: 0.94,
    priceConfidence: 0.82,
    detectedText: ['BOSCH PROFESSIONAL', 'GSR 18V-55', '18V'],
    visibleDetails: ['Format 18 V', 'Mandrin autoserrant', 'Coffret de transport visible'],
    defects: ['Légères traces d’usage sur le carter'],
    identificationWarnings: ['La capacité des batteries n’est pas lisible sur la photo de démonstration.'],
    keywords: ['Bosch', 'GSR 18V-55', '18V', 'perceuse', 'visseuse', 'Professional'],
    quickSalePrice: 85,
    suggestedPrice: 109,
    negotiationFloor: 95,
    estimatedLow: 80,
    estimatedHigh: 125,
    demand: 'forte',
    saleSpeedDaysLow: 2,
    saleSpeedDaysHigh: 10,
    marketBasis: 'Démonstration locale : estimation simulée pour tester l’interface, sans recherche web réelle.',
    comparables: [
      { label: 'GSR 18V-55 avec coffret', price: 105, condition: 'Bon état', source: 'Démo' },
      { label: 'GSR 18V-55 + batterie', price: 120, condition: 'Très bon état', source: 'Démo' },
      { label: 'GSR 18V-55 nue', price: 82, condition: 'Bon état', source: 'Démo' },
    ],
    title: 'Bosch Professional GSR 18V-55 – très bon état',
    description: 'Perceuse-visseuse Bosch Professional GSR 18V-55 en très bon état visuel. Quelques légères traces d’utilisation visibles sur le carter. Coffret inclus tel que visible sur les photos. Fonctionnement à confirmer avec l’acheteur si aucun test n’a été indiqué. Remise en main propre ou envoi selon accord. Prix raisonnablement négociable.',
    sellerTips: ['Photographier clairement les batteries et leur capacité Ah.', 'Ajouter une photo du mandrin ouvert.', 'Préciser si chargeur et batteries sont inclus.'],
    platformAdvice: [
      { name: 'Leboncoin', score: 95, reason: 'Très adapté au bricolage et à la remise en main propre.' },
      { name: 'Facebook Marketplace', score: 82, reason: 'Bon pour une vente locale rapide.' },
      { name: 'eBay', score: 70, reason: 'Intéressant si l’envoi est simple et la référence recherchée.' },
    ],
    shippingAdvice: 'Expédition possible si l’outil est correctement calé. Pour une batterie lithium, vérifier les règles du transporteur choisi.',
    sources: [],
    mode: 'demo',
  };
}
