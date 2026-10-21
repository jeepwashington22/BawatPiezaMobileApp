import { useEffect, useState } from 'react';
import { Animated, type StyleProp, type TextStyle } from 'react-native';

import { AppText as Text } from './app-text';

type CountUpTextProps = {
  value: number;
  decimals?: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export function CountUpText({
  value,
  decimals = 0,
  duration = 850,
  style,
  numberOfLines,
}: CountUpTextProps) {
  const [animation] = useState(() => new Animated.Value(0));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const listenerId = animation.addListener(({ value: nextValue }) => {
      setDisplayValue(nextValue);
    });

    animation.stopAnimation((currentValue) => {
      animation.setValue(currentValue);

      Animated.timing(animation, {
        toValue: value,
        duration,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      animation.removeListener(listenerId);
      animation.stopAnimation();
    };
  }, [animation, duration, value]);

  const formattedValue = displayValue.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {formattedValue}
    </Text>
  );
}
