import { useLocalSearchParams } from "expo-router";
import { DocumentDetail } from "@/components/DocumentDetail";

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DocumentDetail id={Number(id)} />;
}
