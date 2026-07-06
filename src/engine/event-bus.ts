import { GameEventType, GameEvent } from './types'

type EventHandler = (event: GameEvent) => void

/**
 * Strongly typed event bus for the ATC simulation.
 * Supports immediate dispatch or queued dispatch (flushed per tick).
 */
export class EventBus {
  private listeners: Map<GameEventType, Set<EventHandler>> = new Map()
  private queue: GameEvent[] = []

  /**
   * Subscribe to an event type.
   * @param type Event type to listen for
   * @param handler Callback function
   * @returns Unsubscribe function
   */
  on(type: GameEventType, handler: EventHandler): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(handler)
    return () => this.off(type, handler)
  }

  /**
   * Unsubscribe from an event type.
   * @param type Event type
   * @param handler Callback function to remove
   */
  off(type: GameEventType, handler: EventHandler): void {
    const typeListeners = this.listeners.get(type)
    if (typeListeners) {
      typeListeners.delete(handler)
      if (typeListeners.size === 0) {
        this.listeners.delete(type)
      }
    }
  }

  /**
   * Immediately dispatch an event to all registered listeners.
   * @param type Event type
   * @param payload Event payload data
   */
  emit(type: GameEventType, payload: Record<string, unknown>): void {
    const event: GameEvent = {
      type,
      timestamp: Date.now(),
      payload
    }
    
    const typeListeners = this.listeners.get(type)
    if (typeListeners) {
      // Create a copy of the set to avoid issues if listeners are added/removed during dispatch
      const listenersCopy = Array.from(typeListeners)
      for (const handler of listenersCopy) {
        try {
          handler(event)
        } catch (error) {
          console.error(`Error in event listener for ${type}:`, error)
        }
      }
    }
  }

  /**
   * Add an event to the queue to be dispatched later.
   * @param type Event type
   * @param payload Event payload data
   */
  queueEvent(type: GameEventType, payload: Record<string, unknown>): void {
    this.queue.push({
      type,
      timestamp: Date.now(),
      payload
    })
  }

  /**
   * Dispatch all queued events in order, then clear the queue.
   */
  flush(): void {
    if (this.queue.length === 0) return

    // Copy queue and clear original so new queued events during dispatch wait for next flush
    const eventsToDispatch = [...this.queue]
    this.queue = []

    for (const event of eventsToDispatch) {
      const typeListeners = this.listeners.get(event.type)
      if (typeListeners) {
        const listenersCopy = Array.from(typeListeners)
        for (const handler of listenersCopy) {
          try {
            handler(event)
          } catch (error) {
            console.error(`Error in event listener for ${event.type}:`, error)
          }
        }
      }
    }
  }

  /**
   * Remove all listeners and clear the event queue.
   */
  clear(): void {
    this.listeners.clear()
    this.queue = []
  }
}

/** Singleton event bus instance */
export const eventBus = new EventBus()
