import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { loadSales, saveSales } from './src/storage';
import { runAnalysis } from './src/analyze';
import SettingsScreen from './src/SettingsScreen';
import {
  loadApiKey,
  loadSettings,
  resolvedModel,
  saveSettings,
  type AppSettings,
} from './src/settings';
import { getAdapter } from '../shared/ai';
import type { AnalyzeResult, PlatformAdvice, SaleStatus, SavedSale } from './src/types';

type Screen = 'home' | 'sell' | 'sales' | 'settings';
type PhotoRole = 'general' | 'label' | 'accessories' | 'defect';
type Photo = { role: PhotoRole; uri: string; dataUrl: string };

type PhotoSlot = {
  role: PhotoRole;
  icon: string;
  title: string;
  subtitle: string;
  required?: boolean;
};

const euro = (n?: number) => `${Math.round(Number(n || 0))} €`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

const PHOTO_SLOTS: PhotoSlot[] = [
  { role: 'general', icon: '📦', title: 'Vue générale', subtitle: 'Objet entier, bien éclairé', required: true },
  { role: 'label', icon: '🔎', title: 'Étiquette / référence', subtitle: 'Marque, modèle, code, taille…' },
  { role: 'accessories', icon: '🧩', title: 'Accessoires', subtitle: 'Chargeur, boîte, pièces incluses' },
  { role: 'defect', icon: '🩹', title: 'Défaut éventuel', subtitle: 'Rayure, choc, usure, manque…' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState('');
  const [knownReference, setKnownReference] = useState('');
  const [locationHint, setLocationHint] = useState('France');
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [askingPrice, setAskingPrice] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [sales, setSales] = useState<SavedSale[]>([]);
  const [salesFilter, setSalesFilter] = useState<'all' | SaleStatus>('all');
  const [editingSale, setEditingSale] = useState<SavedSale | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => { loadSales().then(setSales); }, []);

  // Réglages : chargés au démarrage, réécrits à chaque modification.
  useEffect(() => {
    loadSettings().then((loaded) => {
      setSettings(loaded);
      setLocationHint(loaded.defaultLocation || 'France');
    });
  }, []);

  useEffect(() => {
    if (!settings) return;
    saveSettings(settings).catch(() => undefined);
    loadApiKey(settings.provider).then((key) => setHasKey(!!key));
  }, [settings]);

  useEffect(() => {
    if (!loading) { setLoadingStep(0); return; }
    const timer = setInterval(() => setLoadingStep((x) => Math.min(x + 1, 3)), 1900);
    return () => clearInterval(timer);
  }, [loading]);

  // L'analyse réelle est possible si le mode configuré dispose de ce qu'il lui faut.
  const providerInfo = settings ? getAdapter(settings.provider).info : null;
  const apiReady = !settings
    ? false
    : settings.mode === 'direct'
      ? hasKey
      : settings.mode === 'backend'
        ? !!settings.backendUrl
        : false;
  const stats = useMemo(() => {
    const draft = sales.filter((x) => x.status === 'draft').length;
    const listed = sales.filter((x) => x.status === 'listed').length;
    const sold = sales.filter((x) => x.status === 'sold').length;
    const potential = sales.filter((x) => x.status !== 'sold').reduce((sum, x) => sum + Number(x.askingPrice || 0), 0);
    const revenue = sales.filter((x) => x.status === 'sold').reduce((sum, x) => sum + Number(x.soldPrice ?? x.askingPrice ?? 0), 0);
    return { draft, listed, sold, potential, revenue };
  }, [sales]);

  const filteredSales = useMemo(
    () => salesFilter === 'all' ? sales : sales.filter((x) => x.status === salesFilter),
    [sales, salesFilter]
  );

  function photoFor(role: PhotoRole) { return photos.find((x) => x.role === role); }

  function choosePhotoSource(role: PhotoRole) {
    Alert.alert('Ajouter une photo', PHOTO_SLOTS.find((x) => x.role === role)?.title, [
      { text: 'Appareil photo', onPress: () => addPhoto(role, 'camera') },
      { text: 'Galerie', onPress: () => addPhoto(role, 'library') },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  async function addPhoto(role: PhotoRole, source: 'camera' | 'library') {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return Alert.alert('Autorisation requise', 'Autorise l’appareil photo pour photographier l’objet.');
      }
    }

    const fn = source === 'camera' ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const res = await fn({ mediaTypes: ['images'], allowsEditing: false, quality: 0.5, base64: true });
    if (res.canceled || !res.assets[0]?.uri || !res.assets[0]?.base64) return;

    const asset = res.assets[0];
    const mime = asset.mimeType || 'image/jpeg';
    const nextPhoto: Photo = { role, uri: asset.uri, dataUrl: `data:${mime};base64,${asset.base64}` };
    setPhotos((current) => [...current.filter((x) => x.role !== role), nextPhoto]);
    setResult(null);
  }

  function removePhoto(role: PhotoRole) {
    setPhotos((current) => current.filter((x) => x.role !== role));
    setResult(null);
  }

  async function analyze(demo = false) {
    if (!settings) return;
    if (!demo && !photoFor('general')) {
      return Alert.alert('Vue générale nécessaire', 'Ajoute au minimum une photo générale de l’objet.');
    }
    if (!demo && !apiReady) {
      return Alert.alert(
        'IA non configurée',
        settings.mode === 'backend'
          ? 'Renseigne l’URL du backend dans Réglages.'
          : 'Ouvre Réglages pour choisir un fournisseur et saisir ta clé API, ou lance le mode Démo.',
        [
          { text: 'Ouvrir Réglages', onPress: () => setScreen('settings') },
          { text: 'Annuler', style: 'cancel' },
        ],
      );
    }

    setLoading(true);
    setResult(null);
    try {
      const data = await runAnalysis(
        {
          imagesDataUrl: photos.map((x) => x.dataUrl),
          notes,
          knownReference,
          locationHint,
        },
        settings,
        { forceDemo: demo },
      );
      setResult(data);
      setAskingPrice(data.suggestedPrice);
    } catch (error: any) {
      Alert.alert('Analyse impossible', error?.message || 'Vérifie la configuration dans Réglages.');
    } finally {
      setLoading(false);
    }
  }

  function patchResult(patch: Partial<AnalyzeResult>) {
    setResult((current) => current ? { ...current, ...patch } : current);
  }

  async function saveResult(status: SaleStatus) {
    if (!result) return;
    const now = new Date().toISOString();
    const item: SavedSale = {
      ...result,
      id: String(Date.now()),
      createdAt: now,
      updatedAt: now,
      photoUri: photoFor('general')?.uri,
      status,
      askingPrice: askingPrice || result.suggestedPrice,
      listedAt: status === 'listed' ? now : undefined,
    };
    const next = [item, ...sales];
    setSales(next);
    await saveSales(next);
    Alert.alert(status === 'listed' ? 'Mis en vente' : 'Brouillon enregistré', status === 'listed' ? 'L’objet est ajouté à tes ventes en ligne.' : 'Tu pourras reprendre cette annonce depuis Mes ventes.');
    setScreen('sales');
  }

  async function updateSale(updated: SavedSale) {
    const next = sales.map((x) => x.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : x);
    setSales(next);
    await saveSales(next);
    setEditingSale(null);
  }

  async function removeSale(id: string) {
    Alert.alert('Supprimer cette vente ?', 'Cette action supprime uniquement l’enregistrement dans l’app.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          const next = sales.filter((x) => x.id !== id);
          setSales(next);
          await saveSales(next);
        }
      }
    ]);
  }

  function resetSell() {
    setPhotos([]);
    setNotes('');
    setKnownReference('');
    setResult(null);
    setAskingPrice(0);
  }

  function startSelling() {
    resetSell();
    setScreen('sell');
  }

  async function shareListing(item: AnalyzeResult, price = item.suggestedPrice) {
    await Share.share({
      message: `${item.title}\n\n${item.description}\n\nPrix : ${euro(price)}`,
    });
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <View>
            <Text style={s.logo}>Vends-moi ça</Text>
            <Text style={s.tag}>Photo → vrai prix → annonce</Text>
          </View>
          <View style={s.badge}><Text style={s.badgeText}>V3</Text></View>
        </View>

        <View style={s.tabs}>
          <Tab active={screen === 'home'} icon="⌂" label="Accueil" onPress={() => setScreen('home')} />
          <Tab active={screen === 'sell'} icon="＋" label="Vendre" onPress={() => setScreen('sell')} />
          <Tab active={screen === 'sales'} icon="☷" label="Mes ventes" onPress={() => setScreen('sales')} />
          <Tab active={screen === 'settings'} icon="⚙" label="Réglages" onPress={() => setScreen('settings')} />
        </View>

        {screen === 'home' && (
          <HomeScreen sales={sales} stats={stats} onSell={startSelling} onOpenSales={() => setScreen('sales')} onEdit={setEditingSale} />
        )}

        {screen === 'sell' && (
          <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <View style={s.heroSell}>
              <Text style={s.kicker}>NOUVEL OBJET</Text>
              <Text style={s.heroTitle}>4 photos. Un prix. Une annonce.</Text>
              <Text style={s.muted}>Une seule photo suffit. Les vues supplémentaires augmentent la fiabilité de l’identification et du prix.</Text>
            </View>

            <SectionTitle number="1" title="Photographie l’objet" />
            <View style={s.slotGrid}>
              {PHOTO_SLOTS.map((slot) => (
                <PhotoSlotCard
                  key={slot.role}
                  slot={slot}
                  photo={photoFor(slot.role)}
                  onPress={() => choosePhotoSource(slot.role)}
                  onRemove={() => removePhoto(slot.role)}
                />
              ))}
            </View>
            <View style={s.tipBox}>
              <Text style={s.tipTitle}>💡 Pour une meilleure estimation</Text>
              <Text style={s.tipText}>Cadre serré, bonne lumière, référence lisible et accessoires visibles. Photographier un défaut est préférable à le cacher : l’annonce sera plus crédible.</Text>
            </View>

            <SectionTitle number="2" title="Ajoute ce que la photo ne dit pas" />
            <Text style={s.fieldLabel}>Référence connue — optionnel</Text>
            <TextInput
              value={knownReference}
              onChangeText={setKnownReference}
              placeholder="Ex. iPhone 15 Pro 256 Go, Dyson V11 Absolute…"
              placeholderTextColor="#9A978E"
              style={s.singleInput}
            />
            <Text style={s.fieldLabel}>Précisions</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Ex. fonctionne parfaitement, acheté en 2024, chargeur inclus, batterie faible, petite rayure…"
              placeholderTextColor="#9A978E"
              style={s.input}
            />
            <Text style={s.fieldLabel}>Zone de vente</Text>
            <TextInput
              value={locationHint}
              onChangeText={setLocationHint}
              placeholder="France"
              placeholderTextColor="#9A978E"
              style={s.singleInput}
            />

            <Pressable style={s.apiState} onPress={() => setScreen('settings')}>
              <Text style={s.apiStateTitle}>
                {apiReady
                  ? `● ${settings?.mode === 'backend' ? 'Backend' : providerInfo?.label} — ${settings ? resolvedModel(settings) : ''}`
                  : '○ IA non configurée'}
              </Text>
              <Text style={s.apiStateText}>
                {apiReady
                  ? `Identification visuelle${settings?.webSearch && providerInfo?.supportsWebSearch ? ' + recherche de comparables récents' : ' (sans recherche web)'}. Appuie pour changer.`
                  : 'Appuie ici pour choisir un fournisseur et saisir ta clé API. Le mode Démo reste disponible.'}
              </Text>
            </Pressable>

            <Pressable style={[s.primary, loading && { opacity: 0.6 }]} disabled={loading} onPress={() => analyze(false)}>
              {loading ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>Estimer cet objet</Text>}
            </Pressable>
            <Pressable style={s.demo} disabled={loading} onPress={() => analyze(true)}>
              <Text style={s.demoText}>Tester la V3 en mode Démo</Text>
            </Pressable>

            {loading && <AnalysisProgress step={loadingStep} />}

            {result && (
              <ResultCard
                result={result}
                askingPrice={askingPrice}
                onPriceChange={setAskingPrice}
                onPatch={patchResult}
                onShare={() => shareListing(result, askingPrice)}
                onSaveDraft={() => saveResult('draft')}
                onSaveListed={() => saveResult('listed')}
                onReset={resetSell}
              />
            )}
          </ScrollView>
        )}

        {screen === 'sales' && (
          <ScrollView contentContainerStyle={s.content}>
            <View style={s.salesHeadingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.kicker}>SUIVI</Text>
                <Text style={s.heroTitle}>Mes ventes</Text>
              </View>
              <Pressable style={s.smallPrimary} onPress={startSelling}><Text style={s.smallPrimaryText}>＋ Vendre</Text></Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              <FilterChip active={salesFilter === 'all'} label={`Toutes ${sales.length}`} onPress={() => setSalesFilter('all')} />
              <FilterChip active={salesFilter === 'draft'} label={`Brouillons ${stats.draft}`} onPress={() => setSalesFilter('draft')} />
              <FilterChip active={salesFilter === 'listed'} label={`En ligne ${stats.listed}`} onPress={() => setSalesFilter('listed')} />
              <FilterChip active={salesFilter === 'sold'} label={`Vendues ${stats.sold}`} onPress={() => setSalesFilter('sold')} />
            </ScrollView>

            {!filteredSales.length ? (
              <View style={s.empty}>
                <Text style={{ fontSize: 42 }}>🏷️</Text>
                <Text style={s.emptyTitle}>Rien ici pour le moment</Text>
                <Text style={s.muted}>Photographie ton premier objet et laisse l’app préparer son estimation.</Text>
                <Pressable style={s.primaryInline} onPress={startSelling}><Text style={s.primaryText}>Vendre un objet</Text></Pressable>
              </View>
            ) : filteredSales.map((item) => (
              <SaleCard key={item.id} item={item} onShare={() => shareListing(item, item.askingPrice)} onEdit={() => setEditingSale(item)} onDelete={() => removeSale(item.id)} />
            ))}
          </ScrollView>
        )}
        {screen === 'settings' && settings && (
          <SettingsScreen settings={settings} onChange={setSettings} />
        )}
      </KeyboardAvoidingView>

      <SaleEditorModal sale={editingSale} onClose={() => setEditingSale(null)} onSave={updateSale} />
    </SafeAreaView>
  );
}

function HomeScreen({ sales, stats, onSell, onOpenSales, onEdit }: {
  sales: SavedSale[];
  stats: { draft: number; listed: number; sold: number; potential: number; revenue: number };
  onSell: () => void;
  onOpenSales: () => void;
  onEdit: (sale: SavedSale) => void;
}) {
  const recent = sales.slice(0, 3);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.homeHero}>
        <Text style={s.kickerLight}>VENDS CE QUI DORT CHEZ TOI</Text>
        <Text style={s.homeHeroTitle}>Une photo suffit pour savoir combien demander.</Text>
        <Text style={s.homeHeroBody}>L’IA identifie, cherche le marché d’occasion, estime un prix réaliste et écrit l’annonce.</Text>
        <Pressable style={s.heroButton} onPress={onSell}><Text style={s.heroButtonText}>📷 Photographier un objet</Text></Pressable>
      </View>

      <Text style={s.sectionMainTitle}>Ton tableau de bord</Text>
      <View style={s.moneyGrid}>
        <MetricCard label="À récupérer" value={euro(stats.potential)} subtitle={`${stats.draft + stats.listed} objet(s) non vendu(s)`} />
        <MetricCard label="Déjà vendu" value={euro(stats.revenue)} subtitle={`${stats.sold} vente(s)`} />
      </View>
      <View style={s.miniStats}>
        <MiniStat value={stats.draft} label="Brouillons" />
        <MiniStat value={stats.listed} label="En ligne" />
        <MiniStat value={stats.sold} label="Vendues" />
      </View>

      <View style={s.sectionRow}>
        <Text style={s.sectionMainTitle}>Derniers objets</Text>
        {!!sales.length && <Pressable onPress={onOpenSales}><Text style={s.textLink}>Tout voir</Text></Pressable>}
      </View>

      {!recent.length ? (
        <Pressable style={s.quickStart} onPress={onSell}>
          <Text style={s.quickStartIcon}>📦</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.quickStartTitle}>Ton premier objet est à 30 secondes</Text>
            <Text style={s.muted}>Prends une photo, l’app s’occupe du reste.</Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </Pressable>
      ) : recent.map((item) => <CompactSale key={item.id} item={item} onPress={() => onEdit(item)} />)}
    </ScrollView>
  );
}

function ResultCard({ result, askingPrice, onPriceChange, onPatch, onShare, onSaveDraft, onSaveListed, onReset }: {
  result: AnalyzeResult;
  askingPrice: number;
  onPriceChange: (value: number) => void;
  onPatch: (patch: Partial<AnalyzeResult>) => void;
  onShare: () => void;
  onSaveDraft: () => void;
  onSaveListed: () => void;
  onReset: () => void;
}) {
  const identity = [result.brand, result.model || result.reference].filter(Boolean).join(' · ') || result.objectName;
  return (
    <View style={s.result}>
      <View style={s.resultHead}>
        <View>
          <Text style={s.kicker}>{result.mode === 'demo' ? 'MODE DÉMO' : `ANALYSE — ${(result.usedModel || result.provider || '').toUpperCase()}`}</Text>
          <Text style={s.resultTitle}>{result.objectName}</Text>
          <Text style={s.identity}>{identity}</Text>
        </View>
        <View style={s.confBubble}>
          <Text style={s.confValue}>{pct(result.confidence)}</Text>
          <Text style={s.confLabel}>ID</Text>
        </View>
      </View>

      {!!result.identificationWarnings.length && (
        <View style={s.warningBox}>
          <Text style={s.warningTitle}>À vérifier</Text>
          {result.identificationWarnings.map((x, i) => <Text key={`${x}-${i}`} style={s.warningText}>• {x}</Text>)}
        </View>
      )}

      <Text style={s.sectionLabel}>Stratégie de prix</Text>
      <Text style={s.helper}>Touchez un prix pour l’utiliser dans l’annonce.</Text>
      <View style={s.prices}>
        <PriceChoice label="Vente rapide" value={result.quickSalePrice} selected={askingPrice === result.quickSalePrice} onPress={() => onPriceChange(result.quickSalePrice)} />
        <PriceChoice label="Conseillé" value={result.suggestedPrice} selected={askingPrice === result.suggestedPrice} hot onPress={() => onPriceChange(result.suggestedPrice)} />
        <PriceChoice label="Prix haut" value={result.estimatedHigh} selected={askingPrice === result.estimatedHigh} onPress={() => onPriceChange(result.estimatedHigh)} />
      </View>
      <View style={s.marketMeta}>
        <Text style={s.marketMetaText}>Plancher négo : <Text style={s.bold}>{euro(result.negotiationFloor)}</Text></Text>
        <Text style={s.marketMetaText}>Confiance prix : <Text style={s.bold}>{pct(result.priceConfidence)}</Text></Text>
      </View>
      <View style={s.demandRow}>
        <View style={s.demandPill}><Text style={s.demandText}>Demande {result.demand}</Text></View>
        <Text style={s.speedText}>Vente estimée : {result.saleSpeedDaysLow}–{result.saleSpeedDaysHigh} jours</Text>
      </View>

      <Text style={s.sectionLabel}>Pourquoi ce prix ?</Text>
      <Text style={s.body}>{result.marketBasis}</Text>

      {!!result.comparables.length && (
        <>
          <Text style={s.sectionLabel}>Comparables repérés</Text>
          {result.comparables.slice(0, 5).map((c, i) => (
            <View key={`${c.label}-${i}`} style={s.comparableRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.comparableTitle}>{c.label}</Text>
                <Text style={s.comparableMeta}>{c.condition} · {c.source}</Text>
              </View>
              <Text style={s.comparablePrice}>{euro(c.price)}</Text>
            </View>
          ))}
        </>
      )}

      {!!result.detectedText.length && (
        <>
          <Text style={s.sectionLabel}>Texte / référence lus sur les photos</Text>
          <View style={s.chips}>{result.detectedText.slice(0, 8).map((x) => <Chip key={x} text={x} />)}</View>
        </>
      )}

      {!!result.defects.length && (
        <>
          <Text style={s.sectionLabel}>État visible</Text>
          {result.defects.map((x, i) => <Text key={`${x}-${i}`} style={s.bullet}>• {x}</Text>)}
        </>
      )}

      <Text style={s.sectionLabel}>Annonce prête à publier</Text>
      <Text style={s.fieldLabel}>Titre</Text>
      <TextInput value={result.title} onChangeText={(title) => onPatch({ title })} style={s.singleInput} />
      <Text style={s.fieldLabel}>Description</Text>
      <TextInput value={result.description} onChangeText={(description) => onPatch({ description })} multiline style={s.descriptionInput} />
      <Text style={s.fieldLabel}>Prix affiché</Text>
      <View style={s.priceEditorRow}>
        <TextInput
          value={String(Math.round(askingPrice))}
          onChangeText={(x) => onPriceChange(Number(x.replace(/[^0-9]/g, '')) || 0)}
          keyboardType="numeric"
          style={s.priceInput}
        />
        <Text style={s.priceCurrency}>€</Text>
      </View>

      {!!result.sellerTips.length && (
        <>
          <Text style={s.sectionLabel}>Pour mieux vendre</Text>
          <View style={s.tipsList}>{result.sellerTips.map((x, i) => <Text key={`${x}-${i}`} style={s.bullet}>✓ {x}</Text>)}</View>
        </>
      )}

      <Text style={s.sectionLabel}>Où la vendre ?</Text>
      {result.platformAdvice.map((p) => <PlatformRow key={p.name} advice={p} query={result.keywords.join(' ') || result.title} />)}

      {!!result.shippingAdvice && (
        <View style={s.shippingBox}>
          <Text style={s.shippingTitle}>📦 Remise / expédition</Text>
          <Text style={s.body}>{result.shippingAdvice}</Text>
        </View>
      )}

      {!!result.sources?.length && (
        <>
          <Text style={s.sectionLabel}>Sources marché</Text>
          {result.sources.slice(0, 6).map((src, i) => (
            <Pressable key={`${src.url}-${i}`} onPress={() => Linking.openURL(src.url)}>
              <Text style={s.sourceLink}>↗ {src.title}</Text>
            </Pressable>
          ))}
        </>
      )}

      <Pressable style={s.primary} onPress={onSaveListed}><Text style={s.primaryText}>Enregistrer comme « en ligne »</Text></Pressable>
      <View style={s.row}>
        <Button text="Brouillon" onPress={onSaveDraft} />
        <Button text="Partager" onPress={onShare} />
      </View>
      <Pressable onPress={onReset}><Text style={s.reset}>＋ Estimer un autre objet</Text></Pressable>
    </View>
  );
}

function SaleCard({ item, onShare, onEdit, onDelete }: { item: SavedSale; onShare: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={s.savedCard}>
      <View style={s.savedTop}>
        {item.photoUri ? <Image source={{ uri: item.photoUri }} style={s.thumb} /> : <View style={[s.thumb, s.thumbFallback]}><Text style={{ fontSize: 28 }}>📦</Text></View>}
        <View style={{ flex: 1 }}>
          <View style={s.statusLine}><StatusPill status={item.status} /></View>
          <Text style={s.savedTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={s.savedPrice}>{euro(item.status === 'sold' ? (item.soldPrice ?? item.askingPrice) : item.askingPrice)}</Text>
          <Text style={s.savedMeta}>{[item.brand, item.model].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <View style={s.row}>
        <Button text="Modifier" onPress={onEdit} />
        <Button text="Partager" onPress={onShare} />
      </View>
      <Pressable onPress={onDelete}><Text style={s.deleteLink}>Supprimer</Text></Pressable>
    </View>
  );
}

function CompactSale({ item, onPress }: { item: SavedSale; onPress: () => void }) {
  return (
    <Pressable style={s.compactSale} onPress={onPress}>
      {item.photoUri ? <Image source={{ uri: item.photoUri }} style={s.compactThumb} /> : <View style={[s.compactThumb, s.thumbFallback]}><Text>📦</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={s.compactTitle} numberOfLines={1}>{item.title}</Text>
        <View style={s.compactBottom}><StatusPill status={item.status} /><Text style={s.compactPrice}>{euro(item.status === 'sold' ? (item.soldPrice ?? item.askingPrice) : item.askingPrice)}</Text></View>
      </View>
      <Text style={s.arrow}>›</Text>
    </Pressable>
  );
}

function SaleEditorModal({ sale, onClose, onSave }: { sale: SavedSale | null; onClose: () => void; onSave: (sale: SavedSale) => void }) {
  const [draft, setDraft] = useState<SavedSale | null>(sale);
  useEffect(() => setDraft(sale), [sale]);
  if (!draft) return null;

  function changeStatus(status: SaleStatus) {
    const now = new Date().toISOString();
    setDraft((x) => x ? {
      ...x,
      status,
      listedAt: status === 'listed' ? (x.listedAt || now) : x.listedAt,
      soldAt: status === 'sold' ? (x.soldAt || now) : undefined,
      soldPrice: status === 'sold' ? (x.soldPrice ?? x.askingPrice) : x.soldPrice,
    } : x);
  }

  return (
    <Modal visible={!!sale} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modalSafe}>
        <View style={s.modalHeader}>
          <Pressable onPress={onClose}><Text style={s.modalCancel}>Annuler</Text></Pressable>
          <Text style={s.modalTitle}>Suivre la vente</Text>
          <Pressable onPress={() => onSave(draft)}><Text style={s.modalSave}>Enregistrer</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={s.modalContent}>
          <Text style={s.editTitle}>{draft.title}</Text>
          <Text style={s.fieldLabel}>Statut</Text>
          <View style={s.statusChooser}>
            <StatusButton active={draft.status === 'draft'} label="Brouillon" onPress={() => changeStatus('draft')} />
            <StatusButton active={draft.status === 'listed'} label="En ligne" onPress={() => changeStatus('listed')} />
            <StatusButton active={draft.status === 'sold'} label="Vendu" onPress={() => changeStatus('sold')} />
          </View>

          <Text style={s.fieldLabel}>Prix affiché</Text>
          <TextInput
            value={String(Math.round(draft.askingPrice || 0))}
            keyboardType="numeric"
            onChangeText={(x) => setDraft({ ...draft, askingPrice: Number(x.replace(/[^0-9]/g, '')) || 0 })}
            style={s.singleInput}
          />

          {draft.status === 'sold' && (
            <>
              <Text style={s.fieldLabel}>Prix réellement obtenu</Text>
              <TextInput
                value={String(Math.round(draft.soldPrice ?? draft.askingPrice ?? 0))}
                keyboardType="numeric"
                onChangeText={(x) => setDraft({ ...draft, soldPrice: Number(x.replace(/[^0-9]/g, '')) || 0 })}
                style={s.singleInput}
              />
            </>
          )}

          <Text style={s.fieldLabel}>Plateforme</Text>
          <TextInput value={draft.platform || ''} onChangeText={(platform) => setDraft({ ...draft, platform })} placeholder="Leboncoin, Vinted, eBay…" placeholderTextColor="#9A978E" style={s.singleInput} />

          <Text style={s.fieldLabel}>Note personnelle</Text>
          <TextInput value={draft.personalNote || ''} onChangeText={(personalNote) => setDraft({ ...draft, personalNote })} multiline placeholder="Ex. acheteur intéressé, baisser à 95 € vendredi…" placeholderTextColor="#9A978E" style={s.input} />

          {draft.status === 'sold' && (
            <View style={s.soldSummary}>
              <Text style={s.soldSummaryTitle}>Résultat</Text>
              <Text style={s.soldSummaryValue}>{euro(draft.soldPrice ?? draft.askingPrice)}</Text>
              <Text style={s.muted}>Estimation initiale conseillée : {euro(draft.suggestedPrice)}</Text>
              <Text style={s.muted}>Écart : {signedEuro((draft.soldPrice ?? draft.askingPrice) - draft.suggestedPrice)}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PhotoSlotCard({ slot, photo, onPress, onRemove }: { slot: PhotoSlot; photo?: Photo; onPress: () => void; onRemove: () => void }) {
  if (photo) {
    return (
      <View style={s.photoSlotFilled}>
        <Image source={{ uri: photo.uri }} style={s.photoSlotImage} />
        <View style={s.photoSlotOverlay}><Text style={s.photoSlotOverlayText}>{slot.title}</Text></View>
        <Pressable style={s.photoRemove} onPress={onRemove}><Text style={s.photoRemoveText}>×</Text></Pressable>
      </View>
    );
  }
  return (
    <Pressable style={[s.photoSlot, slot.required && s.photoSlotRequired]} onPress={onPress}>
      <Text style={s.photoSlotIcon}>{slot.icon}</Text>
      <Text style={s.photoSlotTitle}>{slot.title}{slot.required ? ' *' : ''}</Text>
      <Text style={s.photoSlotSubtitle}>{slot.subtitle}</Text>
      <View style={s.addCircle}><Text style={s.addCircleText}>＋</Text></View>
    </Pressable>
  );
}

function AnalysisProgress({ step }: { step: number }) {
  const items = ['Identifier l’objet', 'Chercher les comparables', 'Calculer le bon prix', 'Rédiger l’annonce'];
  return (
    <View style={s.progressBox}>
      <Text style={s.progressTitle}>Analyse en cours…</Text>
      {items.map((item, i) => (
        <View key={item} style={s.progressRow}>
          <Text style={[s.progressDot, i <= step && s.progressDotOn]}>{i < step ? '✓' : '●'}</Text>
          <Text style={[s.progressText, i <= step && s.progressTextOn]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function PlatformRow({ advice, query }: { advice: PlatformAdvice; query: string }) {
  return (
    <View style={s.platformRow}>
      <View style={s.platformScore}><Text style={s.platformScoreText}>{advice.score}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.platformName}>{advice.name}</Text>
        <Text style={s.platformReason}>{advice.reason}</Text>
      </View>
      <Pressable onPress={() => openMarketplaceSearch(advice.name, query)}><Text style={s.marketSearch}>Chercher ›</Text></Pressable>
    </View>
  );
}

function PriceChoice({ label, value, selected, hot, onPress }: { label: string; value: number; selected: boolean; hot?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.price, hot && s.priceHot, selected && s.priceSelected]} onPress={onPress}>
      <Text style={s.priceLabel}>{label}</Text>
      <Text style={s.priceValue}>{euro(value)}</Text>
      {selected && <Text style={s.priceSelectedText}>✓ choisi</Text>}
    </Pressable>
  );
}

function StatusPill({ status }: { status: SaleStatus }) {
  const text = status === 'draft' ? 'Brouillon' : status === 'listed' ? 'En ligne' : 'Vendu';
  return <View style={[s.statusPill, status === 'listed' && s.statusListed, status === 'sold' && s.statusSold]}><Text style={s.statusPillText}>{text}</Text></View>;
}

function StatusButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[s.statusButton, active && s.statusButtonOn]}><Text style={[s.statusButtonText, active && s.statusButtonTextOn]}>{label}</Text></Pressable>;
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[s.filterChip, active && s.filterChipOn]}><Text style={[s.filterChipText, active && s.filterChipTextOn]}>{label}</Text></Pressable>;
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return <View style={s.sectionTitleWrap}><View style={s.sectionNumber}><Text style={s.sectionNumberText}>{number}</Text></View><Text style={s.sectionTitleText}>{title}</Text></View>;
}

function MetricCard({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return <View style={s.metricCard}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text><Text style={s.metricSubtitle}>{subtitle}</Text></View>;
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return <View style={s.miniStat}><Text style={s.miniStatValue}>{value}</Text><Text style={s.miniStatLabel}>{label}</Text></View>;
}

function Chip({ text }: { text: string }) {
  return <View style={s.chip}><Text style={s.chipText}>{text}</Text></View>;
}

function Tab({ active, icon, label, onPress }: { active: boolean; icon: string; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={s.tab}><Text style={[s.tabIcon, active && s.tabTextOn]}>{icon}</Text><Text style={[s.tabText, active && s.tabTextOn]}>{label}</Text>{active && <View style={s.tabIndicator} />}</Pressable>;
}

function Button({ text, onPress }: { text: string; onPress: () => void }) {
  return <Pressable style={s.secondary} onPress={onPress}><Text style={s.secondaryText}>{text}</Text></Pressable>;
}

function signedEuro(n: number) { return `${n > 0 ? '+' : ''}${Math.round(n)} €`; }

function openMarketplaceSearch(name: string, query: string) {
  const q = encodeURIComponent(query.trim());
  const lower = name.toLowerCase();
  let url = `https://www.google.com/search?q=${encodeURIComponent(`${query} occasion ${name}`)}`;
  if (lower.includes('leboncoin')) url = `https://www.leboncoin.fr/recherche?text=${q}`;
  else if (lower.includes('ebay')) url = `https://www.ebay.fr/sch/i.html?_nkw=${q}`;
  else if (lower.includes('vinted')) url = `https://www.vinted.fr/catalog?search_text=${q}`;
  else if (lower.includes('rakuten')) url = `https://fr.shopping.rakuten.com/s/${q}`;
  else if (lower.includes('facebook')) url = `https://www.facebook.com/marketplace/search/?query=${q}`;
  Linking.openURL(url).catch(() => {});
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F1E8' },
  header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F4F1E8' },
  logo: { fontSize: 24, fontWeight: '900', color: '#171712', letterSpacing: -0.8 },
  tag: { fontSize: 11, color: '#77736A', marginTop: 2 },
  badge: { backgroundColor: '#171712', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { color: 'white', fontWeight: '900', fontSize: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#DED9CD', backgroundColor: '#F4F1E8' },
  tab: { flex: 1, alignItems: 'center', paddingTop: 7, paddingBottom: 8, position: 'relative' },
  tabIcon: { fontSize: 17, color: '#9A968C', height: 20 },
  tabText: { fontSize: 10, fontWeight: '800', color: '#9A968C', marginTop: 2 },
  tabTextOn: { color: '#171712' },
  tabIndicator: { position: 'absolute', height: 3, width: 24, borderRadius: 4, backgroundColor: '#171712', bottom: -1 },
  content: { padding: 17, paddingBottom: 90 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: '#807047' },
  kickerLight: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: '#D9C98D' },
  heroTitle: { fontSize: 27, fontWeight: '900', color: '#171712', lineHeight: 31, letterSpacing: -0.8, marginTop: 4 },
  muted: { fontSize: 13, color: '#77736A', lineHeight: 19 },
  bold: { fontWeight: '900', color: '#25231E' },
  homeHero: { backgroundColor: '#1E211B', borderRadius: 26, padding: 22, marginBottom: 22 },
  homeHeroTitle: { color: '#FFFFFF', fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.9, marginTop: 8 },
  homeHeroBody: { color: '#C9C9C0', fontSize: 13, lineHeight: 20, marginTop: 10 },
  heroButton: { backgroundColor: '#E6D486', borderRadius: 15, paddingVertical: 14, paddingHorizontal: 15, alignItems: 'center', marginTop: 18 },
  heroButtonText: { color: '#171712', fontWeight: '900', fontSize: 15 },
  sectionMainTitle: { fontSize: 18, fontWeight: '900', color: '#171712', letterSpacing: -0.3, marginBottom: 10 },
  moneyGrid: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, borderWidth: 1, borderColor: '#E5E0D5' },
  metricLabel: { fontSize: 11, color: '#77736A', fontWeight: '800' },
  metricValue: { fontSize: 24, fontWeight: '900', color: '#1D4D32', marginTop: 5 },
  metricSubtitle: { fontSize: 10, color: '#89857B', marginTop: 4, lineHeight: 14 },
  miniStats: { flexDirection: 'row', gap: 8, marginTop: 9, marginBottom: 23 },
  miniStat: { flex: 1, backgroundColor: '#ECE7DC', borderRadius: 13, paddingVertical: 9, alignItems: 'center' },
  miniStatValue: { fontSize: 17, fontWeight: '900', color: '#25231E' },
  miniStatLabel: { fontSize: 10, color: '#77736A', marginTop: 1 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  textLink: { color: '#6C5B2C', fontWeight: '900', fontSize: 12, marginBottom: 10 },
  quickStart: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E5E0D5' },
  quickStartIcon: { fontSize: 31 },
  quickStartTitle: { fontWeight: '900', color: '#25231E', fontSize: 14, marginBottom: 3 },
  arrow: { fontSize: 27, color: '#9A968C', paddingLeft: 5 },
  heroSell: { marginBottom: 20 },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10, marginBottom: 12 },
  sectionNumber: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#171712', alignItems: 'center', justifyContent: 'center' },
  sectionNumberText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  sectionTitleText: { fontSize: 18, fontWeight: '900', color: '#25231E' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoSlot: { width: '48%', minHeight: 155, backgroundColor: '#EBE6DB', borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#BEB7A7', padding: 13, justifyContent: 'center', alignItems: 'center' },
  photoSlotRequired: { borderColor: '#84723D', backgroundColor: '#F0E8CB' },
  photoSlotFilled: { width: '48%', height: 155, borderRadius: 18, overflow: 'hidden', backgroundColor: '#E6E1D7' },
  photoSlotImage: { width: '100%', height: '100%' },
  photoSlotOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,.62)', padding: 8 },
  photoSlotOverlayText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  photoRemove: { position: 'absolute', right: 8, top: 8, width: 27, height: 27, borderRadius: 14, backgroundColor: 'rgba(0,0,0,.72)', alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { color: '#FFFFFF', fontSize: 20, lineHeight: 21 },
  photoSlotIcon: { fontSize: 29, marginBottom: 8 },
  photoSlotTitle: { fontWeight: '900', color: '#34312B', fontSize: 13, textAlign: 'center' },
  photoSlotSubtitle: { color: '#7D786E', fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 4 },
  addCircle: { marginTop: 9, width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  addCircleText: { fontSize: 17, fontWeight: '700', color: '#514B3B' },
  tipBox: { backgroundColor: '#E8EDE4', borderRadius: 15, padding: 13, marginTop: 12, marginBottom: 18 },
  tipTitle: { fontSize: 12, fontWeight: '900', color: '#334235' },
  tipText: { fontSize: 11, lineHeight: 16, color: '#5F6A60', marginTop: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '900', color: '#4D493F', marginTop: 12, marginBottom: 6 },
  singleInput: { minHeight: 47, borderWidth: 1, borderColor: '#D5D0C5', backgroundColor: '#FFFFFF', borderRadius: 13, paddingHorizontal: 13, fontSize: 14, color: '#171712' },
  input: { minHeight: 105, borderWidth: 1, borderColor: '#D5D0C5', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 13, textAlignVertical: 'top', fontSize: 14, color: '#171712' },
  descriptionInput: { minHeight: 155, borderWidth: 1, borderColor: '#D5D0C5', backgroundColor: '#FAF9F5', borderRadius: 14, padding: 13, textAlignVertical: 'top', fontSize: 14, lineHeight: 20, color: '#171712' },
  apiState: { backgroundColor: '#ECE7DC', borderRadius: 14, padding: 12, marginTop: 15 },
  apiStateTitle: { fontWeight: '900', color: '#33312B', fontSize: 12 },
  apiStateText: { color: '#77736A', fontSize: 11, lineHeight: 16, marginTop: 3 },
  primary: { backgroundColor: '#171712', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  primaryInline: { backgroundColor: '#171712', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 22, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  demo: { alignItems: 'center', padding: 13 },
  demoText: { fontWeight: '800', color: '#75663C', fontSize: 12 },
  progressBox: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#E4DFD4' },
  progressTitle: { fontSize: 14, fontWeight: '900', color: '#25231E', marginBottom: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 },
  progressDot: { color: '#C9C3B5', width: 18, fontWeight: '900' },
  progressDotOn: { color: '#587353' },
  progressText: { color: '#A09B91', fontSize: 12 },
  progressTextOn: { color: '#34312B', fontWeight: '700' },
  result: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, marginTop: 18, borderWidth: 1, borderColor: '#E3DED3' },
  resultHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  resultTitle: { fontSize: 22, fontWeight: '900', color: '#171712', marginTop: 5, maxWidth: 260, letterSpacing: -0.5 },
  identity: { color: '#77736A', marginTop: 3, fontSize: 12 },
  confBubble: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E7EFE4', alignItems: 'center', justifyContent: 'center' },
  confValue: { fontSize: 14, fontWeight: '900', color: '#31523A' },
  confLabel: { fontSize: 8, fontWeight: '800', color: '#68806E' },
  warningBox: { backgroundColor: '#FFF3DA', borderRadius: 13, padding: 12, marginTop: 14 },
  warningTitle: { fontSize: 11, fontWeight: '900', color: '#785B1C', marginBottom: 3 },
  warningText: { fontSize: 11, color: '#7B672E', lineHeight: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '900', color: '#4D493F', marginTop: 20, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.8 },
  helper: { fontSize: 10, color: '#8B877E', marginBottom: 8 },
  prices: { flexDirection: 'row', gap: 7 },
  price: { flex: 1, minHeight: 82, backgroundColor: '#F1EEE6', borderRadius: 13, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  priceHot: { backgroundColor: '#E6EFE3' },
  priceSelected: { borderColor: '#284C33', borderWidth: 2 },
  priceLabel: { fontSize: 9, color: '#77736A', fontWeight: '800', textAlign: 'center' },
  priceValue: { fontSize: 19, fontWeight: '900', color: '#171712', marginTop: 3 },
  priceSelectedText: { fontSize: 8, color: '#31523A', fontWeight: '900', marginTop: 2 },
  marketMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  marketMetaText: { fontSize: 10, color: '#77736A' },
  demandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 },
  demandPill: { backgroundColor: '#ECE7DC', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  demandText: { fontSize: 10, fontWeight: '900', color: '#514C40', textTransform: 'capitalize' },
  speedText: { fontSize: 10, color: '#77736A' },
  body: { fontSize: 13, lineHeight: 19, color: '#39372F' },
  comparableRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#EEEAE1' },
  comparableTitle: { fontSize: 12, fontWeight: '800', color: '#34312B' },
  comparableMeta: { fontSize: 10, color: '#89857B', marginTop: 2 },
  comparablePrice: { fontSize: 15, fontWeight: '900', color: '#244C32' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 9, paddingVertical: 6, backgroundColor: '#EEEAE1', borderRadius: 999 },
  chipText: { fontWeight: '700', fontSize: 10, color: '#4A473F' },
  bullet: { fontSize: 12, lineHeight: 18, color: '#45423A', marginBottom: 3 },
  priceEditorRow: { flexDirection: 'row', alignItems: 'center', width: 140 },
  priceInput: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: '#D5D0C5', backgroundColor: '#FFFFFF', borderRadius: 13, paddingHorizontal: 13, fontSize: 18, fontWeight: '900', color: '#171712' },
  priceCurrency: { marginLeft: -28, fontWeight: '900', fontSize: 16, color: '#6D695F' },
  tipsList: { backgroundColor: '#F2F4EC', borderRadius: 13, padding: 11 },
  platformRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEEAE1' },
  platformScore: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ECE7DC', alignItems: 'center', justifyContent: 'center' },
  platformScoreText: { fontSize: 11, fontWeight: '900', color: '#4A473F' },
  platformName: { fontSize: 12, fontWeight: '900', color: '#34312B' },
  platformReason: { fontSize: 10, color: '#817D73', lineHeight: 14, marginTop: 2 },
  marketSearch: { fontSize: 10, fontWeight: '900', color: '#665622' },
  shippingBox: { backgroundColor: '#EDF0E9', borderRadius: 13, padding: 12, marginTop: 16 },
  shippingTitle: { fontSize: 11, fontWeight: '900', color: '#405342', marginBottom: 5 },
  sourceLink: { fontSize: 11, color: '#425B80', fontWeight: '700', paddingVertical: 6 },
  row: { flexDirection: 'row', gap: 9, marginTop: 10 },
  secondary: { flex: 1, borderWidth: 1, borderColor: '#D3CEC2', backgroundColor: '#FFFFFF', borderRadius: 13, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  secondaryText: { fontWeight: '900', color: '#3B3933', fontSize: 12 },
  reset: { textAlign: 'center', fontWeight: '800', paddingTop: 17, color: '#75663C', fontSize: 12 },
  salesHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  smallPrimary: { backgroundColor: '#171712', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10 },
  smallPrimaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11 },
  filterRow: { gap: 7, paddingVertical: 13 },
  filterChip: { backgroundColor: '#E9E4D9', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  filterChipOn: { backgroundColor: '#171712' },
  filterChipText: { fontSize: 10, fontWeight: '800', color: '#6B675D' },
  filterChipTextOn: { color: '#FFFFFF' },
  empty: { alignItems: 'center', padding: 30, marginTop: 20, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E3DED3' },
  emptyTitle: { fontSize: 17, fontWeight: '900', marginVertical: 7, color: '#25231E' },
  savedCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, marginTop: 11, borderWidth: 1, borderColor: '#E3DED3' },
  savedTop: { flexDirection: 'row', gap: 12 },
  thumb: { width: 88, height: 88, borderRadius: 13, backgroundColor: '#ECE7DC' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  statusLine: { alignItems: 'flex-start', marginBottom: 4 },
  statusPill: { backgroundColor: '#E8E3D8', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  statusListed: { backgroundColor: '#E3EBF2' },
  statusSold: { backgroundColor: '#DDEDDD' },
  statusPillText: { fontSize: 8, fontWeight: '900', color: '#4B4840' },
  savedTitle: { fontSize: 14, fontWeight: '900', color: '#171712', lineHeight: 18 },
  savedPrice: { fontSize: 20, fontWeight: '900', marginTop: 4, color: '#275038' },
  savedMeta: { fontSize: 10, color: '#8B877D', marginTop: 2 },
  deleteLink: { textAlign: 'center', color: '#9B5A50', fontWeight: '700', fontSize: 10, paddingTop: 12 },
  compactSale: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E5E0D5' },
  compactThumb: { width: 55, height: 55, borderRadius: 11, backgroundColor: '#ECE7DC' },
  compactTitle: { fontSize: 12, fontWeight: '900', color: '#292721' },
  compactBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  compactPrice: { fontSize: 14, fontWeight: '900', color: '#2D5038' },
  modalSafe: { flex: 1, backgroundColor: '#F4F1E8' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#DED9CD' },
  modalCancel: { fontSize: 12, color: '#77736A', fontWeight: '700' },
  modalTitle: { fontSize: 15, color: '#25231E', fontWeight: '900' },
  modalSave: { fontSize: 12, color: '#31563B', fontWeight: '900' },
  modalContent: { padding: 18, paddingBottom: 60 },
  editTitle: { fontSize: 20, fontWeight: '900', color: '#171712', marginBottom: 8 },
  statusChooser: { flexDirection: 'row', gap: 7 },
  statusButton: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center', backgroundColor: '#E8E3D8' },
  statusButtonOn: { backgroundColor: '#171712' },
  statusButtonText: { fontSize: 10, fontWeight: '900', color: '#69655C' },
  statusButtonTextOn: { color: '#FFFFFF' },
  soldSummary: { backgroundColor: '#E5EFE3', borderRadius: 16, padding: 15, marginTop: 18 },
  soldSummaryTitle: { fontSize: 11, fontWeight: '900', color: '#49604D' },
  soldSummaryValue: { fontSize: 28, fontWeight: '900', color: '#24482E', marginVertical: 3 },
});
