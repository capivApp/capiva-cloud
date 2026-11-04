import { Tabs } from "expo-router";
import { Activity, Boxes, LayoutDashboard, Settings } from "lucide-react-native";
import { usePendingNotificationHref } from "@/hooks/useNotificationRedirect";
import { nativeTheme } from "@/lib/theme";

export default function TabsLayout() {
  usePendingNotificationHref();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: nativeTheme.card, borderTopColor: nativeTheme.border },
        tabBarActiveTintColor: nativeTheme.primary,
        tabBarInactiveTintColor: nativeTheme.mutedForeground,
        sceneStyle: { backgroundColor: nativeTheme.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Visão Geral",
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="apps"
        options={{
          title: "Aplicações",
          tabBarIcon: ({ color, size }) => <Boxes color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="monitor"
        options={{
          title: "Monitor",
          tabBarIcon: ({ color, size }) => <Activity color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Ajustes",
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
