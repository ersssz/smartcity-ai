import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import DiagnosticApp from './DiagnosticApp';
import WalkApp from './WalkApp';
import { suspendDiagnostic } from './src/walkDiagnostic';
export default function App() {
  const [diagnostics, setDiagnostics] = useState(false);
  const cityLaunchClaimed = useRef(false);
  const claimCityLaunch = useCallback(() => {
    if (cityLaunchClaimed.current) return false;
    cityLaunchClaimed.current = true;
    return true;
  }, []);
  if (!diagnostics) return <WalkApp claimCityLaunch={claimCityLaunch} onOpenDiagnostics={() => setDiagnostics(true)} />;
  return <View style={styles.page}><SafeAreaView><Pressable style={styles.back} onPress={() => {
    void suspendDiagnostic('paused').then(() => setDiagnostics(false)).catch(() => Alert.alert('GPS', 'Не удалось подтвердить остановку. Нажмите «Остановить» в уведомлении.'));
  }}><Text style={styles.text}>← AstGeo · к прогулке</Text></Pressable></SafeAreaView><DiagnosticApp /></View>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#111A21' }, back: { padding: 16 }, text: { color: '#D8F0D4', fontSize: 16, fontWeight: '600' } });
