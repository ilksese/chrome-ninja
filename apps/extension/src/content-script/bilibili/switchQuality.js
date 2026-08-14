let maxRunTime = 20
let timer = setInterval(async () => {
  if (maxRunTime-- == 0) return window.clearInterval(timer)
  let videoPlayer = window.player
  let maxQuality = window.__playinfo__?.data.accept_quality?.[0]
  if (videoPlayer && maxQuality) {
    videoPlayer.requestQuality?.(maxQuality).finally(() => {
      window.clearInterval(timer)
    })
    return
  }
  let livePlayer = window.livePlayer
  if (!livePlayer) {
    return
  }
  const playerInfo = livePlayer?.getPlayerInfo() || {}
  const { qualityCandidates, liveStatus, playingStatus } = playerInfo
  if (liveStatus && playingStatus && Array.isArray(qualityCandidates)) {
    window.clearInterval(timer)
    window.setTimeout(() => {
      livePlayer?.switchQuality(qualityCandidates[0]?.qn)
    }, 2000)
  }
}, 300)
