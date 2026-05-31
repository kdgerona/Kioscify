import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSync } from "../contexts/SyncContext";
import type { ViewStyle } from "react-native";

const ALL_EDGES = ["top", "right", "bottom", "left"] as const;
const NO_TOP_EDGES = ["right", "bottom", "left"] as const;

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  className?: string;
}

/**
 * Drop-in replacement for SafeAreaView that automatically excludes the top
 * edge when the offline banner is visible (the banner consumes that space).
 */
export default function AppSafeAreaView({ children, style, className }: Props) {
  const { isOnline } = useSync();
  return (
    <SafeAreaView
      edges={isOnline ? ALL_EDGES : NO_TOP_EDGES}
      style={style}
      className={className}
    >
      {children}
    </SafeAreaView>
  );
}
