import { useSyncExternalStore } from "preact/compat"
import { network } from "@/store/network"

export default function useOnline() {
  const online = useSyncExternalStore(network.subscribe, network.getSnapshot)
  return online
}
