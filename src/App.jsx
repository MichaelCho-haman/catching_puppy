import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const MAX_STAGE = 100
const STORAGE_NICKNAME_KEY = 'catchingPuppyNickname'
const STORAGE_LEADERBOARD_KEY = 'catchingPuppyLeaderboardV1'

function clampStage(value) {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(MAX_STAGE, Math.floor(value)))
}

function clampScore(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(MAX_STAGE, Math.floor(value)))
}

function normalizeNickname(value) {
  return value.trim().replace(/\s+/g, ' ')
}

function isValidNickname(value) {
  const length = normalizeNickname(value).length
  return length >= 2 && length <= 12
}

function sanitizeLeaderboard(data) {
  if (!Array.isArray(data)) return []

  const entries = data
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null

      const nickname = normalizeNickname(String(item.nickname || ''))
      if (!nickname) return null

      const score = clampScore(Number(item.score))
      const playedAt = Number.isFinite(Number(item.playedAt))
        ? Number(item.playedAt)
        : Date.now() - index * 1000

      return {
        nickname,
        score,
        playedAt,
      }
    })
    .filter(Boolean)

  return entries
    .sort((a, b) => b.score - a.score || a.playedAt - b.playedAt)
    .slice(0, 100)
}

function loadLeaderboardFromStorage() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_LEADERBOARD_KEY)
    if (!raw) return []

    return sanitizeLeaderboard(JSON.parse(raw))
  } catch {
    return []
  }
}

function saveLeaderboardToStorage(leaderboard) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_LEADERBOARD_KEY, JSON.stringify(leaderboard))
  } catch {
    // ignore storage write errors
  }
}

function loadNicknameFromStorage() {
  if (typeof window === 'undefined') return ''

  try {
    return normalizeNickname(window.localStorage.getItem(STORAGE_NICKNAME_KEY) || '')
  } catch {
    return ''
  }
}

function saveNicknameToStorage(nickname) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_NICKNAME_KEY, nickname)
  } catch {
    // ignore storage write errors
  }
}

function parseSharedRankingFromUrl() {
  if (typeof window === 'undefined') return []

  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('view') !== 'ranking') return []

    const rawRanking = params.get('ranking')
    if (!rawRanking) return []

    return sanitizeLeaderboard(JSON.parse(rawRanking))
  } catch {
    return []
  }
}

function buildUpdatedLeaderboard(current, nickname, score) {
  const normalizedNickname = normalizeNickname(nickname)
  const normalizedLower = normalizedNickname.toLowerCase()
  const next = [...current]

  const existingIndex = next.findIndex((item) => item.nickname.toLowerCase() === normalizedLower)

  if (existingIndex >= 0) {
    const existing = next[existingIndex]

    if (score > existing.score) {
      next[existingIndex] = {
        ...existing,
        score,
        playedAt: Date.now(),
      }
    }
  } else {
    next.push({
      nickname: normalizedNickname,
      score,
      playedAt: Date.now(),
    })
  }

  return sanitizeLeaderboard(next)
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
  const [boot] = useState(() => {
    const loadedLeaderboard = loadLeaderboardFromStorage()
    const sharedRanking = parseSharedRankingFromUrl()
    const loadedNickname = loadNicknameFromStorage()

    return {
      localLeaderboard: loadedLeaderboard,
      displayLeaderboard: sharedRanking.length > 0 ? sharedRanking : loadedLeaderboard,
      isSharedRanking: sharedRanking.length > 0,
      nickname: loadedNickname,
    }
  })

  const [stage, setStage] = useState(1)
  const [dogs, setDogs] = useState(() => createDogs(getDogCount(1)))
  const [targetDogId, setTargetDogId] = useState(null)
  const [phase, setPhase] = useState(boot.isSharedRanking ? 'ranking' : 'ready')
  const [result, setResult] = useState(null)
  const [selectedDogId, setSelectedDogId] = useState(null)
  const [shuffleProgress, setShuffleProgress] = useState(0)

  const [nickname, setNickname] = useState(boot.nickname)
  const [nicknameInput, setNicknameInput] = useState(boot.nickname)
  const [nicknameCheckStatus, setNicknameCheckStatus] = useState('idle')
  const [nicknameCheckMessage, setNicknameCheckMessage] = useState('')
  const [checkedNickname, setCheckedNickname] = useState('')
  const [showNicknameSetup, setShowNicknameSetup] = useState(!boot.nickname)
  const [pendingStartAfterNickname, setPendingStartAfterNickname] = useState(false)

  const [localLeaderboard, setLocalLeaderboard] = useState(boot.localLeaderboard)
  const [displayLeaderboard, setDisplayLeaderboard] = useState(boot.displayLeaderboard)
  const [isSharedRanking, setIsSharedRanking] = useState(boot.isSharedRanking)
  const [lastScore, setLastScore] = useState(null)
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
    setShareFeedback('')
    setPhase('feeding')

    feedingTimeoutRef.current = window.setTimeout(() => {
      startShuffle(currentStage)
    }, 1300)
  }

  const finishGame = (score) => {
    clearTimers()

    const finalScore = clampScore(score)
    const updated = buildUpdatedLeaderboard(localLeaderboard, nickname, finalScore)

    setLocalLeaderboard(updated)
    setDisplayLeaderboard(updated)
    setLastScore(finalScore)
    setIsSharedRanking(false)
    setPhase('ranking')
    saveLeaderboardToStorage(updated)

    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }

  const handleDogPick = (dogId) => {
    if (phase !== 'guessing') return

    const isCorrect = dogId === targetDogId

    setSelectedDogId(dogId)
    setResult(isCorrect ? 'success' : 'fail')

    if (isCorrect && stage === MAX_STAGE) {
      finishGame(MAX_STAGE)
      return
    }

    if (!isCorrect) {
      finishGame(stage - 1)
      return
    }

    setPhase('result')
  }

  const collectNicknamePool = () => {
    const all = [...localLeaderboard, ...displayLeaderboard]
    return new Set(all.map((entry) => entry.nickname.toLowerCase()))
  }

  const handleCheckNickname = () => {
    const normalized = normalizeNickname(nicknameInput)

    if (!isValidNickname(normalized)) {
      setNicknameCheckStatus('invalid')
      setCheckedNickname('')
      setNicknameCheckMessage('닉네임은 2~12자로 입력해 주세요.')
      return
    }

    const lower = normalized.toLowerCase()
    const currentLower = nickname.toLowerCase()
    const taken = collectNicknamePool().has(lower) && lower !== currentLower

    if (taken) {
      setNicknameCheckStatus('duplicate')
      setCheckedNickname('')
      setNicknameCheckMessage('이미 사용 중인 닉네임입니다.')
      return
    }

    setNicknameCheckStatus('ok')
    setCheckedNickname(normalized)
    setNicknameCheckMessage('사용 가능한 닉네임입니다.')
  }

  const handleConfirmNickname = () => {
    const normalized = normalizeNickname(nicknameInput)

    if (nicknameCheckStatus !== 'ok' || checkedNickname !== normalized) {
      setNicknameCheckStatus('invalid')
      setNicknameCheckMessage('중복 확인 후 저장해 주세요.')
      return
    }

    setNickname(normalized)
    setNicknameInput(normalized)
    saveNicknameToStorage(normalized)
    setShowNicknameSetup(false)
    setNicknameCheckMessage('')

    if (pendingStartAfterNickname) {
      setPendingStartAfterNickname(false)
      setShareFeedback('')
      setLastScore(null)
      setIsSharedRanking(false)
      startRound(1)
    }
  }

  const handleNicknameInputChange = (event) => {
    setNicknameInput(event.target.value)
    setNicknameCheckStatus('idle')
    setNicknameCheckMessage('')
    setCheckedNickname('')
  }

  const buildShareRankingUrl = () => {
    if (typeof window === 'undefined') return ''

    const payload = displayLeaderboard.slice(0, 20).map((item) => ({
      nickname: item.nickname,
      score: item.score,
      playedAt: item.playedAt,
    }))

    const url = new URL(`${window.location.origin}${window.location.pathname}`)
    url.searchParams.set('view', 'ranking')
    url.searchParams.set('ranking', JSON.stringify(payload))

    return url.toString()
  }

  const handleShareRanking = async () => {
    const shareUrl = buildShareRankingUrl()

    if (!shareUrl) return

    try {
      if (navigator.share) {
        await navigator.share({
          title: '껌 먹은 강아지 찾기 랭킹',
          text: '랭킹을 확인하고 바로 도전해보세요!',
          url: shareUrl,
        })
        setShareFeedback('랭킹을 공유했습니다.')
        return
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        setShareFeedback('랭킹 링크를 복사했습니다.')
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

  const handleStartFromRanking = () => {
    if (!nickname) {
      setPendingStartAfterNickname(true)
      setShowNicknameSetup(true)
      return
    }

    setShareFeedback('')
    setLastScore(null)
    setIsSharedRanking(false)
    startRound(1)
  }

  const handlePrimaryAction = () => {
    if (phase === 'ready') {
      if (!nickname) {
        setPendingStartAfterNickname(true)
        setShowNicknameSetup(true)
        return
      }

      startRound(stage)
      return
    }

    if (phase === 'result' && result === 'success') {
      setupStage(stage + 1)
    }
  }

  const feedbackText =
    phase === 'result' && result === 'success' ? '정답입니다! 다음 단계로 이동하세요.' : ''

  const showRanking = phase === 'ranking'
  const showPrimaryAction = phase === 'ready' || (phase === 'result' && result === 'success')
  const primaryActionLabel = phase === 'ready' ? '게임 시작' : '다음 단계'

  return (
    <div className="app-shell">
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />

      <main className="game-card">
        <header className="header">
          <h1>껌 먹은 강아지 찾기</h1>
          <p className="description">집중력 미니게임</p>
        </header>

        {!showRanking && (
          <>
            <section className="stage-row">
              <div className="stage-info">
                <span>현재 단계</span>
                <strong>{stage} / 100</strong>
              </div>
              <span className="nickname-chip">{nickname || '닉네임 미설정'}</span>
            </section>

            <section className="board">
              {phase === 'feeding' && targetDogId && (
                <div className="bone" style={{ '--target-x': `${targetX}%` }}>
                  🦴
                </div>
              )}

              {dogs.map((dog) => {
                const isPicked = selectedDogId === dog.id
                const isTarget = targetDogId === dog.id
                const revealTarget = phase === 'result'
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

            {feedbackText && <p className="result-text success">{feedbackText}</p>}

            <section className="controls">
              {showPrimaryAction && (
                <button type="button" className="action-btn" onClick={handlePrimaryAction}>
                  {primaryActionLabel}
                </button>
              )}

              {!showPrimaryAction && (
                <button type="button" className="action-btn" disabled>
                  진행 중...
                </button>
              )}
            </section>
          </>
        )}

        {showRanking && (
          <section className="ranking-panel">
            <div className="ranking-header">
              <h2>{isSharedRanking ? '공유받은 랭킹' : '게임 종료 랭킹'}</h2>
              {lastScore !== null && <p>내 최고 기록: {lastScore}단계</p>}
            </div>

            {isSharedRanking && <p className="shared-stage-note">공유받은 랭킹입니다. 바로 게임을 시작할 수 있습니다.</p>}

            <ol className="ranking-list">
              {displayLeaderboard.slice(0, 10).map((item, index) => (
                <li key={`${item.nickname}-${item.playedAt}`} className="ranking-item">
                  <span className="rank-order">{index + 1}</span>
                  <span className="rank-name">{item.nickname}</span>
                  <strong className="rank-score">{item.score}단계</strong>
                </li>
              ))}
            </ol>

            {displayLeaderboard.length === 0 && (
              <p className="empty-ranking">아직 랭킹 데이터가 없습니다. 첫 기록을 만들어보세요.</p>
            )}

            <div className="ranking-actions">
              <button type="button" className="action-btn" onClick={handleStartFromRanking}>
                게임 시작하기
              </button>
              <button type="button" className="share-btn" onClick={handleShareRanking}>
                랭킹 공유하기
              </button>
            </div>

            {shareFeedback && <p className="share-feedback">{shareFeedback}</p>}
          </section>
        )}
      </main>

      {showNicknameSetup && (
        <section className="nickname-overlay" role="dialog" aria-modal="true" aria-label="닉네임 설정">
          <div className="nickname-modal">
            <h2>닉네임 설정</h2>
            <p>처음 이용 시 닉네임을 입력하고 중복 확인을 진행해 주세요.</p>
            <input
              className="nickname-input"
              type="text"
              value={nicknameInput}
              onChange={handleNicknameInputChange}
              placeholder="닉네임 (2~12자)"
              maxLength={12}
            />
            <button type="button" className="check-btn" onClick={handleCheckNickname}>
              중복 확인
            </button>

            {nicknameCheckMessage && (
              <p className={`nickname-msg ${nicknameCheckStatus === 'ok' ? 'ok' : 'warn'}`}>
                {nicknameCheckMessage}
              </p>
            )}

            <button type="button" className="action-btn" onClick={handleConfirmNickname}>
              저장하고 시작하기
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

export default App
