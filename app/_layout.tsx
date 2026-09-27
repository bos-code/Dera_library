import { Stack } from "expo-router";
import { useEffect } from "react";
import { initDatabase } from "@/db/database";
export default function RootLayout(){useEffect(()=>{void initDatabase()},[]);return <Stack><Stack.Screen name="index" options={{title:"Dera Library"}}/></Stack>}
