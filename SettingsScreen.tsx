import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getAdapter, PROVIDERS, type ProviderId } from '../../shared/ai';
import { testBackend, testProviderKey } from './analyze';
import { loadApiKey, saveApiKey, type AiMode, type AppSettings } from './settings';

type Props = {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
};

const MODES: { id: AiMode; label: string; hint: string }[] = [
  { id: 'direct', label: 'Clé directe', hint: 'Le téléphone appelle l’API du fournisseur avec ta clé. Aucun serveur à déployer.' },
  { id: 'backend', label: 'Backend', hint: 'L’analyse passe par ton backend Next.js, qui détient la clé côté serveur.' },
  { id: 'demo', label: 'Démo', hint: 'Résultat simulé, sans appel réseau ni clé API. Pour tester l’interface.' },
];

export default function SettingsScreen({ settings, onChange }: Props) {
  const provider = settings.provider;
  const info = getAdapter(provider).info;

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Recharge la clé enregistrée à chaque changement de fournisseur.
  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    setModels([]);
    loadApiKey(provider).then((key) => { if (!cancelled) setApiKey(key); });
    return () => { cancelled = true; };
  }, [provider]);

  const model = settings.models[provider] || '';

  function patch(next: Partial<AppSettings>) {
    onChange({ ...settings, ...next });
  }

  function setModel(value: string) {
    patch({ models: { ...settings.models, [provider]: value } });
  }

  async function persistKey(value: string) {
    setApiKey(value);
    await saveApiKey(provider, value);
  }

  async function verifyKey() {
    setBusy(true);
    setStatus(null);
    try {
      const available = await testProviderKey(provider, apiKey);
      setModels(available);
      const known = model && available.length ? available.includes(model) : true;
      setStatus({
        ok: true,
        text: `Clé valide — ${available.length} modèle(s) disponible(s).${known ? '' : ' Attention : le modèle saisi n’apparaît pas dans la liste.'}`,
      });
    } catch (error: any) {
      setStatus({ ok: false, text: error?.message || 'Vérification impossible.' });
    } finally {
      setBusy(false);
    }
  }

  async function verifyBackend() {
    setBusy(true);
    setStatus(null);
    try {
      const health = await testBackend(settings.backendUrl);
      setStatus({
        ok: true,
        text: health.providers.length
          ? `Backend v${health.version} joignable — clés configurées : ${health.providers.join(', ')}.`
          : `Backend v${health.version} joignable, mais aucune clé API n’y est configurée.`,
      });
    } catch (error: any) {
      setStatus({ ok: false, text: error?.message || 'Backend injoignable.' });
    } finally {
      setBusy(false);
    }
  }

  function confirmClearKey() {
    Alert.alert('Supprimer la clé', `Retirer la clé ${info.label} de ce téléphone ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => { persistKey(''); setStatus(null); } },
    ]);
  }

  const webSearchDisabled = !info.supportsWebSearch;

  return (
    <ScrollView contentContainerStyle={c.content} keyboardShouldPersistTaps="handled">
      <View style={c.hero}>
        <Text style={c.kicker}>RÉGLAGES</Text>
        <Text style={c.heroTitle}>Connexion à l’IA</Text>
        <Text style={c.muted}>Choisis le fournisseur et colle ta clé API. Elle reste sur ce téléphone, dans le coffre sécurisé du système.</Text>
      </View>

      {/* 1. Mode --------------------------------------------------- */}
      <Text style={c.sectionLabel}>Mode d’analyse</Text>
      <View style={c.segmented}>
        {MODES.map((item) => (
          <Pressable
            key={item.id}
            style={[c.segment, settings.mode === item.id && c.segmentOn]}
            onPress={() => { patch({ mode: item.id }); setStatus(null); }}
          >
            <Text style={[c.segmentText, settings.mode === item.id && c.segmentTextOn]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={c.help}>{MODES.find((x) => x.id === settings.mode)?.hint}</Text>

      {/* 2. Fournisseur -------------------------------------------- */}
      {settings.mode !== 'demo' && (
        <>
          <Text style={c.sectionLabel}>Fournisseur</Text>
          <View style={c.chips}>
            {PROVIDERS.map((item) => (
              <Pressable
                key={item.id}
                style={[c.chip, provider === item.id && c.chipOn]}
                onPress={() => patch({ provider: item.id as ProviderId })}
              >
                <Text style={[c.chipText, provider === item.id && c.chipTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* 3. Clé API ------------------------------------------------- */}
      {settings.mode === 'direct' && (
        <>
          <Text style={c.sectionLabel}>Clé API {info.label}</Text>
          <View style={c.keyRow}>
            <TextInput
              value={apiKey}
              onChangeText={persistKey}
              placeholder={info.keyPrefix ? `${info.keyPrefix}…` : 'Colle ta clé ici'}
              placeholderTextColor="#9A978E"
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
              style={[c.input, { flex: 1 }]}
            />
            <Pressable style={c.eye} onPress={() => setShowKey((x) => !x)}>
              <Text style={c.eyeText}>{showKey ? '🙈' : '👁'}</Text>
            </Pressable>
          </View>
          <Text style={c.help}>{info.hint}</Text>
          {!!info.keyPrefix && !!apiKey && !apiKey.startsWith(info.keyPrefix) && (
            <Text style={c.warn}>Cette clé ne commence pas par « {info.keyPrefix} » : vérifie que c’est bien une clé {info.label}.</Text>
          )}

          <View style={c.rowButtons}>
            <Pressable style={[c.secondary, busy && c.disabled]} disabled={busy} onPress={verifyKey}>
              {busy ? <ActivityIndicator color="#3B3933" /> : <Text style={c.secondaryText}>Vérifier la clé</Text>}
            </Pressable>
            <Pressable style={c.secondary} onPress={() => Linking.openURL(info.keyUrl)}>
              <Text style={c.secondaryText}>Obtenir une clé</Text>
            </Pressable>
          </View>
          {!!apiKey && (
            <Pressable onPress={confirmClearKey}>
              <Text style={c.deleteLink}>Supprimer la clé de ce téléphone</Text>
            </Pressable>
          )}
        </>
      )}

      {/* 4. Backend ------------------------------------------------- */}
      {settings.mode === 'backend' && (
        <>
          <Text style={c.sectionLabel}>URL du backend</Text>
          <TextInput
            value={settings.backendUrl}
            onChangeText={(value) => patch({ backendUrl: value.trim() })}
            placeholder="https://ton-projet.vercel.app"
            placeholderTextColor="#9A978E"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={c.input}
          />
          <Text style={c.help}>En test local, utilise l’IP du PC (ex. http://192.168.1.25:3000), jamais localhost. La clé API reste sur le serveur.</Text>
          <View style={c.rowButtons}>
            <Pressable style={[c.secondary, busy && c.disabled]} disabled={busy} onPress={verifyBackend}>
              {busy ? <ActivityIndicator color="#3B3933" /> : <Text style={c.secondaryText}>Tester le backend</Text>}
            </Pressable>
          </View>
        </>
      )}

      {/* 5. Modèle -------------------------------------------------- */}
      {settings.mode !== 'demo' && (
        <>
          <Text style={c.sectionLabel}>Modèle</Text>
          <TextInput
            value={model}
            onChangeText={setModel}
            placeholder={info.defaultModel}
            placeholderTextColor="#9A978E"
            autoCapitalize="none"
            autoCorrect={false}
            style={c.input}
          />
          <Text style={c.help}>Laisser vide pour utiliser {info.defaultModel}. Le modèle doit accepter les images.</Text>
          <View style={c.chips}>
            {info.suggestedModels.map((item) => (
              <Pressable key={item} style={[c.chipSmall, model === item && c.chipOn]} onPress={() => setModel(item)}>
                <Text style={[c.chipText, model === item && c.chipTextOn]}>{item}</Text>
              </Pressable>
            ))}
            {models.length > 0 && (
              <Pressable style={c.chipSmall} onPress={() => setPickerOpen(true)}>
                <Text style={c.chipText}>Liste complète ({models.length})</Text>
              </Pressable>
            )}
          </View>

          {/* 6. Recherche web ---------------------------------------- */}
          <View style={c.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={c.switchTitle}>Recherche web de comparables</Text>
              <Text style={c.help}>
                {webSearchDisabled
                  ? `${info.label} ne propose pas de recherche web : l’estimation reposera sur la seule connaissance du modèle.`
                  : 'Le modèle cherche des annonces d’occasion récentes avant de proposer un prix. Plus lent, mais bien plus fiable.'}
              </Text>
            </View>
            <Switch
              value={settings.webSearch && !webSearchDisabled}
              disabled={webSearchDisabled}
              onValueChange={(value) => patch({ webSearch: value })}
              trackColor={{ true: '#587353', false: '#C9C3B5' }}
            />
          </View>
        </>
      )}

      {/* 7. Divers -------------------------------------------------- */}
      <Text style={c.sectionLabel}>Zone de vente par défaut</Text>
      <TextInput
        value={settings.defaultLocation}
        onChangeText={(value) => patch({ defaultLocation: value })}
        placeholder="France"
        placeholderTextColor="#9A978E"
        style={c.input}
      />

      {!!status && (
        <View style={[c.status, status.ok ? c.statusOk : c.statusKo]}>
          <Text style={[c.statusText, status.ok ? c.statusTextOk : c.statusTextKo]}>{status.text}</Text>
        </View>
      )}

      <View style={c.privacy}>
        <Text style={c.privacyTitle}>🔒 Où va ta clé ?</Text>
        <Text style={c.privacyText}>
          En mode « Clé directe », la clé est stockée dans le coffre sécurisé du téléphone et n’est transmise qu’à {info.label}, au moment de l’analyse.
          En mode « Backend », aucune clé n’est stockée sur le téléphone. Les photos ne sont jamais conservées ailleurs que sur l’appareil.
        </Text>
      </View>

      {/* Sélecteur de modèle ---------------------------------------- */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={c.modalSafe}>
          <View style={c.modalHeader}>
            <Pressable onPress={() => setPickerOpen(false)}><Text style={c.modalCancel}>Fermer</Text></Pressable>
            <Text style={c.modalTitle}>Modèles {info.label}</Text>
            <View style={{ width: 50 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 50 }}>
            {models.map((item) => (
              <Pressable
                key={item}
                style={c.modelRow}
                onPress={() => { setModel(item); setPickerOpen(false); }}
              >
                <Text style={[c.modelText, model === item && c.modelTextOn]}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const c = StyleSheet.create({
  content: { padding: 17, paddingBottom: 90 },
  hero: { marginBottom: 8 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: '#807047' },
  heroTitle: { fontSize: 27, fontWeight: '900', color: '#171712', lineHeight: 31, letterSpacing: -0.8, marginTop: 4, marginBottom: 6 },
  muted: { fontSize: 13, color: '#77736A', lineHeight: 19 },
  sectionLabel: { fontSize: 11, fontWeight: '900', color: '#4D493F', marginTop: 22, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  help: { fontSize: 11, color: '#8B877E', lineHeight: 16, marginTop: 6 },
  warn: { fontSize: 11, color: '#8A6A22', lineHeight: 16, marginTop: 6, fontWeight: '700' },
  segmented: { flexDirection: 'row', gap: 7 },
  segment: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#E8E3D8' },
  segmentOn: { backgroundColor: '#171712' },
  segmentText: { fontSize: 11, fontWeight: '900', color: '#69655C' },
  segmentTextOn: { color: '#FFFFFF' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 10, backgroundColor: '#E9E4D9', borderRadius: 999 },
  chipSmall: { paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#E9E4D9', borderRadius: 999 },
  chipOn: { backgroundColor: '#171712' },
  chipText: { fontWeight: '800', fontSize: 11, color: '#4A473F' },
  chipTextOn: { color: '#FFFFFF' },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { minHeight: 47, borderWidth: 1, borderColor: '#D5D0C5', backgroundColor: '#FFFFFF', borderRadius: 13, paddingHorizontal: 13, fontSize: 14, color: '#171712' },
  eye: { width: 47, height: 47, borderRadius: 13, backgroundColor: '#E9E4D9', alignItems: 'center', justifyContent: 'center' },
  eyeText: { fontSize: 17 },
  rowButtons: { flexDirection: 'row', gap: 9, marginTop: 12 },
  secondary: { flex: 1, borderWidth: 1, borderColor: '#D3CEC2', backgroundColor: '#FFFFFF', borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  secondaryText: { fontWeight: '900', color: '#3B3933', fontSize: 12 },
  disabled: { opacity: 0.6 },
  deleteLink: { textAlign: 'center', color: '#9B5A50', fontWeight: '700', fontSize: 11, paddingTop: 14 },
  switchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E0D5', padding: 14, marginTop: 20 },
  switchTitle: { fontSize: 13, fontWeight: '900', color: '#25231E' },
  status: { borderRadius: 14, padding: 13, marginTop: 20 },
  statusOk: { backgroundColor: '#E5EFE3' },
  statusKo: { backgroundColor: '#F7E4E0' },
  statusText: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  statusTextOk: { color: '#2E4A34' },
  statusTextKo: { color: '#7E4238' },
  privacy: { backgroundColor: '#ECE7DC', borderRadius: 15, padding: 14, marginTop: 22 },
  privacyTitle: { fontSize: 12, fontWeight: '900', color: '#33312B' },
  privacyText: { fontSize: 11, color: '#6F6B62', lineHeight: 16, marginTop: 5 },
  modalSafe: { flex: 1, backgroundColor: '#F4F1E8', paddingTop: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#DED9CD' },
  modalCancel: { fontSize: 12, color: '#77736A', fontWeight: '700' },
  modalTitle: { fontSize: 15, color: '#25231E', fontWeight: '900' },
  modelRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E6E1D6' },
  modelText: { fontSize: 13, color: '#3B3933' },
  modelTextOn: { fontWeight: '900', color: '#171712' },
});
