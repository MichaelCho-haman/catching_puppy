import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const MAX_STAGE = 100

function clampStage(value) {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(MAX_STAGE, Math.floor(value)))
}

function getInitialStageFromQuery() {
  if (typeof window === 'undefined') return 1

  const params = new URLSearchParams(window.location.search)
  const stageParam = Number(params.get('stage'))

  return clampStage(stageParam)
}

function getDogCount(stage) {
  return stage >= 5 ? 5 : 3
}

function getSlotPositions(count) {
  if (count <= 1) return [50]

  const start = 15
  const end = 85
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
  const sharedStartStage = getInitialStageFromQuery()

  const [stage, setStage] = useState(sharedStartStage)
  const [dogs, setDogs] = useState(() => createDogs(getDogCount(sharedStartStage)))
  const [targetDogId, setTargetDogId] = useState(null)
  const [phase, setPhase] = useState('ready')
  const [result, setResult] = useState(null)
  const [selectedDogId, setSelectedDogId] = useState(null)
  const [shuffleProgress, setShuffleProgress] = useState(0)
  const [shareFeedback, setShareFeedback] = useState('')

  const feedingTimeoutRef = useRef(null)
  const shuffleTimeoutRef = useRef(null)
  const shuffleIntervalRef = useRef(null)
  const progressIntervalRef = useRef(null)

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
    const safeStage = clampStage(nextStage)

    clearTimers()
    setStage(safeStage)
    setDogs(createDogs(getDogCount(safeStage)))
    setTargetDogId(null)
    setPhase('ready')
    setResult(null)
    setSelectedDogId(null)
    setShuffleProgress(0)
  }

  useEffect(() => {
    return () => clearTimers()
  }, [])

  useEffect(() => {
    if (!shareFeedback) return

    const timer = window.setTimeout(() => {
      setShareFeedback('')
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [shareFeedback])

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

  const startRound = (forcedStage = stage) => {
    clearTimers()

    const currentStage = clampStage(forcedStage)
    const currentDogs = createDogs(getDogCount(currentStage))
    const chosen = currentDogs[Math.floor(Math.random() * currentDogs.length)]

    setStage(currentStage)
    setDogs(currentDogs)
    setTargetDogId(chosen.id)
    setSelectedDogId(null)
    setResult(null)
    setShuffleProgress(0)
    setPhase('feeding')

    feedingTimeoutRef.current = window.setTimeout(() => {
      startShuffle(currentStage)
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

  const buildShareUrl = () => {
    if (typeof window === 'undefined') return ''

    const url = new URL(`${window.location.origin}${window.location.pathname}`)
    url.searchParams.set('stage', String(stage))

    return url.toString()
  }

  const handleShare = async () => {
    const shareUrl = buildShareUrl()

    if (!shareUrl) return

    try {
      if (navigator.share) {
        await navigator.share({
          title: '껌 먹은 강아지 찾기',
          text: `${stage}단계부터 바로 도전해보세요!`,
          url: shareUrl,
        })
        setShareFeedback('공유가 완료되었습니다.')
        return
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        setShareFeedback('공유 링크를 복사했습니다.')
        return
      }

      setShareFeedback('이 브라우저에서는 공유를 지원하지 않습니다.')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      setShareFeedback('공유 중 오류가 발생했습니다. 다시 시도해 주세요.')
    }
  }

  const showEndOptions = phase === 'finished' || (phase === 'result' && result === 'fail')
  const showPrimaryAction = phase === 'ready' || (phase === 'result' && result === 'success')

  const primaryActionLabel = phase === 'ready' ? '게임 시작' : '다음 단계'

  const handlePrimaryAction = () => {
    if (phase === 'ready') {
      startRound(stage)
      return
    }

    if (phase === 'result' && result === 'success') {
      setupStage(stage + 1)
    }
  }

  const feedbackText =
    phase === 'finished'
      ? '축하합니다! 100단계를 클리어하셨습니다.'
      : phase === 'result' && result === 'success'
        ? '정답입니다! 다음 단계로 이동하세요.'
        : phase === 'result' && result === 'fail'
          ? '게임 종료! 다시 선택해 주세요.'
          : ''

  const canShare = phase !== 'feeding' && phase !== 'shuffling'

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
          <div className="stage-info">
            <span>현재 단계</span>
            <strong>{stage} / 100</strong>
          </div>
          <button type="button" className="share-btn" onClick={handleShare} disabled={!canShare}>
            공유하기
          </button>
        </section>

        {sharedStartStage > 1 && phase === 'ready' && (
          <p className="shared-stage-note">친구가 공유한 {sharedStartStage}단계부터 시작할 수 있습니다.</p>
        )}

        {shareFeedback && <p className="share-feedback">{shareFeedback}</p>}

        <section className="board">
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
                  <span className="puppy-face">
                    <span className="puppy-brows" />
                    <span className="puppy-eyes" />
                    <span className="puppy-muzzle">
                      <span className="puppy-nose" />
                      <span className="puppy-mouth" />
                    </span>
                    <span className="puppy-blush left" />
                    <span className="puppy-blush right" />
                  </span>
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
          {showPrimaryAction && (
            <button type="button" className="action-btn" onClick={handlePrimaryAction}>
              {primaryActionLabel}
            </button>
          )}

          {showEndOptions && (
            <div className="end-actions">
              <button type="button" className="action-btn secondary" onClick={() => startRound(1)}>
                처음부터
              </button>
              <button type="button" className="action-btn" onClick={() => startRound(stage)}>
                이 단계부터 하기
              </button>
            </div>
          )}

          {!showPrimaryAction && !showEndOptions && (
            <button type="button" className="action-btn" disabled>
              진행 중...
            </button>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
