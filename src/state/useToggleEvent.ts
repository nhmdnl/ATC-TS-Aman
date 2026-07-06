import { useEffect, useState } from 'react'

/**
 * Overlay visibility driven by a window CustomEvent (dispatched by
 * useKeyboardShortcuts). Returns the open flag plus a setter for close
 * buttons inside the overlay itself.
 */
export function useToggleEvent(eventName: string): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onToggle = () => setOpen(o => !o)
    window.addEventListener(eventName, onToggle)
    return () => window.removeEventListener(eventName, onToggle)
  }, [eventName])

  return [open, setOpen]
}
