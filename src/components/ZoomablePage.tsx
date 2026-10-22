import { Image, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "./ui";

/** Full-screen page view: pinch to zoom (1–5×), drag to pan, double-tap to toggle 2.5×. */
export function ZoomablePage({ uri, aspect, onClose }: { uri: string | null; aspect: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const pageW = width;
  const pageH = width * aspect;

  const clamp = (v: number, s: number, size: number, view: number) => {
    "worklet";
    const max = Math.max(0, (size * s - view) / 2);
    return Math.min(max, Math.max(-max, v));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(5, Math.max(1, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      tx.value = withTiming(clamp(tx.value, scale.value, pageW, width));
      ty.value = withTiming(clamp(ty.value, scale.value, pageH, height));
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      tx.value = clamp(savedTx.value + e.translationX, scale.value, pageW, width);
      ty.value = clamp(savedTy.value + e.translationY, scale.value, pageH, height);
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = scale.value > 1.2 ? 1 : 2.5;
      scale.value = withTiming(next);
      savedScale.value = next;
      tx.value = withTiming(0);
      ty.value = withTiming(0);
      savedTx.value = 0;
      savedTy.value = 0;
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <Modal visible={!!uri} onRequestClose={onClose} animationType="fade" statusBarTranslucent>
      {/* Modals render outside the app's gesture root, so they need their own. */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#111" }}>
        <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
          <View style={styles.fill} accessibilityLabel="Zoomed page. Pinch to zoom, double-tap to zoom in or out.">
            <Animated.View style={[{ width: pageW, height: pageH }, style]}>
              {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
            </Animated.View>
          </View>
        </GestureDetector>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close zoom"
          hitSlop={12}
          style={[styles.close, { top: insets.top + 12 }]}
        >
          <Icon name="close" color="#FFFFFF" />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  close: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});
