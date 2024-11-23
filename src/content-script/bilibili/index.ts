let maxRunTime = 20
let timer = setInterval(() => {
  if (maxRunTime-- == 0) return window.clearInterval(timer)
  // @ts-ignore
  let livePlayer = window.livePlayer
  const playerInfo = livePlayer?.getPlayerInfo() || {}
  const { qualityCandidates, liveStatus, playingStatus } = playerInfo
  if (liveStatus && playingStatus && Array.isArray(qualityCandidates)) {
    window.clearInterval(timer)
    window.setTimeout(() => {
      livePlayer?.switchQuality(qualityCandidates[0]?.qn)
    }, 2000)
  }
}, 300)

export {}
