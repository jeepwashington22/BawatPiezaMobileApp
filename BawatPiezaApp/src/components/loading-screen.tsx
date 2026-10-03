import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { TileLoader, type TileLoaderProps } from './tile-loader';

/**
 * LoadingScreen — full-screen centered TileLoader. Mirrors the web dashboard's
 * dashboard/loading.tsx route loader (used while verifying a session, fetching
 * data, or transitioning between routes).
 */
export function LoadingScreen({
  label = 'Harvesting energy...',
  size = 'md',
}: Pick<TileLoaderProps, 'label' | 'size'>) {
  const { colors: c } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <TileLoader label={label} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});