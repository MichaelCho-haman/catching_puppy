import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const MAX_STAGE = 10

function getDogCount(stage) {
  return stage >= 5 ? 5 : 3
}

function getSlotPositions(count) {
  if (count <= 1) return [50]

  const start = 20
  const end = 80
  const gap = (end - start) / (count - 1)

  return Array.from({ length: count }, (_, idx) => Number((start + gap * idx).toFixed(2)))
}

function createDogs(count) {
  return Array.from({ length: count }, (_, idx) => ({
    id: idx + 1,
    slot: idx,
  }))
}

function shuffleOnce(dogs) {
  if (dogs.length < 2) return dogs

  const next = [...dogs]
  const first = Math.floor(Math.random() * next.length)
  let second = Math.floor(Math.random() * next.length)

  while (second === first) {
    second = Math.floor(Math.random() * next.length)
  }

  const firstSlot = next[first].slot
  next[first] = { ...next[first], slot: next[second].slot }
  next[second] = { ...next[second], slot: firstSlot }

  return next
}

function getShuffleDuration(stage) {
  return Math.min(9800, 3000 + stage * 650)
}

function getShuffleInterval(stage) {
  return Math.max(130, 620 - stage * 45)
}

function App() {
  const [stage, setStage] = useState(1)
  const [dogs, setDogs] = useState(() => createDogs(getDogCount(1)))
  const [targetDogId, setTargetDogId] = useState(null)
  const [phase, setPhase] = useState('ready')
  const [result, setResult] = useState(null)
  const [selectedDogId, setSelectedDogId] = useState(null)
  const [shuffleProgress, setShuffleProgress] = useState(0)

  const feedingTimeoutRef = useRef(null)
  const shuffleTimeoutRef = useRef(null)
  const shuffleIntervalRef = useRef(null)
  const progressIntervalRef = useRef(null)

  const dogCount = getDogCount(stage)
  const slotPositions = useMemo(() => getSlotPositions(dogs.length), [dogs.length])

  const targetDog = dogs.find((dog) => dog.id === targetDogId)
  const targetX = targetDog ? slotPositions[targetDog.slot] : 50

  const clearTimers = () => {
    if (feedingTimeoutRef.current) {
      clearTimeout(feedingTimeoutRef.current)
      feedingTimeoutRef.current = null
    }

    if (shuffleTimeoutRef.current) {
      clearTimeout(shuffleTimeoutRef.current)
      shuffleTimeoutRef.current = null
    }

    if (shuffleIntervalRef.current) {
      clearInterval(shuffleIntervalRef.current)
      shuffleIntervalRef.current = null
    }

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }

  const setupStage = (nextStage) => {
    clearTimers()
    setStage(nextStage)
    setDogs(createDogs(getDogCount(nextStage)))
    setTargetDogId(null)
    setPhase('ready')
    setResult(null)
    setSelectedDogId(null)
    setShuffleProgress(0)
  }

  useEffect(() => {
    return () => clearTimers()
  }, [])

  const startShuffle = (activeStage) => {
    const duration = getShuffleDuration(activeStage)
    const interval = getShuffleInterval(activeStage)
    const startedAt = Date.now()

    setPhase('shuffling')
    setShuffleProgress(0)

    shuffleIntervalRef.current = window.setInterval(() => {
      setDogs((prevDogs) => shuffleOnce(prevDogs))
    }, interval)

    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      const ratio = Math.min(100, (elapsed / duration) * 100)
      setShuffleProgress(ratio)
    }, 40)

    shuffleTimeoutRef.current = window.setTimeout(() => {
      if (shuffleIntervalRef.current) {
        clearInterval(shuffleIntervalRef.current)
        shuffleIntervalRef.current = null
      }

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }

      setShuffleProgress(100)
      setPhase('guessing')
    }, duration)
  }

  const startRound = () => {
    clearTimers()

    const initialDogs = createDogs(dogCount)
    const chosen = initialDogs[Math.floor(Math.random() * initialDogs.length)]

    setDogs(initialDogs)
    setTargetDogId(chosen.id)
    setSelectedDogId(null)
    setResult(null)
    setShuffleProgress(0)
    setPhase('feeding')

    feedingTimeoutRef.current = window.setTimeout(() => {
      startShuffle(stage)
    }, 1300)
  }

  const handleDogPick = (dogId) => {
    if (phase !== 'guessing') return

    const isCorrect = dogId === targetDogId

    setSelectedDogId(dogId)
    setResult(isCorrect ? 'success' : 'fail')

    if (isCorrect && stage === MAX_STAGE) {
      setPhase('finished')
      return
    }

    setPhase('result')
  }

  const actionLabel =
    phase === 'ready'
      ? '게임 시작'
      : phase === 'result' && result === 'success'
        ? '다음 단계'
        : phase === 'result' && result === 'fail'
          ? '현재 단계 다시'
          : phase === 'finished'
            ? '1단계부터 다시'
            : '진행 중...'

  const isActionDisabled = phase === 'feeding' || phase === 'shuffling' || phase === 'guessing'

  const handleAction = () => {
    if (phase === 'ready') {
      startRound()
      return
    }

    if (phase === 'result' && result === 'success') {
      setupStage(stage + 1)
      return
    }

    if (phase === 'result' && result === 'fail') {
      setupStage(stage)
      return
    }

    if (phase === 'finished') {
      setupStage(1)
    }
  }

  const feedbackText =
    phase === 'finished'
      ? '성공! 10단계 클리어입니다.'
      : phase === 'result' && result === 'success'
        ? '정답입니다!'
        : phase === 'result' && result === 'fail'
          ? '실패입니다.'
          : ''

  return (
    <div className="app-shell">
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />

      <main className="game-card">
        <header className="header">
          <h1>껌 먹은 강아지 찾기</h1>
          <p className="description">집중력 미니게임</p>
        </header>

        <section className="stage-row">
          <span>현재 단계</span>
          <strong>{stage} / 10</strong>
        </section>

        <section className="board">
          <div className="track" />

          {phase === 'feeding' && targetDogId && (
            <div className="bone" style={{ '--target-x': `${targetX}%` }}>
              🦴
            </div>
          )}

          {dogs.map((dog) => {
            const isPicked = selectedDogId === dog.id
            const isTarget = targetDogId === dog.id
            const revealTarget = phase === 'result' || phase === 'finished'
            const showTargetBadge = revealTarget && isTarget

            return (
              <button
                key={dog.id}
                type="button"
                className={`dog-character ${
                  phase === 'guessing' ? 'guessing' : ''
                } ${isPicked ? 'picked' : ''} ${showTargetBadge ? 'target' : ''}`}
                style={{ left: `${slotPositions[dog.slot]}%` }}
                onClick={() => handleDogPick(dog.id)}
                disabled={phase !== 'guessing'}
                aria-label={`${dog.id}번 강아지 선택`}
              >
                <span className="puppy">
                  <span className="puppy-emoji">🐶</span>
                </span>
                {showTargetBadge && <span className="target-badge">껌 먹음</span>}
              </button>
            )
          })}
        </section>

        <div className="progress-wrap" aria-hidden={phase !== 'shuffling'}>
          <div className="progress-bar" style={{ width: `${shuffleProgress}%` }} />
        </div>

        {feedbackText && (
          <p className={`result-text ${result === 'success' || phase === 'finished' ? 'success' : 'fail'}`}>
            {feedbackText}
          </p>
        )}

        <section className="controls">
          <button type="button" className="action-btn" onClick={handleAction} disabled={isActionDisabled}>
            {actionLabel}
          </button>
        </section>
      </main>
    </div>
  )
}

export default App
