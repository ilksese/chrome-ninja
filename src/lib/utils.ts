import type { ClassValue } from "clsx"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function ninjaLog(...inputs: unknown[]) {
  console.debug("%c[NINJA_LOG]", "color: red;background:yellow", ...inputs)
}
