/**
 * カメラで撮った写真をアップロードできる大きさに落とす。
 *
 * スマホの写真は3〜5MBあり、Vercelのリクエスト上限（4.5MB）に当たる。
 * iPhoneはHEICで撮るので、そのままではAPIが受け取れない形式でもある。
 * canvas に描き直すと、縮小と JPEG 化を同時に片付けられる。
 */

/** Claudeが内部で縮小する境界。これより大きく送っても情報は増えず、転送量だけ増える。 */
const MAX_EDGE = 1568

const QUALITY = 0.82

export type ShrunkImage = { data: string; mediaType: 'image/jpeg' }

/** 縦横比を保ったまま、長辺を max に収める大きさを返す。小さい画像は拡大しない。 */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }

  const scale = max / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** 画像ファイルを、base64（データURLの接頭辞なし）のJPEGにして返す。 */
export async function shrinkToBase64(file: File): Promise<ShrunkImage> {
  const url = URL.createObjectURL(file)
  try {
    const image = await load(url)
    const size = fitWithin(image.naturalWidth, image.naturalHeight, MAX_EDGE)

    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.drawImage(image, 0, 0, size.width, size.height)

    return { data: canvas.toDataURL('image/jpeg', QUALITY).split(',')[1], mediaType: 'image/jpeg' }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('decode failed'))
    image.src = url
  })
}
