import { GameStage } from './components/GameStage'
import { ComboCorner, TopCenterHud, TopLeftHud, TopRightHud } from './components/hud/HudCorners'
import { ModifierTray } from './components/hud/ModifierTray'
import { ModifierToast, StatusOverlay } from './components/hud/Overlays'
import { useGameEngine } from './hooks/useGameEngine'

function App() {
  const { canvasRef, hud, modifiers, toast, handlePointerMove, handleAction, handleRestart } = useGameEngine()

  return (
    <div className="app">
      <div className="app__bg" />

      <TopLeftHud hud={hud} />
      <TopCenterHud hud={hud} />
      <TopRightHud hud={hud} />
      <ComboCorner hud={hud} />

      <div className="hud-corner hud-corner--bottom-left">
        <ModifierTray modifiers={modifiers} />
      </div>

      <div className="app__stage-wrap">
        <GameStage canvasRef={canvasRef} onPointerMove={handlePointerMove} onAction={handleAction}>
          <StatusOverlay hud={hud} onAction={handleAction} onRestart={handleRestart} />
          <ModifierToast toast={toast} />
        </GameStage>
      </div>
    </div>
  )
}

export default App
