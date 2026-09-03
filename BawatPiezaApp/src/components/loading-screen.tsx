import { StyleSheet, View } from 'react-native';
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
  return (
    <View style={styles.container}>
      <TileLoader label={label} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F4',
  },
});