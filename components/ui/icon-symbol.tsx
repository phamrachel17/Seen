// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
export type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  // Seen app tabs
  'doc.text': 'article',
  'magnifyingglass': 'search',
  'list.bullet': 'list',
  'list.number': 'format-list-numbered',
  'person': 'person-outline',
  'person.fill': 'person',
  'bookmark': 'bookmark-outline',
  'bookmark.fill': 'bookmark',
  'star': 'star-outline',
  'star.fill': 'star',
  'bell': 'notifications-none',
  'bell.fill': 'notifications',
  'plus': 'add',
  'xmark': 'close',
  'arrow.left': 'arrow-back',
  'ellipsis': 'more-horiz',
  'square.and.arrow.up': 'share',
  'eye': 'visibility',
  'eye.slash': 'visibility-off',
  'chevron.left': 'chevron-left',
  'gearshape': 'settings',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
