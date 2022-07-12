import { Page } from "puppeteer-core"

export async function userAgent(page: Page, userAgent?: string, locale?: string) {
  let ua =
    userAgent ||
    (await page.browser().userAgent()).replace('HeadlessChrome/', 'Chrome/')

  if (
    ua.includes('Linux') &&
    !ua.includes('Android')
  ) {
    ua = ua.replace(/\(([^)]+)\)/, '(Windows NT 10.0; Win64; x64)')
  }

  // @ts-ignore
  const uaVersion = ua.includes('Chrome/')
    // @ts-ignore
    ? ua.match(/Chrome\/([\d|.]+)/)[1]
    // @ts-ignore
    : (await page.browser().version()).match(/\/([\d|.]+)/)?.[1] ?? ''

  const getPlatform = (extended = false) => {
    if (ua.includes('Mac OS X')) {
      return extended ? 'Mac OS X' : 'MacIntel'
    } else if (ua.includes('Android')) {
      return 'Android'
    } else if (ua.includes('Linux')) {
      return 'Linux'
    } else {
      return extended ? 'Windows' : 'Win32'
    }
  }

  // https://source.chromium.org/chromium/chromium/src/+/master:components/embedder_support/user_agent_utils.cc;l=55-100
  const getBrands = () => {
    const seed = uaVersion.split('.')[0]

    const order = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0]
      // @ts-ignore
    ][seed % 6]
    const escapedChars = [' ', ' ', ';']

    const greaseyBrand = `${escapedChars[order[0]]}Not${
      escapedChars[order[1]]
    }A${escapedChars[order[2]]}Brand`

    const greasedBrandVersionList = []
    greasedBrandVersionList[order[0]] = {
      brand: greaseyBrand,
      version: '99'
    }
    greasedBrandVersionList[order[1]] = {
      brand: 'Chromium',
      version: seed
    }
    greasedBrandVersionList[order[2]] = {
      brand: 'Google Chrome',
      version: seed
    }

    return greasedBrandVersionList
  }

  const padPlatformVersion = (version: string) => version+((version.split('.').length<=2)?'.0':'')

  const getPlatformVersion = () => {
    if (ua.includes('Mac OS X ')) {
      // @ts-ignore
      return padPlatformVersion(ua.match(/Mac OS X ([^)]+)/)[1])
    } else if (ua.includes('Android ')) {
      // @ts-ignore
      return padPlatformVersion(ua.match(/Android ([^;]+)/)[1])
    } else if (ua.includes('Windows ')) {
      // @ts-ignore
      return padPlatformVersion(ua.match(/Windows .*?([\d|.]+);?/)[1])
    }

    return ''
  }

  const getPlatformArch = () => (getMobile() ? '' : 'x86')

  // @ts-ignore
  const getPlatformModel = () =>
    getMobile() ? ua.match(/Android.*?;\s([^)]+)/)[1] : ''

  const getMobile = () => ua.includes('Android')

  const override = {
    userAgent: ua,
    platform: getPlatform(),
    acceptLanguage: locale || 'en-US,en',
    userAgentMetadata: {
      brands: getBrands(),
      fullVersion: uaVersion,
      platform: getPlatform(true),
      platformVersion: getPlatformVersion(),
      architecture: getPlatformArch(),
      model: getPlatformModel(),
      mobile: getMobile()
    }
  } as any;

  (page as any)._client.send('Network.setUserAgentOverride', override)
}
