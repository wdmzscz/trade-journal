import { useEffect, useState } from 'react'

const QUERY = '(pointer: coarse), (max-width: 1023px)'

export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  )

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const onChange = () => setCoarse(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return coarse
}
