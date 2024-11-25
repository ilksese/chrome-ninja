import { useSyncExternalStore } from "react"
import { network } from "@/store/network"

export default function useOnline() {
  const online = useSyncExternalStore(network.subscribe, network.getSnapshot)
  return online
}
