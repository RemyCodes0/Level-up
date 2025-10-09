"use client"

import { toast } from "sonner"

/**
 * useToast() — a simple wrapper around the Sonner toast system.
 * This replaces the deprecated Shadcn toast system.
 *
 * Example usage:
 * const { toast, success, error, info } = useToast()
 * toast("Hello there!")
 * success("Saved successfully!")
 * error("Something went wrong!")
 */

export const useToast = () => {
  return {
    // Basic toast
    toast: (message: string, options?: { description?: string }) => {
      if (options?.description) {
        toast(message, { description: options.description })
      } else {
        toast(message)
      }
    },

    // Predefined types
    success: (message: string, options?: { description?: string }) => {
      toast.success(message, { description: options?.description })
    },

    error: (message: string, options?: { description?: string }) => {
      toast.error(message, { description: options?.description })
    },

    info: (message: string, options?: { description?: string }) => {
      toast.info(message, { description: options?.description })
    },

    warning: (message: string, options?: { description?: string }) => {
      toast.warning(message, { description: options?.description })
    },
  }
}
