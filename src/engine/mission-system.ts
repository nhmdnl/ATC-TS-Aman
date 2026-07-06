import type { Mission, GameStateSnapshot } from './types'

export class MissionSystem {
  private activeMissionIndex = 0
  private missions: Mission[] = [
    {
      id: 'tut_1',
      name: 'First Steps',
      state: 'INACTIVE',
      objectives: [
        {
          id: 'tut_1_obj_1',
          description: 'Select an aircraft by clicking it',
          completed: false,
          check: (state: GameStateSnapshot) => Array.from(state.aircraft.values()).some(a => a.isSelected)
        },
        {
          id: 'tut_1_obj_2',
          description: 'Issue any command',
          completed: false,
          check: (state: GameStateSnapshot) => state.score > 1000 // Simple check: score went up from initial
        }
      ]
    }
  ]

  getActiveMission(): Mission | null {
    if (this.activeMissionIndex < this.missions.length) {
      return this.missions[this.activeMissionIndex]
    }
    return null
  }

  update(state: GameStateSnapshot): void {
    const mission = this.getActiveMission()
    if (!mission) return

    if (mission.state === 'INACTIVE') {
      mission.state = 'ACTIVE'
    }

    let allCompleted = true
    for (const obj of mission.objectives) {
      if (!obj.completed) {
        if (obj.check(state)) {
          obj.completed = true
        } else {
          allCompleted = false
        }
      }
    }

    if (allCompleted) {
      mission.state = 'COMPLETED'
      this.activeMissionIndex++
    }
  }

  reset(): void {
    this.activeMissionIndex = 0
    for (const mission of this.missions) {
      mission.state = 'INACTIVE'
      for (const obj of mission.objectives) {
        obj.completed = false
      }
    }
  }
}

export const missionSystem = new MissionSystem()
