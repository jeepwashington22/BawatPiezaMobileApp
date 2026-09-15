import { useCallback, useRef, useState } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';

/** How close to the bottom counts as "read to the end" (px). */
const END_TOLERANCE = 24;

/**
 * Tracks whether the reader has reached the end of a scrollable policy.
 *
 * Shared by the inline agreement card on the Sign Up screen and the full-screen
 * policy modal so the "read before you agree" rule behaves identically in both.
 *
 * `reset()` must be called whenever the policy is (re)opened, so consent is
 * always explicit for the current viewing.
 */
export function useTermsReading(enabled: boolean = true) {
  const [reachedEnd, setReachedEnd] = useState(!enabled);

  const layoutHeight = useRef(0);
  const contentHeight = useRef(0);

  const reset = useCallback(() => {
    setReachedEnd(!enabled);
    layoutHeight.current = 0;
    contentHeight.current = 0;
  }, [enabled]);

  /** Unlocks the checkbox when the policy fits without needing to be scrolled. */
  const unlockIfFullyVisible = useCallback(() => {
    if (!enabled) return;
    const lh = layoutHeight.current;
    const ch = contentHeight.current;
    if (lh > 0 && ch > 0 && ch <= lh + END_TOLERANCE) setReachedEnd(true);
  }, [enabled]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      layoutHeight.current = event.nativeEvent.layout.height;
      unlockIfFullyVisible();
    },
    [unlockIfFullyVisible],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height;
      unlockIfFullyVisible();
    },
    [unlockIfFullyVisible],
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - END_TOLERANCE) {
      setReachedEnd(true);
    }
  }, []);

  return { reachedEnd, reset, onLayout, onContentSizeChange, onScroll };
}